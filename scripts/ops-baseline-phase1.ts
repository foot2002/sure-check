/**
 * PHASE 1 — Production baseline snapshot (read-only).
 * Does not mutate DB or enqueue diagnoses.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bestTriageAcrossSources,
  type TriageQueue,
} from "@/lib/collector/candidateTriage";
import { isEligibleTriage } from "@/lib/collector/diagnosisBridge";
import {
  classifyLimitedOutcome,
  emptyLimitedOutcomeCounts,
} from "@/lib/report/limitedOutcomeBuckets";
import {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_INLINE_PAGE_VALIDATE_BUDGET,
  COLLECTOR_UNREACHABLE_BATCH_SIZE,
} from "@/lib/collector/opsPolicy";
import { COLLECTOR_PARTITION_CANARY_QUOTAS } from "@/lib/collector/partitionCanaryQuota";
import { COLLECTOR_CANARY, getCanaryDailyCaps } from "@/lib/collector/canaryPolicy";
import {
  COLLECTOR_DIAGNOSIS_BACKPRESSURE_PENDING,
  COLLECTOR_DIAGNOSIS_DAILY_MAX,
  COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
} from "@/lib/collector/diagnosisBridge";

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

function kstTodayBounds(): { startIso: string; endIso: string; date: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const date = `${y}-${m}-${d}`;
  return {
    date,
    startIso: new Date(`${date}T00:00:00+09:00`).toISOString(),
    endIso: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

async function countExact(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: string,
  filters?: (q: any) => any,
): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const supabase = createSupabaseServerClient();
  const today = kstTodayBounds();
  const since7d = daysAgoIso(7);
  const chunk = 200;

  const statuses = [
    "discovered",
    "active",
    "closed",
    "restricted",
    "unreachable",
    "invalid",
    "ignored",
  ] as const;

  const statusCounts: Record<string, number> = {};
  for (const s of statuses) {
    statusCounts[s] = await countExact(supabase, "survey_links", (q) =>
      q.eq("status", s),
    );
  }
  const totalLinks = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const { data: activeLinks, error: activeErr } = await supabase
    .from("survey_links")
    .select("id, platform, status, title, canonical_url")
    .eq("status", "active");
  if (activeErr) throw new Error(activeErr.message);

  const activeIds = (activeLinks || []).map((r) => r.id as string);
  const sourcesBySurvey = new Map<string, any[]>();
  for (let i = 0; i < activeIds.length; i += chunk) {
    const slice = activeIds.slice(i, i + chunk);
    const { data: srcRows, error: srcErr } = await supabase
      .from("survey_sources")
      .select(
        "survey_link_id, source_url, source_title, source_type, source_published_at, search_query",
      )
      .in("survey_link_id", slice);
    if (srcErr) throw new Error(srcErr.message);
    for (const row of srcRows || []) {
      const list = sourcesBySurvey.get(row.survey_link_id) || [];
      list.push(row);
      sourcesBySurvey.set(row.survey_link_id, list);
    }
  }

  const triageCounts: Record<TriageQueue, number> = {
    A_PRIORITY: 0,
    B_PRIORITY: 0,
    C_ARCHIVE: 0,
  };
  const aOrgCounts: Record<string, number> = {
    public: 0,
    company: 0,
    university_official: 0,
    other: 0,
  };
  const eligibleActive: Array<{
    id: string;
    platform: string;
    organization: string;
  }> = [];

  for (const link of activeLinks || []) {
    const sources = sourcesBySurvey.get(link.id) || [];
    const triage = bestTriageAcrossSources(
      sources.map((s) => ({
        sourceUrl: s.source_url,
        sourceTitle: s.source_title,
        sourceType: s.source_type,
        sourcePublishedAt: s.source_published_at,
        searchQuery: s.search_query,
        surveyTitle: link.title,
      })),
    );
    triageCounts[triage.queue] += 1;
    if (triage.queue === "A_PRIORITY") {
      const org = triage.organization;
      if (org in aOrgCounts) aOrgCounts[org] += 1;
      else aOrgCounts.other += 1;
    }
    if (isEligibleTriage(triage)) {
      eligibleActive.push({
        id: link.id,
        platform: link.platform || "unknown",
        organization: triage.organization,
      });
    }
  }

  const eligibleIds = eligibleActive.map((e) => e.id);
  const blocked = new Set<string>();
  for (let i = 0; i < eligibleIds.length; i += chunk) {
    const slice = eligibleIds.slice(i, i + chunk);
    const { data: links, error } = await supabase
      .from("survey_diagnosis_links")
      .select("survey_link_id, status")
      .in("survey_link_id", slice)
      .in("status", [
        "queued",
        "running",
        "completed",
        "limited",
        "failed_final",
      ]);
    if (error) throw new Error(error.message);
    for (const row of links || []) blocked.add(row.survey_link_id);
  }

  const backlog = eligibleActive.filter((e) => !blocked.has(e.id));
  const backlogByPlatform: Record<string, number> = {};
  for (const row of backlog) {
    const p = row.platform || "unknown";
    backlogByPlatform[p] = (backlogByPlatform[p] || 0) + 1;
  }

  const { data: runs7d, error: runsErr } = await supabase
    .from("collection_runs")
    .select(
      "id, status, started_at, completed_at, results_count, candidate_links_count, new_surveys_count, error_summary, error_count",
    )
    .gte("started_at", since7d)
    .order("started_at", { ascending: false });
  if (runsErr) throw new Error(runsErr.message);

  const { data: qstats7d, error: qsErr } = await supabase
    .from("collection_query_stats")
    .select(
      "results_count, candidate_count, valid_survey_count, new_survey_count, created_at",
    )
    .gte("created_at", since7d);
  if (qsErr) console.warn("collection_query_stats:", qsErr.message);

  let searchResults7d = 0;
  let newSurveysFromStats7d = 0;
  let validFromStats7d = 0;
  let pageValidates7d = 0;
  for (const row of qstats7d || []) {
    searchResults7d += row.results_count || 0;
    newSurveysFromStats7d += row.new_survey_count || 0;
    validFromStats7d += row.valid_survey_count || 0;
    pageValidates7d += row.candidate_count || 0;
  }

  const newUrls7d = await countExact(supabase, "survey_links", (q) =>
    q.gte("first_discovered_at", since7d),
  );
  const activeTransitions7d = await countExact(supabase, "survey_links", (q) =>
    q.eq("status", "active").gte("updated_at", since7d),
  );

  let stuckRuns = 0;
  let runResults7d = 0;
  let runNewSurveys7d = 0;
  for (const run of runs7d || []) {
    runResults7d += run.results_count || 0;
    runNewSurveys7d += run.new_surveys_count || 0;
    if (run.status === "running") {
      const ageMs = Date.now() - new Date(run.started_at).getTime();
      if (ageMs > 30 * 60 * 1000) stuckRuns += 1;
    }
  }

  const { data: diag7d, error: diagErr } = await supabase
    .from("survey_diagnosis_links")
    .select(
      "id, survey_link_id, status, created_at, updated_at, started_at, completed_at, skip_reason, last_error",
    )
    .gte("created_at", since7d);
  if (diagErr) throw new Error(diagErr.message);

  const outcome7d = emptyLimitedOutcomeCounts();
  const durations: number[] = [];
  let duplicateEnqueueProxy = 0;
  const surveyDiagCount = new Map<string, number>();

  for (const row of diag7d || []) {
    const reasonText = [row.skip_reason, row.last_error]
      .filter(Boolean)
      .join(" ");
    const bucket = classifyLimitedOutcome({
      diagnosisStatus:
        row.status === "completed"
          ? "completed"
          : row.status === "limited"
            ? "limited"
            : row.status === "failed_final"
              ? "failed"
              : null,
      limitedReason: reasonText,
      errorMessage: row.last_error,
      scanStatus: row.status,
    });
    if (row.status === "completed") outcome7d.normal_diagnosis += 1;
    else if (row.status === "limited" || row.status === "failed_final") {
      outcome7d[bucket] += 1;
    }

    const start = row.started_at || row.created_at;
    const end = row.completed_at || row.updated_at;
    if (start && end && row.status !== "queued" && row.status !== "running") {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms > 0 && ms < 30 * 60 * 1000) durations.push(ms);
    }
    surveyDiagCount.set(
      row.survey_link_id,
      (surveyDiagCount.get(row.survey_link_id) || 0) + 1,
    );
  }
  for (const n of surveyDiagCount.values()) {
    if (n > 1) duplicateEnqueueProxy += n - 1;
  }
  durations.sort((a, b) => a - b);

  const { data: records7d, error: recErr } = await supabase
    .from("survey_records")
    .select(
      "id, platform, overall_risk_level, user_decision_label, observed_date_kst, created_at",
    )
    .gte("created_at", since7d);
  if (recErr) console.warn("survey_records:", recErr.message);

  const recordOutcomes = emptyLimitedOutcomeCounts();
  for (const row of records7d || []) {
    const bucket = classifyLimitedOutcome({
      overallRiskLevel: row.overall_risk_level,
      userDecisionLabel: row.user_decision_label,
    });
    recordOutcomes[bucket] += 1;
  }

  const { data: stuckJobs, error: stuckErr } = await supabase
    .from("scan_jobs")
    .select("id, status, created_at, updated_at")
    .in("status", ["queued", "running"])
    .lt("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if (stuckErr) console.warn("stuck jobs:", stuckErr.message);

  // A_PRIORITY transitions approx: active A eligible first_discovered in 7d
  let aPriorityNew7d = 0;
  for (const link of activeLinks || []) {
    // counted via new active with A triage among recently updated — approximate below
  }
  void aPriorityNew7d;

  const recentlyActiveA = await (async () => {
    const { data, error } = await supabase
      .from("survey_links")
      .select("id, title, platform, first_discovered_at, updated_at")
      .eq("status", "active")
      .gte("updated_at", since7d);
    if (error) {
      console.warn("recent active:", error.message);
      return 0;
    }
    let count = 0;
    const ids = (data || []).map((r) => r.id as string);
    const srcMap = new Map<string, any[]>();
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const { data: srcRows } = await supabase
        .from("survey_sources")
        .select(
          "survey_link_id, source_url, source_title, source_type, source_published_at, search_query",
        )
        .in("survey_link_id", slice);
      for (const row of srcRows || []) {
        const list = srcMap.get(row.survey_link_id) || [];
        list.push(row);
        srcMap.set(row.survey_link_id, list);
      }
    }
    for (const link of data || []) {
      const triage = bestTriageAcrossSources(
        (srcMap.get(link.id) || []).map((s) => ({
          sourceUrl: s.source_url,
          sourceTitle: s.source_title,
          sourceType: s.source_type,
          sourcePublishedAt: s.source_published_at,
          searchQuery: s.search_query,
          surveyTitle: link.title,
        })),
      );
      if (triage.queue === "A_PRIORITY") count += 1;
    }
    return count;
  })();

  const config = {
    diagnosisDailyMax: COLLECTOR_DIAGNOSIS_DAILY_MAX,
    diagnosisBatch: COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
    diagnosisBackpressure: COLLECTOR_DIAGNOSIS_BACKPRESSURE_PENDING,
    canary: COLLECTOR_CANARY,
    canaryCaps: getCanaryDailyCaps(true),
    partitionQuotas: COLLECTOR_PARTITION_CANARY_QUOTAS,
    inlineValidateBudget: COLLECTOR_INLINE_PAGE_VALIDATE_BUDGET,
    revalidateDiscoveredBatch: COLLECTOR_DISCOVERED_BATCH_SIZE,
    revalidateUnreachableBatch: COLLECTOR_UNREACHABLE_BATCH_SIZE,
    revalidateWavesPerDay: 3,
    approxValidationPerDay: COLLECTOR_DISCOVERED_BATCH_SIZE * 3,
    vercelMaxDuration: {
      runAB: 300,
      revalidate: 120,
      diagnosisDispatch: 300,
    },
  };

  const baseline = {
    capturedAt: new Date().toISOString(),
    kstDate: today.date,
    config,
    surveyLinks: {
      total: totalLinks,
      ...statusCounts,
    },
    activeTriage: {
      ...triageCounts,
      aPriorityOrgs: aOrgCounts,
      diagnosisEligibleActive: eligibleActive.length,
    },
    diagnosisBacklog: {
      total: backlog.length,
      byPlatform: backlogByPlatform,
    },
    last7d: {
      searchResultsFromQueryStats: searchResults7d,
      searchResultsFromRuns: runResults7d,
      newUrls: newUrls7d,
      newSurveysFromQueryStats: newSurveysFromStats7d,
      newSurveysFromRuns: runNewSurveys7d,
      pageValidateCandidatesFromQueryStats: pageValidates7d,
      validSurveyFromQueryStats: validFromStats7d,
      activeUpdatedApprox: activeTransitions7d,
      aPriorityActiveUpdatedApprox: recentlyActiveA,
      collectionRuns: (runs7d || []).length,
      stuckCollectionRuns: stuckRuns,
      diagnosisAttempts: (diag7d || []).length,
      diagnosisOutcomesFromLinks: outcome7d,
      surveyRecordOutcomes: recordOutcomes,
      avgDiagnosisDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
      p50DiagnosisDurationMs: percentile(durations, 50),
      p95DiagnosisDurationMs: percentile(durations, 95),
      maxDiagnosisDurationMs:
        durations.length > 0 ? durations[durations.length - 1] : null,
      stuckScanJobs: (stuckJobs || []).length,
      duplicateEnqueueProxy,
    },
  };

  const outPath = resolve(
    process.cwd(),
    "scripts/ops-baseline-phase1-result.json",
  );
  writeFileSync(outPath, JSON.stringify(baseline, null, 2), "utf8");
  console.log(JSON.stringify(baseline, null, 2));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
