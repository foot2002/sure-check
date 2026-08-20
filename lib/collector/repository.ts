import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeSurveyTitle } from "@/lib/collector/titleUtils";
import { COLLECTOR_STALE_RUNNING_MS } from "@/lib/collector/opsPolicy";
import type {
  CollectionRunRow,
  CollectionRunStatus,
  CollectionRunTrigger,
  CollectorPlatform,
  CollectorSourceType,
  CollectorSurveyStatus,
  CollectionQueryStatInput,
  CollectionQueryStatRow,
  SurveyLinkFreshness,
  SurveyLinkRow,
  SurveySourceRow,
  UpsertSurveyResult,
} from "@/lib/collector/types";

function getClient() {
  return createSupabaseServerClient();
}

function looksLikeMissingColumn(message: string, column: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes(column.toLowerCase()) &&
    (m.includes("column") || m.includes("schema") || m.includes("does not exist"))
  );
}

function looksLikeStatusConstraint(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("status") && (m.includes("check") || m.includes("violat"));
}

async function writeSurveyLinkPatch(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ data: SurveyLinkRow | null; error: string | null }> {
  const supabase = getClient();
  let next = { ...patch };
  if (next.status === "stale") {
    // Prefer native `stale`; fall back to ignored if migration 009 is not applied.
  }

  const attempt = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from("survey_links")
      .update(body)
      .eq("id", id)
      .select("*")
      .single();
    return { data: (data as SurveyLinkRow) || null, error };
  };

  let { data, error } = await attempt(next);
  if (error && next.freshness && looksLikeMissingColumn(error.message, "freshness")) {
    const rest = { ...next };
    delete rest.freshness;
    next = rest;
    ({ data, error } = await attempt(next));
  }
  if (error && next.status === "stale" && looksLikeStatusConstraint(error.message)) {
    next = { ...next, status: "ignored" };
    ({ data, error } = await attempt(next));
  }
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

function mergeFreshness(
  existing: SurveyLinkFreshness | null | undefined,
  next?: SurveyLinkFreshness | null,
): SurveyLinkFreshness | undefined {
  if (!next) return existing || undefined;
  return { ...(existing || {}), ...next };
}

/**
 * Mark collection_runs stuck in `running` past the stale window as failed
 * so the unique running lock can be acquired again the next day.
 */
export async function recoverStaleCollectionRuns(
  staleMs = COLLECTOR_STALE_RUNNING_MS,
): Promise<number> {
  const supabase = getClient();
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data, error } = await supabase
    .from("collection_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_summary: "stale running 자동 복구 (실행시간 초과/중단)",
      error_count: 1,
    })
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id");
  if (error) {
    console.error("[collector] recoverStaleCollectionRuns", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function tryStartCollectionRun(
  trigger: CollectionRunTrigger,
): Promise<{ ok: true; run: CollectionRunRow } | { ok: false; reason: string; status: number }> {
  const supabase = getClient();
  await recoverStaleCollectionRuns();

  const { data, error } = await supabase
    .from("collection_runs")
    .insert({
      trigger,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (
      msg.includes("duplicate") ||
      msg.includes("unique") ||
      error.code === "23505"
    ) {
      return {
        ok: false,
        reason: "이미 수집 작업이 실행 중입니다.",
        status: 409,
      };
    }
    return {
      ok: false,
      reason: `수집 실행 잠금 실패: ${error.message}`,
      status: 500,
    };
  }

  return { ok: true, run: data as CollectionRunRow };
}

export async function finishCollectionRun(input: {
  runId: string;
  status: CollectionRunStatus;
  queriesCount: number;
  resultsCount: number;
  candidateLinksCount: number;
  newSurveysCount: number;
  duplicateSurveysCount: number;
  errorCount: number;
  errorSummary: string | null;
}): Promise<CollectionRunRow | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("collection_runs")
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      queries_count: input.queriesCount,
      results_count: input.resultsCount,
      candidate_links_count: input.candidateLinksCount,
      new_surveys_count: input.newSurveysCount,
      duplicate_surveys_count: input.duplicateSurveysCount,
      error_count: input.errorCount,
      error_summary: input.errorSummary,
    })
    .eq("id", input.runId)
    .select("*")
    .single();

  if (error) {
    console.error("[collector] finishCollectionRun", error);
    return null;
  }
  return data as CollectionRunRow;
}

/**
 * Prefer INSERT for brand-new canonicals (skips SELECT round-trip).
 * On unique conflict, falls back to the update path.
 */
