/**
 * DB-backed collector list filters + 50-row pages.
 * Source/diagnosis/hold filters resolve IDs in Postgres first, then the page is hydrated.
 */

import { bestTriageAcrossSources } from "@/lib/collector/candidateTriage";
import {
  classifyCollectLane,
  isAutoDiagnosisTarget,
} from "@/lib/collector/collectConfirmedPolicy";
import { findDiagnosisLinksBySurveyIds } from "@/lib/collector/diagnosisLinkRepository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  SurveyLinkListFilters,
  SurveyLinkListItem,
  SurveyLinkListResult,
} from "@/lib/collector/types";

export const COLLECTOR_LIST_PAGE_SIZE = 50;
export const COLLECTOR_IN_CHUNK = 150;
const ID_CAP = 8000;
const DIAGNOSED_ID_CAP = 15000;

type Supabase = ReturnType<typeof createSupabaseServerClient>;

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

function intersectIds(
  current: string[] | null,
  next: string[] | null,
): string[] | null {
  if (next == null) return current;
  if (current == null) return next;
  const set = new Set(next);
  return current.filter((id) => set.has(id));
}

function escapeIlike(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/[,()]/g, " ");
}

function orIlike(columns: string[], raw: string): string | null {
  const pattern = escapeIlike(raw);
  if (!pattern) return null;
  return columns.map((column) => `${column}.ilike.%${pattern}%`).join(",");
}

export function parseCollectorListPage(query: {
  limit?: number | string | null;
  offset?: number | string | null;
  page?: number | string | null;
}): { limit: number; offset: number } {
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(300, Math.max(1, Math.floor(limitRaw)))
    : COLLECTOR_LIST_PAGE_SIZE;
  const pageRaw = Number(query.page);
  if (Number.isFinite(pageRaw) && pageRaw >= 1 && query.offset == null) {
    return { limit, offset: (Math.floor(pageRaw) - 1) * limit };
  }
  const offsetRaw = Number(query.offset);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  return { limit, offset };
}

function holdForcesAllStatus(filters: SurveyLinkListFilters): boolean {
  const hold = filters.holdReason && filters.holdReason !== "all" ? filters.holdReason : null;
  return Boolean(hold && (!filters.status || filters.status === "default"));
}

export function applySurveyLinkColumnFilters<
  T extends {
    eq: (c: string, v: unknown) => T;
    neq: (c: string, v: unknown) => T;
    in: (c: string, v: string[]) => T;
    or: (v: string) => T;
    gte: (c: string, v: string) => T;
    lte: (c: string, v: string) => T;
    gt: (c: string, v: number) => T;
  },
>(query: T, filters: SurveyLinkListFilters): T {
  let next = query;
  if (filters.platform && filters.platform !== "all") {
    next = next.eq("platform", filters.platform);
  }
  const statusFilter = holdForcesAllStatus(filters) ? "all" : filters.status;
  if (!statusFilter || statusFilter === "default") {
    next = next.in("status", ["active", "discovered"]);
  } else if (statusFilter === "non_invalid") {
    next = next.neq("status", "invalid");
  } else if (statusFilter !== "all") {
    next = next.eq("status", statusFilter);
  }
  if (filters.firstDiscoveredFrom) {
    next = next.gte("first_discovered_at", filters.firstDiscoveredFrom);
  }
  if (filters.firstDiscoveredTo) {
    next = next.lte("first_discovered_at", filters.firstDiscoveredTo);
  }
  if (filters.novelty === "new") {
    next = next.eq("discovery_count", 1);
  } else if (filters.novelty === "existing") {
    next = next.gt("discovery_count", 1);
  }

  const hold = filters.holdReason && filters.holdReason !== "all" ? filters.holdReason : null;
  if (hold === "date_unknown") {
    next = next.or(
      [
        "freshness->>reason_code.ilike.%date_unknown%",
        "freshness->>reason_code.ilike.%unknown_no_signal%",
        "freshness->>reason_code.ilike.%active_unknown%",
        "freshness->>freshness_status.ilike.%date_unknown%",
      ].join(","),
    );
  } else if (hold === "old_year") {
    next = next.or(
      [
        "status.eq.stale",
        "freshness->>reason_code.ilike.%stale%",
        "freshness->>reason_code.ilike.%previous_year%",
        "freshness->>reason_code.ilike.%old_year%",
      ].join(","),
    );
  } else if (hold === "closed") {
    next = next.eq("status", "closed");
  } else if (hold === "restricted") {
    next = next.eq("status", "restricted");
  } else if (hold === "personal") {
    next = next.or(
      [
        "title.ilike.%논문%",
        "title.ilike.%학위%",
        "title.ilike.%개인 연구%",
        "title.ilike.%개인연구%",
        "title.ilike.%연구 참여자%",
        "title.ilike.%연구대상자%",
        "title.ilike.%대학원생%",
        "title.ilike.%졸업작품%",
        "title.ilike.%지도교수%",
        "title.ilike.%학생 과제%",
        "freshness->>diagnosis_exclusion_reason.ilike.%personal%",
        "freshness->>diagnosis_exclusion_reason.ilike.%research%",
      ].join(","),
    );
  } else if (hold === "invalid") {
    next = next.in("status", ["invalid", "unreachable"]);
  }

  return next;
}

