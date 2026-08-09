import { bestTriageAcrossSources } from "@/lib/collector/candidateTriage";
import { COLLECTOR_DIAGNOSIS_DAILY_MAX } from "@/lib/collector/diagnosisBridge";
import {
  countDiagnosisLinksByStatus,
  countDiagnosisLinksCreatedInKstDay,
  findDiagnosisLinksBySurveyIds,
  findSurveyIdsWithBlockingDiagnosis,
  type SurveyDiagnosisLinkRow,
} from "@/lib/collector/diagnosisLinkRepository";
import { classifyLimitedOutcome } from "@/lib/report/limitedOutcomeBuckets";
import type {
  CollectorPlatform,
  CollectorSummary,
  CollectorSurveyStatus,
  CollectionQueryStatRow,
  QueryPerformanceRow,
  QueryPerformanceTier,
  SurveyLinkListFilters,
  SurveyLinkListItem,
  SurveySourceRow,
} from "@/lib/collector/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getLatestCollectionRun,
  countSurveyLinks,
  listQueryStatsForRun,
} from "@/lib/collector/repository";

const STUCK_JOB_MS = 30 * 60 * 1000;
/** Cap for diagnosis-backlog / A_PRIORITY approx samples (avoid full active scans). */
const OPS_ACTIVE_SAMPLE_LIMIT = 400;

function startOfTodayKstIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00+09:00`).toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function classifyQueryTier(row: {
  candidateCount: number;
  validSurveyCount: number;
  newSurveyCount: number;
  invalidCount: number;
  duplicateSurveyCount: number;
}): QueryPerformanceTier {
  if (row.validSurveyCount > 0 || row.newSurveyCount > 0) return "keep";
  if (row.candidateCount === 0) return "stop_review";
  if (
    row.invalidCount > 0 ||
    row.duplicateSurveyCount >= row.candidateCount ||
    row.validSurveyCount === 0
  ) {
    return "improve";
  }
  return "improve";
}

export function aggregateQueryPerformance(
  stats: CollectionQueryStatRow[],
): QueryPerformanceRow[] {
  const byQuery = new Map<
    string,
    {
      resultsCount: number;
      candidateCount: number;
      validSurveyCount: number;
      newSurveyCount: number;
      duplicateSurveyCount: number;
      invalidCount: number;
      unreachableCount: number;
      errorCount: number;
      skippedKnownSourceCount: number;
    }
  >();

  for (const row of stats) {
    const cur = byQuery.get(row.searchQuery) || {
      resultsCount: 0,
      candidateCount: 0,
      validSurveyCount: 0,
      newSurveyCount: 0,
      duplicateSurveyCount: 0,
      invalidCount: 0,
      unreachableCount: 0,
      errorCount: 0,
      skippedKnownSourceCount: 0,
    };
    cur.resultsCount += row.resultsCount;
    cur.candidateCount += row.candidateCount;
    cur.validSurveyCount += row.validSurveyCount;
    cur.newSurveyCount += row.newSurveyCount;
    cur.duplicateSurveyCount += row.duplicateSurveyCount;
    cur.invalidCount += row.invalidCount;
    cur.unreachableCount += row.unreachableCount;
    cur.errorCount += row.errorCount;
    cur.skippedKnownSourceCount += row.skippedKnownSourceCount;
    byQuery.set(row.searchQuery, cur);
  }

  const rows: QueryPerformanceRow[] = [];
  for (const [searchQuery, cur] of byQuery) {
    const candidateConversionRate =
      cur.resultsCount > 0 ? cur.candidateCount / cur.resultsCount : 0;
    const newSurveyConversionRate =
      cur.candidateCount > 0 ? cur.newSurveyCount / cur.candidateCount : 0;
    rows.push({
      searchQuery,
      ...cur,
      candidateConversionRate,
      newSurveyConversionRate,
      tier: classifyQueryTier(cur),
    });
  }

  return rows.sort(
    (a, b) =>
      b.newSurveyCount - a.newSurveyCount ||
      b.validSurveyCount - a.validSurveyCount ||
      b.candidateConversionRate - a.candidateConversionRate,
  );
}

export async function getCollectorSummary(): Promise<CollectorSummary> {
  const platforms: CollectorPlatform[] = [
    "google_forms",
    "naver_form",
    "moaform",
  ];
  const statuses: CollectorSurveyStatus[] = [
    "active",
    "discovered",
    "closed",
    "restricted",
    "unreachable",
    "invalid",
    "ignored",
  ];
  const byPlatform = {
    google_forms: 0,
    naver_form: 0,
    moaform: 0,
  } as Record<CollectorPlatform, number>;
  const byPlatformAll = {
    google_forms: 0,
    naver_form: 0,
    moaform: 0,
  } as Record<CollectorPlatform, number>;
  const byStatus: Partial<Record<CollectorSurveyStatus, number>> = {};

  const [
    totalSurveys,
    totalLinksAll,
    todayNew,
    last7DaysNew,
    lastRun,
    verifiedSurveys,
    unreachableSurveys,
    ...rest
  ] = await Promise.all([
    // Legacy "survey-ish" total (excludes invalid/ignored) — kept for trend cards
    countSurveyLinks(),
    // Full table count for consistency
    countSurveyLinks({ excludeInvalid: false }),
    countSurveyLinks({ sinceIso: startOfTodayKstIso() }),
    countSurveyLinks({ sinceIso: daysAgoIso(7) }),
    getLatestCollectionRun(),
    countSurveyLinks({
      status: ["active", "closed", "restricted"],
      excludeInvalid: false,
    }),
    countSurveyLinks({ status: "unreachable", excludeInvalid: false }),
    // Platform with default filter (excludes invalid/ignored) — historical cards
    ...platforms.map((platform) => countSurveyLinks({ platform })),
    // Platform ALL statuses — must sum to totalLinksAll
    ...platforms.map((platform) =>
      countSurveyLinks({ platform, excludeInvalid: false }),
    ),
    ...statuses.map((status) =>
      countSurveyLinks({ status, excludeInvalid: false }),
    ),
  ]);

  platforms.forEach((platform, index) => {
    byPlatform[platform] = rest[index] ?? 0;
    byPlatformAll[platform] = rest[platforms.length + index] ?? 0;
  });
  statuses.forEach((status, index) => {
    byStatus[status] = rest[platforms.length * 2 + index] ?? 0;
  });

  const active = byStatus.active ?? 0;
  const closed = byStatus.closed ?? 0;
  const restricted = byStatus.restricted ?? 0;
  const invalid = byStatus.invalid ?? 0;
  const discovered = byStatus.discovered ?? 0;
  const unreachable = byStatus.unreachable ?? 0;
  const ignored = byStatus.ignored ?? 0;
  const verificationCompleted = active + closed + restricted + invalid;
  const denom = Math.max(totalLinksAll - ignored, 0);
  const verificationCompletionRate =
    denom > 0 ? verificationCompleted / denom : 0;
  const confirmedSurveyRate =
    verificationCompleted > 0
      ? (active + closed + restricted) / verificationCompleted
      : 0;
  const invalidRate =
    verificationCompleted > 0 ? invalid / verificationCompleted : 0;

  let lastRunQueryStats: CollectionQueryStatRow[] = [];
  if (lastRun?.id) {
    lastRunQueryStats = await listQueryStatsForRun(lastRun.id);
  }
  const lastRunQueryPerformance = aggregateQueryPerformance(lastRunQueryStats);
  const topQueries = lastRunQueryPerformance
    .filter(
      (q) =>
        q.tier === "keep" || q.newSurveyCount > 0 || q.candidateCount > 0,
    )
    .slice(0, 5);
  const bottomQueries = [...lastRunQueryPerformance]
    .sort(
      (a, b) =>
        a.candidateCount - b.candidateCount ||
        a.newSurveyCount - b.newSurveyCount ||
        a.candidateConversionRate - b.candidateConversionRate,
    )
    .slice(0, 5);

  const lastRunResults = lastRun?.results_count ?? 0;
  const lastRunCandidates = lastRun?.candidate_links_count ?? 0;
  const lastRunNew = lastRun?.new_surveys_count ?? 0;

  let diagnosis: CollectorSummary["diagnosis"] = {
    queued: 0,
    running: 0,
    completed: 0,
    limited: 0,
    failed: 0,
    skipped: 0,
  };
  try {
    const counts = await countDiagnosisLinksByStatus();
    const today = await countDiagnosisLinksCreatedInKstDay();
    diagnosis = {
      queued: counts.queued,
      running: counts.running,
      completed: counts.completed,
      limited: counts.limited,
      failed: counts.failed_retryable + counts.failed_final,
      skipped: counts.skipped,
      today: {
        kstDate: today.kstDate,
        attempted: today.total,
        completed: today.byStatus.completed,
        limited: today.byStatus.limited,
        failed:
          today.byStatus.failed_retryable + today.byStatus.failed_final,
        dailyMax: COLLECTOR_DIAGNOSIS_DAILY_MAX,
        remaining: Math.max(0, COLLECTOR_DIAGNOSIS_DAILY_MAX - today.total),
      },
    };
  } catch {
    /* migration 007/008 may not be applied yet */
  }

  const monitoring = {
    totalDiscovered: totalLinksAll,
    validActive: active,
    unverified: discovered,
    closed,
    restricted,
    unreachable,
    invalid,
    ignored,
    diagnosisEligibleActive: active,
  };

  const { todayFunnel, qualityKpis } = await buildTodayOpsMetrics({
    todayIso: startOfTodayKstIso(),
    discoveredBacklog: discovered,
    diagnosis,
  });

  return {
    totalSurveys,
    totalLinksAll,
    todayNew,
    last7DaysNew,
    byPlatform,
    byPlatformAll,
    byStatus,
    verifiedSurveys,
    unreachableSurveys,
    monitoring,
    verification: {
      totalLinks: totalLinksAll,
      verificationCompleted,
      unverifiedDiscovered: discovered,
      retryUnreachable: unreachable,
      ignored,
      verificationCompletionRate,
      confirmedSurveyRate,
      invalidRate,
      accuracySampleNote:
        "플랫폼·상태 정확도는 discovered·unreachable을 제외한 검증 완료 표본(active/closed/restricted/invalid)에서만 산출합니다. 유효 수집(monitoring.validActive)은 active만 포함합니다.",
    },
    lastRun,
    lastRunApiCalls: lastRunQueryStats.length,
    lastRunHasQueryStats: lastRunQueryStats.length > 0,
    lastRunQueryStats,
    lastRunQueryPerformance,
    topQueries,
    bottomQueries,
    lastRunCandidateConversionRate:
      lastRunResults > 0 ? lastRunCandidates / lastRunResults : 0,
    lastRunNewSurveyConversionRate:
      lastRunCandidates > 0 ? lastRunNew / lastRunCandidates : 0,
    diagnosis,
    todayFunnel,
    qualityKpis,
  };
}

async function countLinksExact(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  filters: { status?: string; updatedSince?: string } = {},
): Promise<number> {
  let q = supabase
    .from("survey_links")
    .select("id", { count: "exact", head: true });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.updatedSince) q = q.gte("updated_at", filters.updatedSince);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Populate todayFunnel + qualityKpis from existing tables (no migrations).
 * Stage cohorts intentionally differ — UI must not treat them as one pipeline sum.
 */
async function buildTodayOpsMetrics(input: {
  todayIso: string;
  discoveredBacklog: number;
  diagnosis: CollectorSummary["diagnosis"];
}): Promise<{
  todayFunnel: NonNullable<CollectorSummary["todayFunnel"]>;
  qualityKpis: NonNullable<CollectorSummary["qualityKpis"]>;
}> {
  const supabase = createSupabaseServerClient();
  const stuckBeforeIso = new Date(Date.now() - STUCK_JOB_MS).toISOString();

  let searchResults = 0;
  let newUrls = 0;
  let validations = 0;
  let extractionLimitedToday = 0;
  let systemFailureToday = 0;
  let stuckCollectionRuns = 0;
  let stuckScanJobs = 0;
  let diagnosisBacklog = 0;
  let newAPriorityApprox = 0;

  try {
    const { data: runsToday } = await supabase
      .from("collection_runs")
      .select(
        "id, status, started_at, results_count, new_surveys_count, candidate_links_count, queries_count, error_summary",
      )
      .gte("started_at", input.todayIso)
      .limit(200);

    const searchRunIds: string[] = [];
    for (const run of runsToday || []) {
      const isRevalidate = String(run.error_summary || "").startsWith(
        "[revalidate]",
      );
      if (!isRevalidate) {
        searchResults += Number(run.results_count) || 0;
        newUrls += Number(run.new_surveys_count) || 0;
        validations += Number(run.candidate_links_count) || 0;
        if (run.id) searchRunIds.push(String(run.id));
      }
      if (run.status === "running") {
        const ageMs = Date.now() - new Date(String(run.started_at)).getTime();
        if (Number.isFinite(ageMs) && ageMs > STUCK_JOB_MS) {
          stuckCollectionRuns += 1;
        }
      }
    }

    // Prefer query-stats candidate/valid totals when available for today's search runs.
    if (searchRunIds.length > 0) {
      const { data: qstats } = await supabase
        .from("collection_query_stats")
        .select("candidate_count, valid_survey_count, results_count, new_survey_count")
        .in("collection_run_id", searchRunIds.slice(0, 50));
      if (qstats && qstats.length > 0) {
        let cand = 0;
        let valid = 0;
        let results = 0;
        let news = 0;
        for (const row of qstats) {
          cand += Number(row.candidate_count) || 0;
          valid += Number(row.valid_survey_count) || 0;
          results += Number(row.results_count) || 0;
          news += Number(row.new_survey_count) || 0;
        }
        if (results > 0) searchResults = results;
        if (news > 0) newUrls = news;
        if (cand > 0 || valid > 0) {
          validations = cand > 0 ? cand : valid;
        }
      }
    }
  } catch {
    /* collection_query_stats / runs optional */
  }

  // Also catch stuck runs that started before today but are still running.
  try {
    const { count } = await supabase
      .from("collection_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running")
      .lt("started_at", stuckBeforeIso);
    stuckCollectionRuns = Math.max(stuckCollectionRuns, count ?? 0);
  } catch {
    /* ignore */
  }

  try {
    const { count } = await supabase
      .from("scan_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "running"])
      .lt("updated_at", stuckBeforeIso);
    stuckScanJobs = count ?? 0;
  } catch {
    /* ignore */
  }

  const [
    activeTransitions,
    closedToday,
    restrictedToday,
  ] = await Promise.all([
    countLinksExact(supabase, {
      status: "active",
      updatedSince: input.todayIso,
    }),
    countLinksExact(supabase, {
      status: "closed",
      updatedSince: input.todayIso,
    }),
    countLinksExact(supabase, {
      status: "restricted",
      updatedSince: input.todayIso,
    }),
  ]);

  try {
    const { data: diagToday } = await supabase
      .from("survey_diagnosis_links")
      .select("status, skip_reason, last_error")
      .gte("created_at", input.todayIso)
      .limit(500);
    for (const row of diagToday || []) {
      const reasonText = [row.skip_reason, row.last_error]
        .filter(Boolean)
        .join(" ");
      const bucket = classifyLimitedOutcome({
        diagnosisStatus:
          row.status === "completed"
            ? "completed"
            : row.status === "limited"
              ? "limited"
              : row.status === "failed_final" ||
                  row.status === "failed_retryable"
                ? "failed"
                : null,
        limitedReason: reasonText,
        errorMessage: row.last_error,
        scanStatus: String(row.status),
      });
      // closed/restricted diagnosis signals are tracked via survey_links status
      // transitions above — never fold them into system_failure.
      if (bucket === "extraction_limited") extractionLimitedToday += 1;
      else if (bucket === "system_failure") systemFailureToday += 1;
    }
  } catch {
    /* migration 007 optional */
  }

  // diagnosisBacklog: bounded sample of recent actives without blocking linkage.
  // Full undiagnosed-eligible count is too expensive for admin summary.
  try {
    const { data: recentActives } = await supabase
      .from("survey_links")
      .select("id, title, last_discovered_at, discovery_count, updated_at")
      .eq("status", "active")
      .order("last_discovered_at", { ascending: false })
      .limit(OPS_ACTIVE_SAMPLE_LIMIT);
    const ids = (recentActives || []).map((r) => String(r.id));
    const blocked = await findSurveyIdsWithBlockingDiagnosis(ids);
    diagnosisBacklog = ids.filter((id) => !blocked.has(id)).length;

    // newAPriorityApprox: triage today's active transitions (subset of sample).
    const todayActiveIds = (recentActives || [])
      .filter(
        (r) =>
          r.updated_at &&
          String(r.updated_at) >= input.todayIso,
      )
      .map((r) => String(r.id))
      .slice(0, 80);
    if (todayActiveIds.length > 0) {
      const { data: sources } = await supabase
        .from("survey_sources")
        .select(
          "survey_link_id, source_url, source_title, search_query, source_published_at, source_type",
        )
        .in("survey_link_id", todayActiveIds)
        .limit(800);
      const byLink = new Map<string, typeof sources>();
      for (const s of sources || []) {
        const key = String(s.survey_link_id);
        const list = byLink.get(key) || [];
        list.push(s);
        byLink.set(key, list);
      }
      const titleById = new Map(
        (recentActives || []).map((r) => [String(r.id), r.title as string | null]),
      );
      for (const id of todayActiveIds) {
        const srcList = byLink.get(id) || [];
        type SourceLite = {
          source_url?: string | null;
          source_title?: string | null;
          search_query?: string | null;
          source_published_at?: string | null;
          source_type?: string | null;
        };
        const triageInputs: SourceLite[] =
          srcList.length > 0 ? (srcList as SourceLite[]) : [{}];
        const triage = bestTriageAcrossSources(
          triageInputs.map((s) => ({
            sourceUrl: s.source_url || undefined,
            sourceTitle: s.source_title || titleById.get(id),
            surveyTitle: titleById.get(id),
            searchQuery: s.search_query || undefined,
            sourcePublishedAt: s.source_published_at || undefined,
            sourceType:
              (s.source_type as "web" | "blog" | "cafe" | "unknown") ||
              "unknown",
            firstSeenThisRun: false,
          })),
        );
        if (triage.queue === "A_PRIORITY") newAPriorityApprox += 1;
      }
    }
  } catch {
    // Fall back to queued linkage count as a coarse proxy when sample fails.
    diagnosisBacklog = input.diagnosis?.queued ?? 0;
    newAPriorityApprox = 0;
  }

  const diagnosisAttempted = input.diagnosis?.today?.attempted ?? 0;
  const normalDiagnosis = input.diagnosis?.today?.completed ?? 0;
  const diagnosisRemaining =
    input.diagnosis?.today?.remaining ??
    Math.max(0, COLLECTOR_DIAGNOSIS_DAILY_MAX - diagnosisAttempted);
  const systemFailureRateToday =
    diagnosisAttempted > 0 ? systemFailureToday / diagnosisAttempted : 0;

  const todayFunnel: NonNullable<CollectorSummary["todayFunnel"]> = {
    searchResults,
    newUrls,
    validations,
    activeTransitions,
    newAPriorityApprox,
    discoveredBacklog: input.discoveredBacklog,
    diagnosisBacklog,
    diagnosisAttempted,
    normalDiagnosis,
    closedToday,
    restrictedToday,
    extractionLimitedToday,
    systemFailureToday,
    diagnosisRemaining,
  };

  const qualityKpis: NonNullable<CollectorSummary["qualityKpis"]> = {
    stuckCollectionRuns,
    stuckScanJobs,
    systemFailureRateToday,
    extractionLimitedToday,
    diagnosisBacklog,
    discoveredBacklog: input.discoveredBacklog,
    dailyDiagnosisCapacity: COLLECTOR_DIAGNOSIS_DAILY_MAX,
    dailyDiagnosisRemaining: diagnosisRemaining,
  };

  return { todayFunnel, qualityKpis };
}

export async function listSurveyLinks(
  filters: SurveyLinkListFilters = {},
): Promise<SurveyLinkListItem[]> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 300);
  const triageFilter =
    filters.triageQueue && filters.triageQueue !== "all"
      ? filters.triageQueue
      : null;
  // Over-fetch when live-triaging so A/B/C filter still fills the page.
  const fetchLimit = triageFilter ? Math.min(limit * 5, 500) : limit;

  let query = supabase
    .from("survey_links")
    .select("*")
    .order("last_discovered_at", { ascending: false })
    .limit(fetchLimit);

  if (filters.platform && filters.platform !== "all") {
    query = query.eq("platform", filters.platform);
  }
  if (!filters.status || filters.status === "default") {
    query = query.in("status", ["active", "discovered"]);
  } else if (filters.status === "non_invalid") {
    query = query.neq("status", "invalid");
  } else if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.firstDiscoveredFrom) {
    query = query.gte("first_discovered_at", filters.firstDiscoveredFrom);
  }
  if (filters.firstDiscoveredTo) {
    query = query.lte("first_discovered_at", filters.firstDiscoveredTo);
  }
  if (filters.novelty === "new") {
    query = query.eq("discovery_count", 1);
  } else if (filters.novelty === "existing") {
    query = query.gt("discovery_count", 1);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(
      `title.ilike.%${q}%,canonical_url.ilike.%${q}%,original_url.ilike.%${q}%`,
    );
  }

  const { data: links, error } = await query;
  if (error) {
    console.error("[collector] listSurveyLinks", error);
    throw new Error(`수집 설문 목록 조회 실패: ${error.message}`);
  }

  const rows = (links || []) as SurveyLinkListItem[];
  if (rows.length === 0) return [];

  let linkIds = rows.map((r) => r.id);

  if (
    (filters.searchQuery && filters.searchQuery.trim()) ||
    (filters.sourceType && filters.sourceType !== "all")
  ) {
    let sourceQuery = supabase
      .from("survey_sources")
      .select("survey_link_id, source_url, source_title, search_query, source_type")
      .in("survey_link_id", linkIds);

    if (filters.searchQuery?.trim()) {
      sourceQuery = sourceQuery.ilike(
        "search_query",
        `%${filters.searchQuery.trim()}%`,
      );
    }
    if (filters.sourceType && filters.sourceType !== "all") {
      sourceQuery = sourceQuery.eq("source_type", filters.sourceType);
    }

    const { data: sources, error: sourceError } = await sourceQuery;
    if (sourceError) {
      console.error("[collector] listSurveyLinks sources filter", sourceError);
      throw new Error(`출처 필터 조회 실패: ${sourceError.message}`);
    }

    const allowed = new Set(
      (sources || []).map(
        (s: { survey_link_id: string }) => s.survey_link_id,
      ),
    );
    linkIds = linkIds.filter((id) => allowed.has(id));
  }

  const { data: allSources, error: allSourcesError } = await supabase
    .from("survey_sources")
    .select(
      "survey_link_id, source_url, source_title, search_query, source_published_at, source_type, discovered_at",
    )
    .in("survey_link_id", linkIds)
    .order("discovered_at", { ascending: false });

  if (allSourcesError) {
    console.error("[collector] listSurveyLinks source counts", allSourcesError);
  }

  type SrcRow = {
    survey_link_id: string;
    source_url: string;
    source_title: string | null;
    search_query?: string | null;
    source_published_at?: string | null;
    source_type?: string | null;
  };

  const byLink = new Map<
    string,
    {
      count: number;
      sampleUrl: string | null;
      sampleTitle: string | null;
      sources: SrcRow[];
    }
  >();
  for (const source of (allSources || []) as SrcRow[]) {
    const current = byLink.get(source.survey_link_id);
    if (!current) {
      byLink.set(source.survey_link_id, {
        count: 1,
        sampleUrl: source.source_url,
        sampleTitle: source.source_title,
        sources: [source],
      });
    } else {
      current.count += 1;
      current.sources.push(source);
    }
  }

  const allowedSet = new Set(linkIds);
  const mapped = rows
    .filter((row) => allowedSet.has(row.id))
    .map((row) => {
      const meta = byLink.get(row.id);
      const triage = bestTriageAcrossSources(
        (meta?.sources || []).map((s) => ({
          sourceUrl: s.source_url,
          sourceTitle: s.source_title || row.title,
          surveyTitle: row.title,
          searchQuery: s.search_query || undefined,
          sourcePublishedAt: s.source_published_at || undefined,
          sourceType:
            (s.source_type as "web" | "blog" | "cafe" | "unknown") || "unknown",
          firstSeenThisRun: false,
        })),
      );
      return {
        ...row,
        source_count: meta?.count ?? 0,
        sample_source_url: meta?.sampleUrl ?? null,
        sample_source_title: meta?.sampleTitle ?? null,
        triage_queue: triage.queue,
      };
    });

  const triageFiltered = triageFilter
    ? mapped.filter((row) => row.triage_queue === triageFilter)
    : mapped;

  let diagnosisMap = new Map<string, SurveyDiagnosisLinkRow>();
  try {
    diagnosisMap = await findDiagnosisLinksBySurveyIds(
      triageFiltered.map((r) => r.id),
    );
  } catch {
    /* migration 007 optional */
  }

  const supabaseReport = createSupabaseServerClient();
  const completedJobIds = [...diagnosisMap.values()]
    .filter(
      (d) =>
        (d.status === "completed" || d.status === "limited") &&
        d.diagnosis_job_id,
    )
    .map((d) => d.diagnosis_job_id!)
    .slice(0, 80);

  const scoreByJob = new Map<
    string,
    { score: number | null; grade: string | null }
  >();
  if (completedJobIds.length > 0) {
    const { data: jobs } = await supabaseReport
      .from("scan_jobs")
      .select("id, external_scan_id")
      .in("external_scan_id", completedJobIds);
    const jobUuidByExternal = new Map(
      (jobs || []).map((j) => [String(j.external_scan_id), String(j.id)]),
    );
    const uuids = [...jobUuidByExternal.values()];
    if (uuids.length > 0) {
      const { data: reports } = await supabaseReport
        .from("scan_reports")
        .select("scan_job_id, report_json")
        .in("scan_job_id", uuids);
      for (const r of reports || []) {
        const external = [...jobUuidByExternal.entries()].find(
          ([, id]) => id === String(r.scan_job_id),
        )?.[0];
        if (!external) continue;
        const json = r.report_json as {
          score?: number | null;
          grade?: string | null;
        } | null;
        scoreByJob.set(external, {
          score: typeof json?.score === "number" ? json.score : null,
          grade: json?.grade ? String(json.grade) : null,
        });
      }
    }
  }

  const withDiagnosis: SurveyLinkListItem[] = triageFiltered.map((row) => {
    const link = diagnosisMap.get(row.id);
    const scores = link?.diagnosis_job_id
      ? scoreByJob.get(link.diagnosis_job_id)
      : undefined;
    return {
      ...row,
      diagnosis_status: link?.status ?? "undiagnosed",
      diagnosis_job_id: link?.diagnosis_job_id ?? null,
      diagnosis_score:
        link?.status === "completed" ? (scores?.score ?? null) : null,
      diagnosis_grade:
        link?.status === "completed" ? (scores?.grade ?? null) : null,
      diagnosis_completed_at: link?.completed_at ?? null,
      diagnosis_extractor: link?.extractor_key ?? null,
      diagnosis_limited_reason:
        link?.status === "limited"
          ? link.last_error || link.skip_reason || null
          : null,
    };
  });

  const diagnosisFilter = filters.diagnosisStatus;
  const diagnosisFiltered =
    diagnosisFilter && diagnosisFilter !== "all"
      ? withDiagnosis.filter((row) => {
          if (diagnosisFilter === "undiagnosed") {
            return (
              !row.diagnosis_status || row.diagnosis_status === "undiagnosed"
            );
          }
          if (diagnosisFilter === "failed") {
            return (
              row.diagnosis_status === "failed" ||
              row.diagnosis_status === "failed_retryable" ||
              row.diagnosis_status === "failed_final"
            );
          }
          return row.diagnosis_status === diagnosisFilter;
        })
      : withDiagnosis;

  return diagnosisFiltered.slice(0, limit);
}

export async function listSourcesForSurveyLink(
  surveyLinkId: string,
): Promise<SurveySourceRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_sources")
    .select("*")
    .eq("survey_link_id", surveyLinkId)
    .order("discovered_at", { ascending: false });
  if (error) {
    throw new Error(`출처 목록 조회 실패: ${error.message}`);
  }
  return (data as SurveySourceRow[]) || [];
}
