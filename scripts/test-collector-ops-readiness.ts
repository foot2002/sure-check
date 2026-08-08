/**
 * Ops readiness: DB consistency audit + query-stats probe (no secrets).
 * Usage: npx tsx scripts/test-collector-ops-readiness.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { getCollectorSummary } from "../lib/collector/queries";
import { isCollectorConfigured } from "../lib/collector/config";
import { runCollection } from "../lib/collector/runCollection";
import { listQueryStatsForRun } from "../lib/collector/repository";

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

async function auditDbConsistency() {
  const supabase = createSupabaseServerClient();

  // Same filters as previous report discrepancy:
  // A) platform with DEFAULT excludeInvalid (active|discovered|closed|restricted|unreachable)
  // B) platform with ALL statuses
  // C) each status count
  const platforms = ["google_forms", "naver_form", "moaform"] as const;
  const statuses = [
    "active",
    "discovered",
    "closed",
    "restricted",
    "unreachable",
    "invalid",
    "ignored",
  ] as const;

  const defaultStatusFilter = [
    "active",
    "discovered",
    "closed",
    "restricted",
    "unreachable",
  ];

  const platformDefault: Record<string, number> = {};
  const platformAll: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const p of platforms) {
    const { count: cDef } = await supabase
      .from("survey_links")
      .select("id", { count: "exact", head: true })
      .eq("platform", p)
      .in("status", defaultStatusFilter);
    platformDefault[p] = cDef ?? 0;

    const { count: cAll } = await supabase
      .from("survey_links")
      .select("id", { count: "exact", head: true })
      .eq("platform", p);
    platformAll[p] = cAll ?? 0;
  }

  for (const s of statuses) {
    const { count } = await supabase
      .from("survey_links")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    byStatus[s] = count ?? 0;
  }

  const { count: totalAll } = await supabase
    .from("survey_links")
    .select("id", { count: "exact", head: true });

  const { count: totalDefault } = await supabase
    .from("survey_links")
    .select("id", { count: "exact", head: true })
    .in("status", defaultStatusFilter);

  const sumPlatformDefault = Object.values(platformDefault).reduce((a, b) => a + b, 0);
  const sumPlatformAll = Object.values(platformAll).reduce((a, b) => a + b, 0);
  const sumStatus = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return {
    filters: {
      platformDefault:
        "eq(platform) AND status IN (active,discovered,closed,restricted,unreachable) — countSurveyLinks({platform}) default",
      platformAll: "eq(platform) only — excludeInvalid:false",
      byStatus: "eq(status) for each status including invalid+ignored",
      totalAll: "no status filter",
      totalDefault:
        "status IN (active,discovered,closed,restricted,unreachable)",
    },
    platformDefault,
    platformAll,
    byStatus,
    totals: {
      totalAll: totalAll ?? 0,
      totalDefault: totalDefault ?? 0,
      sumPlatformDefault,
      sumPlatformAll,
      sumStatus,
    },
    checks: {
      platformDefaultEqualsTotalDefault: sumPlatformDefault === (totalDefault ?? 0),
      platformAllEqualsTotalAll: sumPlatformAll === (totalAll ?? 0),
      statusSumEqualsTotalAll: sumStatus === (totalAll ?? 0),
      mismatchExplained:
        "이전 보고의 플랫폼 합(289)은 invalid·ignored 제외 필터였고, 상태별 합(300+)은 invalid·ignored를 포함해 불일치처럼 보였음",
    },
  };
}

async function main() {
  loadLocalEnvFiles();
  if (!isCollectorConfigured()) {
    console.error("Collector not configured");
    process.exit(1);
  }

  console.log("=== DB consistency audit (before collect) ===");
  const consistencyBefore = await auditDbConsistency();
  console.log(JSON.stringify(consistencyBefore, null, 2));

  console.log("\n=== manual collection run ===");
  const result = await runCollection({ trigger: "admin", maxApiCalls: 36 });
  if (!result.ok) {
    console.error("collect failed", result.error);
    process.exit(1);
  }

  const runId = result.run.id;
  const queryStats = await listQueryStatsForRun(runId);
  const keys = queryStats.map(
    (r) => `${r.collectionRunId}|${r.searchQuery}|${r.sourceType}`,
  );
  const uniqueKeys = new Set(keys);

  const sumResults = queryStats.reduce((a, r) => a + r.resultsCount, 0);
  const sumCandidates = queryStats.reduce((a, r) => a + r.candidateCount, 0);
  const sumNew = queryStats.reduce((a, r) => a + r.newSurveyCount, 0);
  const sumDup = queryStats.reduce((a, r) => a + r.duplicateSurveyCount, 0);

  const queryStatsCheck = {
    runId,
    queryStatRows: queryStats.length,
    uniqueRunQuerySource: uniqueKeys.size,
    noDuplicateCombo: keys.length === uniqueKeys.size,
    run: {
      results_count: result.run.results_count,
      candidate_links_count: result.run.candidate_links_count,
      new_surveys_count: result.run.new_surveys_count,
      duplicate_surveys_count: result.run.duplicate_surveys_count,
    },
    queryStatsSums: {
      resultsCount: sumResults,
      candidateCount: sumCandidates,
      newSurveyCount: sumNew,
      duplicateSurveyCount: sumDup,
    },
    matches: {
      results: sumResults === result.run.results_count,
      candidates: sumCandidates === result.run.candidate_links_count,
      // new/dup may differ slightly if unreachable excluded from run counters vs query rows
      new: sumNew === result.run.new_surveys_count,
      duplicate: sumDup === result.run.duplicate_surveys_count,
    },
    inMemoryApiCalls: result.stats.apiCalls,
    stats: result.stats,
  };

  const summary = await getCollectorSummary();
  const consistencyAfter = await auditDbConsistency();

  const report = {
    queryStatsCheck,
    consistencyBefore,
    consistencyAfter,
    summaryVerification: summary.verification,
    lastRunHasQueryStats: summary.lastRunHasQueryStats,
    lastRunId: summary.lastRun?.id,
  };

  const out = resolve(process.cwd(), "scripts/tmp-ops-readiness.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