async function fetchIdColumn(
  supabase: Supabase,
  table: string,
  column: string,
  apply: (query: any) => any,
  cap: number,
): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; offset < cap; offset += COLLECTOR_IN_CHUNK) {
    const { data, error } = await apply(supabase.from(table).select(column)).range(
      offset,
      offset + COLLECTOR_IN_CHUNK - 1,
    );
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data || []) as Array<Record<string, unknown>>;
    out.push(...rows.map((row) => String(row[column] || "")));
    if (rows.length < COLLECTOR_IN_CHUNK) break;
  }
  return uniqueIds(out);
}

async function fetchSourceConstraintIds(
  supabase: Supabase,
  filters: SurveyLinkListFilters,
): Promise<string[] | null> {
  const searchQuery = filters.searchQuery?.trim() || "";
  const sourceType =
    filters.sourceType && filters.sourceType !== "all"
      ? filters.sourceType
      : null;
  if (!searchQuery && !sourceType) return null;

  return fetchIdColumn(
    supabase,
    "survey_sources",
    "survey_link_id",
    (query) => {
      let next = query;
      if (searchQuery) {
        next = next.ilike("search_query", `%${escapeIlike(searchQuery)}%`);
      }
      if (sourceType === "naver") {
        next = next.in("source_type", ["web", "blog", "cafe"]);
      } else if (sourceType) {
        next = next.eq("source_type", sourceType);
      }
      return next;
    },
    ID_CAP,
  );
}

async function fetchTextSearchIds(
  supabase: Supabase,
  raw: string,
): Promise<string[] | null> {
  const q = raw.trim();
  if (!q) return null;
  const linkOr = orIlike(["title", "canonical_url", "original_url"], q);
  const sourceOr = orIlike(
    [
      "search_query",
      "source_title",
      "source_url",
      "source_page_url",
      "source_page_title",
      "source_organization_name",
      "source_anchor_text",
    ],
    q,
  );
  const [linkIds, sourceIds] = await Promise.all([
    linkOr
      ? fetchIdColumn(
          supabase,
          "survey_links",
          "id",
          (query) => query.or(linkOr),
          ID_CAP,
        )
      : Promise.resolve([]),
    sourceOr
      ? fetchIdColumn(
          supabase,
          "survey_sources",
          "survey_link_id",
          (query) => query.or(sourceOr),
          ID_CAP,
        )
      : Promise.resolve([]),
  ]);
  return uniqueIds([...linkIds, ...sourceIds]);
}

function diagnosisStatusesForFilter(
  status: NonNullable<SurveyLinkListFilters["diagnosisStatus"]>,
): string[] | null {
  if (status === "all") return null;
  if (status === "undiagnosed") return null;
  if (status === "failed") {
    return ["failed", "failed_retryable", "failed_final"];
  }
  return [status];
}

async function fetchDiagnosisIds(
  supabase: Supabase,
  statuses: string[],
): Promise<string[]> {
  return fetchIdColumn(
    supabase,
    "survey_diagnosis_links",
    "survey_link_id",
    (query) => query.in("status", statuses),
    DIAGNOSED_ID_CAP,
  );
}

async function fetchEligibleIds(supabase: Supabase): Promise<string[]> {
  const [freshnessIds, officialIds] = await Promise.all([
    fetchIdColumn(
      supabase,
      "survey_links",
      "id",
      (query) =>
        query.or(
          [
            "freshness->>should_diagnose.eq.true",
            "freshness->>diagnosis_eligible_recent.eq.true",
          ].join(","),
        ),
      ID_CAP,
    ),
    fetchIdColumn(
      supabase,
      "survey_sources",
      "survey_link_id",
      (query) => query.eq("source_type", "official_site"),
      ID_CAP,
    ),
  ]);
  if (!officialIds.length) return uniqueIds(freshnessIds);
  const usable: string[] = [];
  for (let i = 0; i < officialIds.length; i += COLLECTOR_IN_CHUNK) {
    const slice = officialIds.slice(i, i + COLLECTOR_IN_CHUNK);
    const { data, error } = await supabase
      .from("survey_links")
      .select("id, status")
      .in("id", slice)
      .not("status", "in", "(closed,restricted,invalid,unreachable)");
    if (error) throw new Error(`eligible official_site: ${error.message}`);
    usable.push(
      ...((data || []) as Array<{ id: string }>).map((row) => row.id),
    );
  }
  return uniqueIds([...freshnessIds, ...usable]);
}

