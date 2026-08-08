import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getLatestCollectionRun,
  countSurveyLinks,
  listQueryStatsForRun,
} from "@/lib/collector/repository";
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
        "플랫폼·상태 정확도는 discovered·unreachable을 제외한 검증 완료 표본(active/closed/restricted/invalid)에서만 산출합니다.",
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
  };
}

export async function listSurveyLinks(
  filters: SurveyLinkListFilters = {},
): Promise<SurveyLinkListItem[]> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 300);

  let query = supabase
    .from("survey_links")
    .select("*")
    .order("last_discovered_at", { ascending: false })
    .limit(limit);

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
    .select("survey_link_id, source_url, source_title, discovered_at")
    .in("survey_link_id", linkIds)
    .order("discovered_at", { ascending: false });

  if (allSourcesError) {
    console.error("[collector] listSurveyLinks source counts", allSourcesError);
  }

  const byLink = new Map<
    string,
    { count: number; sampleUrl: string | null; sampleTitle: string | null }
  >();
  for (const source of (allSources || []) as Array<{
    survey_link_id: string;
    source_url: string;
    source_title: string | null;
  }>) {
    const current = byLink.get(source.survey_link_id);
    if (!current) {
      byLink.set(source.survey_link_id, {
        count: 1,
        sampleUrl: source.source_url,
        sampleTitle: source.source_title,
      });
    } else {
      current.count += 1;
    }
  }

  const allowedSet = new Set(linkIds);
  return rows
    .filter((row) => allowedSet.has(row.id))
    .map((row) => {
      const meta = byLink.get(row.id);
      return {
        ...row,
        source_count: meta?.count ?? 0,
        sample_source_url: meta?.sampleUrl ?? null,
        sample_source_title: meta?.sampleTitle ?? null,
      };
    });
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
