/**
 * Dry-run / apply: active survey_links with clear diagnosis closed/restricted → status.
 * Never updates on js/extraction/timeout ambiguous reasons.
 *
 *   npx tsx scripts/backfill-collector-status-from-diagnosis.ts --dry-run
 *   npx tsx scripts/backfill-collector-status-from-diagnosis.ts --apply
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { planCollectorStatusFeedback } from "../lib/collector/diagnosisStatusFeedback";
import { collectorFeedbackFromLimitedReason } from "../lib/report/limitedOutcomeBuckets";

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
      )
        v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createClient(url, key);

  const { data: links, error } = await supabase
    .from("survey_diagnosis_links")
    .select(
      "id, survey_link_id, status, report_id, survey_links!inner(id, status, canonical_url)",
    )
    .eq("status", "limited")
    .limit(500);

  if (error) throw new Error(error.message);

  const candidates: Array<{
    surveyLinkId: string;
    url: string;
    collectorStatus: string;
    limitedReason: string | null;
  }> = [];

  for (const row of links || []) {
    const sl = row.survey_links as unknown as {
      id: string;
      status: string;
      canonical_url: string;
    } | null;
    if (!sl || sl.status !== "active") continue;
    let limitedReason: string | null = null;
    if (row.report_id) {
      const { data: report } = await supabase
        .from("scan_reports")
        .select("report_json, limited_reason")
        .eq("id", row.report_id)
        .maybeSingle();
      const rj = (report?.report_json as Record<string, unknown> | null) || null;
      const form = (rj?.form as Record<string, unknown> | undefined) || undefined;
      limitedReason =
        (typeof report?.limited_reason === "string" && report.limited_reason) ||
        (typeof rj?.limitedReason === "string" && rj.limitedReason) ||
        (typeof form?.limitedReason === "string" && form.limitedReason) ||
        null;
    }
    const target = collectorFeedbackFromLimitedReason(limitedReason);
    if (!target) continue;
    candidates.push({
      surveyLinkId: sl.id,
      url: sl.canonical_url,
      collectorStatus: sl.status,
      limitedReason,
    });
  }

  const byId = new Map<string, (typeof candidates)[0]>();
  for (const c of candidates) {
    if (!byId.has(c.surveyLinkId)) byId.set(c.surveyLinkId, c);
  }

  const plans = [];
  for (const c of byId.values()) {
    const plan = await planCollectorStatusFeedback({
      surveyLinkId: c.surveyLinkId,
      limitedReason: c.limitedReason,
      dryRun,
    });
    plans.push({
      url: c.url,
      ...plan,
    });
  }

  const would = plans.filter((p) => p.reason === "dry_run_would_update" || p.applied);
  const out = {
    mode: dryRun ? "dry_run" : "apply",
    candidate_unique: byId.size,
    would_update: would.length,
    applied: plans.filter((p) => p.applied).length,
    sample: plans.slice(0, 30),
  };
  writeFileSync(
    resolve("scripts/tmp-backfill-collector-status.json"),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