async function fetchMatchingLinkIds(
  supabase: Supabase,
  filters: SurveyLinkListFilters,
  restrictIds: string[] | null,
  excludeIds: Set<string> | null,
  cap: number,
): Promise<string[]> {
  type IdRow = { id: string; last_discovered_at: string | null };
  const collected: IdRow[] = [];

  const take = (rows: IdRow[]) => {
    for (const row of rows) {
      if (excludeIds?.has(row.id)) continue;
      collected.push(row);
    }
  };

  if (restrictIds) {
    for (let i = 0; i < restrictIds.length && collected.length < cap; i += COLLECTOR_IN_CHUNK) {
      const slice = restrictIds.slice(i, i + COLLECTOR_IN_CHUNK);
      let query = supabase
        .from("survey_links")
        .select("id, last_discovered_at")
        .in("id", slice);
      query = applySurveyLinkColumnFilters(query, filters);
      const { data, error } = await query;
      if (error) throw new Error(`survey_links: ${error.message}`);
      take((data || []) as IdRow[]);
    }
  } else {
    for (let offset = 0; offset < cap; offset += COLLECTOR_IN_CHUNK) {
      let query = supabase
        .from("survey_links")
        .select("id, last_discovered_at")
        .order("last_discovered_at", { ascending: false })
        .range(offset, offset + COLLECTOR_IN_CHUNK - 1);
      query = applySurveyLinkColumnFilters(query, filters);
      const { data, error } = await query;
      if (error) throw new Error(`survey_links: ${error.message}`);
      const rows = (data || []) as IdRow[];
      take(rows);
      if (rows.length < COLLECTOR_IN_CHUNK) break;
    }
  }

  collected.sort((a, b) =>
    String(b.last_discovered_at || "").localeCompare(String(a.last_discovered_at || "")),
  );
  return uniqueIds(collected.slice(0, cap).map((row) => row.id));
}

async function fetchLinksByIds(
  supabase: Supabase,
  ids: string[],
): Promise<SurveyLinkListItem[]> {
  if (!ids.length) return [];
  const byId = new Map<string, SurveyLinkListItem>();
  for (let i = 0; i < ids.length; i += COLLECTOR_IN_CHUNK) {
    const slice = ids.slice(i, i + COLLECTOR_IN_CHUNK);
    const { data, error } = await supabase
      .from("survey_links")
      .select("*")
      .in("id", slice);
    if (error) throw new Error(`survey_links hydrate: ${error.message}`);
    for (const row of (data || []) as SurveyLinkListItem[]) {
      byId.set(row.id, row);
    }
  }
  return ids.map((id) => byId.get(id)).filter((row): row is SurveyLinkListItem => Boolean(row));
}