export async function upsertSurveyLinkPreferInsert(input: {
  canonicalUrl: string;
  originalUrl: string;
  platform: CollectorPlatform;
  title?: string | null;
  status?: CollectorSurveyStatus;
  freshness?: SurveyLinkFreshness | null;
}): Promise<UpsertSurveyResult> {
  const supabase = getClient();
  const now = new Date().toISOString();
  const nextTitle = sanitizeSurveyTitle(input.title);
  const nextStatus = input.status || "discovered";

  const insertBody: Record<string, unknown> = {
    canonical_url: input.canonicalUrl,
    original_url: input.originalUrl,
    platform: input.platform,
    title: nextTitle || "제목 확인 필요",
    status: nextStatus,
    first_discovered_at: now,
    last_discovered_at: now,
    discovery_count: 1,
  };
  if (input.freshness) insertBody.freshness = input.freshness;

  let { data: inserted, error: insertError } = await supabase
    .from("survey_links")
    .insert(insertBody)
    .select("*")
    .single();

  if (
    insertError &&
    insertBody.freshness &&
    looksLikeMissingColumn(insertError.message, "freshness")
  ) {
    delete insertBody.freshness;
    ({ data: inserted, error: insertError } = await supabase
      .from("survey_links")
      .insert(insertBody)
      .select("*")
      .single());
  }
  if (
    insertError &&
    insertBody.status === "stale" &&
    looksLikeStatusConstraint(insertError.message)
  ) {
    insertBody.status = "ignored";
    ({ data: inserted, error: insertError } = await supabase
      .from("survey_links")
      .insert(insertBody)
      .select("*")
      .single());
  }

  if (!insertError && inserted) {
    return { link: inserted as SurveyLinkRow, isNew: true };
  }
  if (insertError && insertError.code !== "23505") {
    throw new Error(`survey_links 저장 실패: ${insertError.message}`);
  }
  // Conflict: existing row — use standard update path
  return upsertSurveyLink({
    canonicalUrl: input.canonicalUrl,
    originalUrl: input.originalUrl,
    platform: input.platform,
    title: input.title,
    status: input.status,
    freshness: input.freshness,
  });
}

