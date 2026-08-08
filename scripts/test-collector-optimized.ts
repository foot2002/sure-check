/**
 * Optimized collector retest (≤ midscale API budget of 36).
 * Compares against midscale baseline constants.
 * Never prints secrets.
 *
 * Usage: npx tsx scripts/test-collector-optimized.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCollectorConfigured } from "../lib/collector/config";
import { runCollection } from "../lib/collector/runCollection";
import { getCollectorQueryCount } from "../lib/collector/searchQueries";
import { createSupabaseServerClient } from "../lib/supabase/server";
import {
  aggregateQueryPerformance,
  getCollectorSummary,
} from "../lib/collector/queries";
import { classifyUrlKind } from "../lib/collector/platformDetect";
import { processSurveyCandidate } from "../lib/collector/processCandidate";
import { isUrlLikeTitle } from "../lib/collector/titleUtils";
import { markIgnoredTestSurveyLinks } from "../lib/collector/repository";
import type { CollectionQueryStatRow } from "../lib/collector/types";

/** Mid-scale baseline (prior successful run). */
const BASELINE = {
  apiCalls: 36,
  resultsCount: 720,
  candidateLinksCount: 19,
  newSurveysCount: 19,
  candidateConversion: 19 / 720,
  newSurveyConversion: 19 / 19,
};

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]?.trim()) {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  loadLocalEnvFiles();
  if (!isCollectorConfigured()) {
    console.error("Collector not configured");
    process.exit(1);
  }

  await markIgnoredTestSurveyLinks();

  console.log("=== optimized collector retest ===");
  console.log(`query set size: ${getCollectorQueryCount()}`);
  console.log(`baseline apiCalls: ${BASELINE.apiCalls}`);

  const result = await runCollection({
    trigger: "admin",
    maxApiCalls: 36,
  });

  if (!result.ok) {
    console.error("run failed:", result.error);
    process.exit(1);
  }

  const stats = result.stats;
  const apiCalls = stats.apiCalls ?? 0;
  const candidateConversion =
    stats.resultsCount > 0
      ? stats.candidateLinksCount / stats.resultsCount
      : 0;
  const newSurveyConversion =
    stats.candidateLinksCount > 0
      ? stats.newSurveysCount / stats.candidateLinksCount
      : 0;

  const summary = await getCollectorSummary();
  const inMemoryPerf = aggregateQueryPerformance(
    (stats.queryStats || []).map(
      (row, i): CollectionQueryStatRow => ({
        ...row,
        id: `mem-${i}`,
        created_at: new Date().toISOString(),
      }),
    ),
  );
  const queryPerformance =
    summary.lastRunQueryPerformance.length > 0
      ? summary.lastRunQueryPerformance
      : inMemoryPerf;
  const supabase = createSupabaseServerClient();
  const { data: links } = await supabase
    .from("survey_links")
    .select("canonical_url, original_url, platform, status, title")
    .neq("status", "ignored");

  const byPlatform = { google_forms: 0, naver_form: 0, moaform: 0 };
  const byStatus: Record<string, number> = {};
  let titleAsUrl = 0;
  let falsePositiveInDefault = 0;
  let platformMatch = 0;
  let platformChecked = 0;
  let statusMatch = 0;
  let statusChecked = 0;
  let unreachable = 0;

  for (const row of links || []) {
    const status = String(row.status);
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (status === "unreachable") {
      unreachable += 1;
      continue;
    }
    const plat = row.platform as keyof typeof byPlatform;
    if (plat in byPlatform) byPlatform[plat] += 1;
    if (isUrlLikeTitle(row.title)) titleAsUrl += 1;

    const kind = classifyUrlKind(String(row.canonical_url));
    if (status === "active" || status === "discovered") {
      if (kind === "unsupported") falsePositiveInDefault += 1;
    }

    if (status === "invalid") {
      platformChecked += 1;
      if (kind === "unsupported") platformMatch += 1;
      continue;
    }

    if (
      status === "active" ||
      status === "closed" ||
      status === "restricted"
    ) {
      platformChecked += 1;
      if (kind === row.platform) platformMatch += 1;

      const processed = await processSurveyCandidate({
        rawUrl: String(row.canonical_url),
      });
      const re =
        processed.ok
          ? processed.status
          : processed.status ||
            (processed.stage === "format" ? "invalid" : "unreachable");
      if (re === "unreachable") {
        unreachable += 1;
        continue;
      }
      // discovered is intentionally unverified — exclude from status accuracy
      statusChecked += 1;
      if (re === status) statusMatch += 1;
    }
  }

  // canonical/source dups
  const urls = (links || []).map((l) => String(l.canonical_url));
  const canonDup =
    urls.length - new Set(urls).size;
  const { data: sources } = await supabase
    .from("survey_sources")
    .select("source_url");
  const sourceUrls = (sources || []).map((s) => String(s.source_url));
  const sourceDup = sourceUrls.length - new Set(sourceUrls).size;

  const { count: runningCount } = await supabase
    .from("collection_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const report = {
    queriesConfigured: getCollectorQueryCount(),
    before: BASELINE,
    after: {
      apiCalls,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      skippedKnownSources: stats.skippedKnownSources || 0,
      unreachableCount: stats.unreachableCount || 0,
      errorCount: stats.errorCount,
      candidateConversion,
      newSurveyConversion,
      byPlatform,
      byStatus,
      falsePositiveRate:
        (links || []).filter((l) =>
          ["active", "discovered"].includes(String(l.status)),
        ).length > 0
          ? falsePositiveInDefault /
            (links || []).filter((l) =>
              ["active", "discovered"].includes(String(l.status)),
            ).length
          : 0,
      titleAsUrl,
      canonicalDup: canonDup,
      sourceDup,
      runningCount: runningCount ?? 0,
      platformAccuracy:
        platformChecked > 0 ? platformMatch / platformChecked : null,
      statusAccuracy: statusChecked > 0 ? statusMatch / statusChecked : null,
      unreachableUnverified: unreachable,
      note: "unreachable excluded from confirmed-survey accuracy denominators where noted",
    },
    queryPerformance,
    topQueries: queryPerformance
      .filter(
        (q) =>
          q.tier === "keep" || q.newSurveyCount > 0 || q.candidateCount > 0,
      )
      .slice(0, 5),
    bottomQueries: [...queryPerformance]
      .sort(
        (a, b) =>
          a.candidateCount - b.candidateCount ||
          a.newSurveyCount - b.newSurveyCount,
      )
      .slice(0, 5),
    runStatus: result.run.status,
    migration006Note:
      summary.lastRunQueryStats.length === 0
        ? "collection_query_stats 미적용 — 인메모리 통계로 보고. Supabase에서 006 SQL 실행 필요"
        : "collection_query_stats OK",
  };

  const out = resolve(process.cwd(), "scripts/tmp-optimized-retest.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