async function hydrateListRows(
  supabase: Supabase,
  rows: SurveyLinkListItem[],
): Promise<SurveyLinkListItem[]> {
  if (!rows.length) return [];
  const linkIds = rows.map((row) => row.id);

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

  const mapped = rows.map((row) => {
    const meta = byLink.get(row.id);
    const triage = bestTriageAcrossSources(
      (meta?.sources || []).map((s) => ({
        sourceUrl: s.source_url,
        sourceTitle: s.source_title || row.title,
        surveyTitle: row.title,
        searchQuery: s.search_query || undefined,
        sourcePublishedAt: s.source_published_at || undefined,
        sourceType:
          (s.source_type as "web" | "blog" | "cafe" | "unknown" | "official_site") ||
          "unknown",
        firstSeenThisRun: false,
      })),
    );
    const sourceTypes = (meta?.sources || []).map((s) => s.source_type || "unknown");
    return {
      ...row,
      source_count: meta?.count ?? 0,
      sample_source_url: meta?.sampleUrl ?? null,
      sample_source_title: meta?.sampleTitle ?? null,
      triage_queue: triage.queue,
      collect_lane: classifyCollectLane({
        status: row.status,
        freshness: row.freshness,
        title: row.title,
        sourceTypes,
      }),
      auto_diagnosis_target: isAutoDiagnosisTarget({
        status: row.status,
        freshness: row.freshness,
        title: row.title,
        triage,
        sourceTypes,
      }),
    };
  });

  let diagnosisMap: Awaited<ReturnType<typeof findDiagnosisLinksBySurveyIds>>;
  try {
    diagnosisMap = await findDiagnosisLinksBySurveyIds(mapped.map((row) => row.id));
  } catch {
    diagnosisMap = new Map();
  }

  const completedJobIds = [...diagnosisMap.values()]
    .filter(
      (d) =>
        (d.status === "completed" || d.status === "limited") &&
        d.diagnosis_job_id,
    )
    .map((d) => d.diagnosis_job_id!)
    .slice(0, 80);

  const scoreByJob = new Map<string, { score: number | null; grade: string | null }>();
  if (completedJobIds.length > 0) {
    const { data: jobs } = await supabase
      .from("scan_jobs")
      .select("id, external_scan_id")
      .in("external_scan_id", completedJobIds);
    const jobUuidByExternal = new Map(
      (jobs || []).map((j) => [String(j.external_scan_id), String(j.id)]),
    );
    const uuids = [...jobUuidByExternal.values()];
    if (uuids.length > 0) {
      const { data: reports } = await supabase
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

  return mapped.map((row) => {
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
}

export async function listSurveyLinks(
  filters: SurveyLinkListFilters = {},
): Promise<SurveyLinkListResult> {
  const supabase = createSupabaseServerClient();
  const { limit, offset } = parseCollectorListPage(filters);
  const triageFilter =
    filters.triageQueue && filters.triageQueue !== "all"
      ? filters.triageQueue
      : null;
  const diagnosisFilter = filters.diagnosisStatus || "all";

  let restrictIds: string[] | null = null;
  restrictIds = intersectIds(
    restrictIds,
    await fetchSourceConstraintIds(supabase, filters),
  );
  restrictIds = intersectIds(
    restrictIds,
    await fetchTextSearchIds(supabase, filters.q || ""),
  );
  if (filters.holdReason === "eligible") {
    restrictIds = intersectIds(restrictIds, await fetchEligibleIds(supabase));
  }
  const positiveDiagnosis = diagnosisStatusesForFilter(diagnosisFilter);
  if (positiveDiagnosis) {
    restrictIds = intersectIds(
      restrictIds,
      await fetchDiagnosisIds(supabase, positiveDiagnosis),
    );
  }
  if (restrictIds && restrictIds.length === 0) {
    return { items: [], total: 0, hasMore: false, limit, offset };
  }

  const excludeIds =
    diagnosisFilter === "undiagnosed"
      ? new Set(
          await fetchDiagnosisIds(supabase, [
            "queued",
            "running",
            "completed",
            "limited",
            "failed",
            "failed_retryable",
            "failed_final",
            "skipped",
            "skipped_closed",
            "skipped_restricted",
            "timeout",
          ]),
        )
      : null;

  const needsIdPass = Boolean(restrictIds || excludeIds || triageFilter);
  let pageRows: SurveyLinkListItem[] = [];
  let total = 0;

  if (!needsIdPass) {
    let query = supabase
      .from("survey_links")
      .select("*", { count: "exact" })
      .order("last_discovered_at", { ascending: false })
      .range(offset, offset + limit - 1);
    query = applySurveyLinkColumnFilters(query, filters);
    const { data, error, count } = await query;
    if (error) {
      console.error("[collector] listSurveyLinks", error);
      throw new Error(`수집 설문 목록 조회 실패: ${error.message}`);
    }
    pageRows = (data || []) as SurveyLinkListItem[];
    total = count ?? pageRows.length + offset;
  } else {
    const idCap = triageFilter ? Math.min(ID_CAP, 2000) : ID_CAP;
    let ids = await fetchMatchingLinkIds(
      supabase,
      filters,
      restrictIds,
      excludeIds,
      idCap,
    );
    if (triageFilter) {
      const triaged = await hydrateListRows(
        supabase,
        await fetchLinksByIds(supabase, ids),
      );
      ids = triaged
        .filter((row) => row.triage_queue === triageFilter)
        .map((row) => row.id);
    }
    total = ids.length;
    const pageIds = ids.slice(offset, offset + limit);
    pageRows = await fetchLinksByIds(supabase, pageIds);
  }

  const items = await hydrateListRows(supabase, pageRows);
  return {
    items,
    total,
    hasMore: offset + items.length < total,
    limit,
    offset,
  };
}