export async function upsertSurveyLink(input: {
  canonicalUrl: string;
  originalUrl: string;
  platform: CollectorPlatform;
  title?: string | null;
  status?: CollectorSurveyStatus;
  freshness?: SurveyLinkFreshness | null;
}): Promise<UpsertSurveyResult> {
  const supabase = getClient();
  const now = new Date().toISOString();
  const nextTitle = sanitizeSurveyTitle(input.title);
  const nextStatus = input.status;

  const { data: existing, error: selectError } = await supabase
    .from("survey_links")
    .select("*")
    .eq("canonical_url", input.canonicalUrl)
    .maybeSingle();

  if (selectError) {
    throw new Error(`survey_links 조회 실패: ${selectError.message}`);
  }

  if (existing) {
    const row = existing as SurveyLinkRow;
    const mergedTitle =
      nextTitle || sanitizeSurveyTitle(row.title) || row.title;
    // Status merge: prefer more definitive survey states; don't let invalid overwrite real surveys.
    let status = row.status;
    if (nextStatus === "active") {
      status = row.status === "closed" ? "closed" : "active";
    } else if (nextStatus === "closed") {
      status = "closed";
    } else if (nextStatus === "restricted") {
      status =
        row.status === "active" || row.status === "closed"
          ? row.status
          : "restricted";
    } else if (nextStatus === "unreachable") {
      // Dead pages may overwrite active/discovered; keep closed/restricted/ignored.
      if (
        row.status === "closed" ||
        row.status === "restricted" ||
        row.status === "ignored" ||
        row.status === "stale"
      ) {
        status = row.status;
      } else {
        status = "unreachable";
      }
    } else if (nextStatus === "invalid") {
      status =
        row.status === "active" ||
        row.status === "closed" ||
        row.status === "restricted"
          ? row.status
          : "invalid";
    } else if (nextStatus === "discovered") {
      if (
        row.status === "invalid" ||
        row.status === "ignored" ||
        row.status === "stale"
      ) {
        status = row.status;
      } else if (
        row.status === "active" ||
        row.status === "closed" ||
        row.status === "restricted"
      ) {
        status = row.status;
      } else {
        status = "discovered";
      }
    } else if (nextStatus === "stale") {
      status =
        row.status === "closed" || row.status === "restricted"
          ? row.status
          : "stale";
    } else if (nextStatus === "ignored") {
      status = row.status === "stale" ? "stale" : "ignored";
    } else if (nextStatus) {
      status = nextStatus;
    }

    const patch: Record<string, unknown> = {
      last_discovered_at: now,
      discovery_count: (row.discovery_count || 1) + 1,
      title: mergedTitle,
      original_url: input.originalUrl || row.original_url,
      status,
    };
    const mergedFreshness = mergeFreshness(row.freshness, input.freshness);
    if (mergedFreshness) patch.freshness = mergedFreshness;

    const written = await writeSurveyLinkPatch(row.id, patch);
    if (written.error || !written.data) {
      throw new Error(`survey_links 갱신 실패: ${written.error || "empty"}`);
    }
    return { link: written.data, isNew: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("survey_links")
    .insert({
      canonical_url: input.canonicalUrl,
      original_url: input.originalUrl,
      platform: input.platform,
      title: nextTitle || "제목 확인 필요",
      status: nextStatus || "discovered",
      first_discovered_at: now,
      last_discovered_at: now,
      discovery_count: 1,
      freshness: input.freshness || null,
    })
    .select("*")
    .single();

  if (insertError) {
    // Race: another worker inserted the same canonical URL
    if (insertError.code === "23505") {
      const { data: raced } = await supabase
        .from("survey_links")
        .select("*")
        .eq("canonical_url", input.canonicalUrl)
        .single();
      if (raced) {
        const row = raced as SurveyLinkRow;
        const { data: updated } = await supabase
          .from("survey_links")
          .update({
            last_discovered_at: now,
            discovery_count: (row.discovery_count || 1) + 1,
            title: nextTitle || sanitizeSurveyTitle(row.title) || row.title,
            status: nextStatus || row.status,
          })
          .eq("id", row.id)
          .select("*")
          .single();
        return { link: (updated || row) as SurveyLinkRow, isNew: false };
      }
    }
    throw new Error(`survey_links 저장 실패: ${insertError.message}`);
  }

  return { link: inserted as SurveyLinkRow, isNew: true };
}

export async function updateSurveyLinkStatus(
  id: string,
  status: CollectorSurveyStatus,
  title?: string | null,
  freshness?: SurveyLinkFreshness | null,
): Promise<SurveyLinkRow | null> {
  const patch: Record<string, unknown> = { status };
  const cleaned = sanitizeSurveyTitle(title);
  if (cleaned) patch.title = cleaned;
  if (freshness) patch.freshness = freshness;
  const written = await writeSurveyLinkPatch(id, patch);
  if (written.error) {
    console.error("[collector] updateSurveyLinkStatus", written.error);
    return null;
  }
  return written.data;
}

export async function insertSurveySource(input: {
  surveyLinkId: string;
  sourceType: CollectorSourceType;
  sourceUrl: string;
  sourceTitle?: string | null;
  searchQuery?: string | null;
  sourcePublishedAt?: string | null;
  sourcePageUrl?: string | null;
  sourcePageTitle?: string | null;
  sourceAnchorText?: string | null;
  sourceContextExcerpt?: string | null;
  sourceOrganizationName?: string | null;
  sourceInstitutionHomepage?: string | null;
  sourcePostedDate?: string | null;
  sourcePeriodStart?: string | null;
  sourcePeriodEnd?: string | null;
  sourceDeadline?: string | null;
  sourceDateText?: string | null;
}): Promise<{ inserted: boolean; source?: SurveySourceRow }> {
  const supabase = getClient();
  const base = {
    survey_link_id: input.surveyLinkId,
    source_type: input.sourceType,
    source_url: input.sourceUrl,
    source_title: input.sourceTitle?.trim() || null,
    search_query: input.searchQuery?.trim() || null,
    source_published_at: input.sourcePublishedAt || null,
    discovered_at: new Date().toISOString(),
  };
  const evidence = {
    source_page_url: input.sourcePageUrl || input.sourceUrl,
    source_page_title: input.sourcePageTitle?.trim() || null,
    source_anchor_text: input.sourceAnchorText?.trim() || null,
    source_context_excerpt: input.sourceContextExcerpt?.trim() || null,
    source_organization_name: input.sourceOrganizationName?.trim() || null,
    source_institution_homepage: input.sourceInstitutionHomepage || null,
    source_posted_date: input.sourcePostedDate || null,
    source_period_start: input.sourcePeriodStart || null,
    source_period_end: input.sourcePeriodEnd || null,
    source_deadline: input.sourceDeadline || null,
    source_date_text: input.sourceDateText?.trim() || null,
  };

  const attempt = async (body: Record<string, unknown>) =>
    supabase.from("survey_sources").insert(body).select("*").maybeSingle();

  let { data, error } = await attempt({ ...base, ...evidence });
  if (
    error &&
    (/source_page_url|source_page_title|source_anchor_text|source_context_excerpt|source_organization_name|source_institution_homepage|source_posted_date|source_period_start|source_period_end|source_deadline|source_date_text/i.test(
      error.message,
    ) ||
      looksLikeMissingColumn(error.message, "source_page_url"))
  ) {
    ({ data, error } = await attempt(base));
  }

  if (error) {
    if (error.code === "23505") {
      return { inserted: false };
    }
    throw new Error(`survey_sources 저장 실패: ${error.message}`);
  }

  return { inserted: true, source: data as SurveySourceRow };
}

export async function getLatestCollectionRun(): Promise<CollectionRunRow | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("collection_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[collector] getLatestCollectionRun", error);
    return null;
  }
  return (data as CollectionRunRow) || null;
}

