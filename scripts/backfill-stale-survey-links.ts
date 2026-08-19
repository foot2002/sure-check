/**
 * Reclassify old / closed / restricted / personal-research survey_links.
 *
 *   npx tsx scripts/backfill-stale-survey-links.ts
 *   npx tsx scripts/backfill-stale-survey-links.ts --summary
 *   npx tsx scripts/backfill-stale-survey-links.ts --verbose
 *   npx tsx scripts/backfill-stale-survey-links.ts --apply --summary
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { looksLikePersonalResearch } from "../lib/collector/candidateTriage";
import { evaluateSurveyFreshness } from "../lib/collector/surveyFreshness";
import type { CollectorSurveyStatus } from "../lib/collector/types";

const DEFAULT_SAMPLE_LIMIT = 5;

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

type PlannedStatus = Exclude<
  CollectorSurveyStatus,
  "discovered" | "active" | "unreachable" | "invalid"
>;

type PlannedRow = {
  id: string;
  url: string;
  from: string;
  to: PlannedStatus;
  reason: string;
};

function compactCounts(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    if (value > 0) out[key] = value;
  }
  return out;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function planStatus(input: {
  title: string | null;
  url: string;
  status: string;
}): { next: PlannedStatus; reason: string } | null {
  const title = input.title || "";
  const freshness = evaluateSurveyFreshness({
    title,
    snippet: title,
    url: input.url,
    mode: "search",
  });
  if (looksLikePersonalResearch(title) || freshness.reasonCode === "personal_research") {
    return { next: "ignored", reason: "personal_research" };
  }
  if (freshness.status === "closed" || freshness.availabilityStatus === "closed") {
    return { next: "closed", reason: freshness.reasonCode };
  }
  if (freshness.status === "restricted" || freshness.availabilityStatus === "restricted") {
    return { next: "restricted", reason: freshness.reasonCode };
  }
  if (freshness.status === "stale" || freshness.availabilityStatus === "stale") {
    return { next: "stale", reason: freshness.reasonCode };
  }
  if (freshness.reasonCode === "stale_year" || freshness.reasonCode === "stale_topic_year") {
    return { next: "stale", reason: freshness.reasonCode };
  }
  return null;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const summaryOnly = process.argv.includes("--summary");
  const verbose = process.argv.includes("--verbose");
  const dryRun = !apply;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createClient(url, key);
  const pageSize = 200;
  let offset = 0;
  let scanned = 0;
  const planned: PlannedRow[] = [];
  const counts: Record<string, number> = {
    closed: 0,
    restricted: 0,
    stale: 0,
    ignored: 0,
  };

  while (true) {
    const { data, error } = await supabase
      .from("survey_links")
      .select("id, canonical_url, title, status, freshness")
      .in("status", ["active", "discovered"])
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const row of rows) {
      const plan = planStatus({
        title: (row.title as string) || null,
        url: String(row.canonical_url),
        status: String(row.status),
      });
      if (!plan) continue;
      if (plan.next === String(row.status)) continue;
      counts[plan.next] = (counts[plan.next] || 0) + 1;
      planned.push({
        id: String(row.id),
        url: String(row.canonical_url),
        from: String(row.status),
        to: plan.next,
        reason: plan.reason,
      });
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break;
  }

  const byStatus = compactCounts(counts);
  const sampleLimit = verbose ? planned.length : DEFAULT_SAMPLE_LIMIT;
  const sample = planned.slice(0, sampleLimit);

  if (dryRun) {
    const payload: Record<string, unknown> = {
      mode: "dry_run",
      scanned,
      would_change: planned.length,
      by_status: byStatus,
      sample_count: sample.length,
      next_action: "검토 후 --apply 실행",
    };
    if (!summaryOnly) payload.sample = sample;
    printJson(payload);
    return;
  }

  let applied = 0;
  let failed = 0;
  const failedRows: Array<{ id: string; error: string }> = [];
  for (const row of planned) {
    const freshness = evaluateSurveyFreshness({
      title: row.url,
      snippet: row.reason,
      url: row.url,
      mode: "search",
    });
    let { error } = await supabase
      .from("survey_links")
      .update({
        status: row.to,
        freshness: freshness.record,
      })
      .eq("id", row.id);
    if (
      error &&
      row.to === "stale" &&
      /status/i.test(error.message) &&
      /check|violat/i.test(error.message)
    ) {
      ({ error } = await supabase
        .from("survey_links")
        .update({ status: "ignored", freshness: freshness.record })
        .eq("id", row.id));
    }
    if (error) {
      failed += 1;
      failedRows.push({ id: row.id, error: error.message });
      continue;
    }
    applied += 1;
  }

  const payload: Record<string, unknown> = {
    mode: "apply",
    scanned,
    applied,
    failed,
    by_status: byStatus,
  };
  if (!summaryOnly) {
    payload.sample_count = sample.length;
    payload.sample = sample;
  }
  if (verbose && failedRows.length > 0) payload.failed_rows = failedRows;
  printJson(payload);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