export async function countSurveyLinks(filters?: {
  sinceIso?: string;
  platform?: CollectorPlatform;
  status?: CollectorSurveyStatus | CollectorSurveyStatus[];
  excludeInvalid?: boolean;
}): Promise<number> {
  const supabase = getClient();
  let query = supabase
    .from("survey_links")
    .select("id", { count: "exact", head: true });
  if (filters?.sinceIso) {
    query = query.gte("first_discovered_at", filters.sinceIso);
  }
  if (filters?.platform) {
    query = query.eq("platform", filters.platform);
  }
  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in("status", filters.status);
    } else {
      query = query.eq("status", filters.status);
    }
  } else if (filters?.excludeInvalid !== false) {
    // Summary default: count real survey-ish rows (exclude invalid/ignored)
    query = query.in("status", [
      "active",
      "discovered",
      "closed",
      "restricted",
      "unreachable",
    ]);
  }
  const { count, error } = await query;
  if (error) {
    console.error("[collector] countSurveyLinks", error);
    return 0;
  }
  return count ?? 0;
}

export async function listSourcesForSurvey(
  surveyLinkId: string,
): Promise<SurveySourceRow[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("survey_sources")
    .select("*")
    .eq("survey_link_id", surveyLinkId)
    .order("discovered_at", { ascending: false });
  if (error) {
    console.error("[collector] listSourcesForSurvey", error);
    return [];
  }
  return (data as SurveySourceRow[]) || [];
}

export async function loadKnownSourceUrls(limit = 20_000): Promise<Set<string>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("survey_sources")
    .select("source_url")
    .order("discovered_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[collector] loadKnownSourceUrls", error);
    return new Set();
  }
  return new Set((data || []).map((r) => String(r.source_url)));
}

export async function loadKnownCanonicalUrls(
  limit = 20_000,
): Promise<Map<string, { id: string; status: CollectorSurveyStatus; platform: CollectorPlatform }>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("survey_links")
    .select("id, canonical_url, status, platform")
    .order("last_discovered_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[collector] loadKnownCanonicalUrls", error);
    return new Map();
  }
  const map = new Map<
    string,
    { id: string; status: CollectorSurveyStatus; platform: CollectorPlatform }
  >();
  for (const row of data || []) {
    map.set(String(row.canonical_url), {
      id: String(row.id),
      status: row.status as CollectorSurveyStatus,
      platform: row.platform as CollectorPlatform,
    });
  }
  return map;
}

export async function upsertCollectionQueryStat(
  input: CollectionQueryStatInput,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("collection_query_stats").upsert(
    {
      collection_run_id: input.collectionRunId,
      search_query: input.searchQuery,
      source_type: input.sourceType,
      sort_mode: input.sortMode,
      results_count: input.resultsCount,
      unique_source_count: input.uniqueSourceCount,
      candidate_count: input.candidateCount,
      valid_survey_count: input.validSurveyCount,
      new_survey_count: input.newSurveyCount,
      duplicate_survey_count: input.duplicateSurveyCount,
      invalid_count: input.invalidCount,
      unreachable_count: input.unreachableCount,
      closed_count: input.closedCount,
      restricted_count: input.restrictedCount,
      skipped_known_source_count: input.skippedKnownSourceCount,
      error_count: input.errorCount,
    },
    { onConflict: "collection_run_id,search_query,source_type" },
  );
  if (error) {
    // Table may be missing until migration 006 is applied — avoid log spam.
    if (!(globalThis as { __collectorQueryStatsWarned?: boolean }).__collectorQueryStatsWarned) {
      (globalThis as { __collectorQueryStatsWarned?: boolean }).__collectorQueryStatsWarned =
        true;
      console.error(
        "[collector] upsertCollectionQueryStat",
        error.message,
        "(subsequent errors suppressed; apply db/migrations/006_collection_query_stats.sql)",
      );
    }
  }
}

export async function listQueryStatsForRun(
  runId: string,
): Promise<CollectionQueryStatRow[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("collection_query_stats")
    .select("*")
    .eq("collection_run_id", runId)
    .order("new_survey_count", { ascending: false });
  if (error) {
    console.error("[collector] listQueryStatsForRun", error);
    return [];
  }
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    collectionRunId: String(row.collection_run_id),
    searchQuery: String(row.search_query),
    sourceType: row.source_type as CollectorSourceType,
    sortMode: (row.sort_mode as "sim" | "date") || "sim",
    resultsCount: Number(row.results_count || 0),
    uniqueSourceCount: Number(row.unique_source_count || 0),
    candidateCount: Number(row.candidate_count || 0),
    validSurveyCount: Number(row.valid_survey_count || 0),
    newSurveyCount: Number(row.new_survey_count || 0),
    duplicateSurveyCount: Number(row.duplicate_survey_count || 0),
    invalidCount: Number(row.invalid_count || 0),
    unreachableCount: Number(row.unreachable_count || 0),
    closedCount: Number(row.closed_count || 0),
    restrictedCount: Number(row.restricted_count || 0),
    skippedKnownSourceCount: Number(row.skipped_known_source_count || 0),
    errorCount: Number(row.error_count || 0),
    created_at: String(row.created_at || ""),
  }));
}

/**
 * Aggregate recent query performance for deep-search targeting.
 * Never deletes strategies — ranking only.
 */
export async function loadTopPerformingSearchQueries(options?: {
  lookbackDays?: number;
  limit?: number;
}): Promise<
  Array<{
    searchQuery: string;
    runs: number;
    newSurveyCount: number;
    candidateCount: number;
    resultsCount: number;
  }>
> {
  const lookbackDays = options?.lookbackDays ?? 7;
  const limit = options?.limit ?? 12;
  const supabase = getClient();
  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: runs, error: runErr } = await supabase
    .from("collection_runs")
    .select("id")
    .gte("started_at", since)
    .in("status", ["completed", "partial"])
    .limit(80);
  if (runErr || !runs?.length) {
    if (runErr) console.error("[collector] loadTopPerformingSearchQueries runs", runErr);
    return [];
  }

  const { data: stats, error: statErr } = await supabase
    .from("collection_query_stats")
    .select(
      "search_query, new_survey_count, candidate_count, results_count, collection_run_id",
    )
    .in(
      "collection_run_id",
      runs.map((r) => r.id),
    );
  if (statErr || !stats?.length) {
    if (statErr)
      console.error("[collector] loadTopPerformingSearchQueries stats", statErr);
    return [];
  }

  const byQuery = new Map<
    string,
    {
      searchQuery: string;
      runs: Set<string>;
      newSurveyCount: number;
      candidateCount: number;
      resultsCount: number;
    }
  >();
  for (const row of stats) {
    const q = String(row.search_query || "");
    if (!q) continue;
    const cur = byQuery.get(q) || {
      searchQuery: q,
      runs: new Set<string>(),
      newSurveyCount: 0,
      candidateCount: 0,
      resultsCount: 0,
    };
    cur.runs.add(String(row.collection_run_id));
    cur.newSurveyCount += Number(row.new_survey_count || 0);
    cur.candidateCount += Number(row.candidate_count || 0);
    cur.resultsCount += Number(row.results_count || 0);
    byQuery.set(q, cur);
  }

  return [...byQuery.values()]
    .map((v) => ({
      searchQuery: v.searchQuery,
      runs: v.runs.size,
      newSurveyCount: v.newSurveyCount,
      candidateCount: v.candidateCount,
      resultsCount: v.resultsCount,
    }))
    .sort((a, b) => {
      if (b.newSurveyCount !== a.newSurveyCount) {
        return b.newSurveyCount - a.newSurveyCount;
      }
      const aRate = a.resultsCount > 0 ? a.newSurveyCount / a.resultsCount : 0;
      const bRate = b.resultsCount > 0 ? b.newSurveyCount / b.resultsCount : 0;
      return bRate - aRate;
    })
    .slice(0, limit);
}

export async function markIgnoredTestSurveyLinks(): Promise<number> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("survey_links")
    .update({ status: "ignored" })
    .ilike("canonical_url", "%collector-test%")
    .select("id");
  if (error) {
    console.error("[collector] markIgnoredTestSurveyLinks", error);
    return 0;
  }
  return data?.length ?? 0;
}
