/**
 * Revalidate discovered / unreachable survey_links without new search.
 * Concurrency-limited, delayed, with retries for transient failures.
 */

import { COLLECTOR_SEARCH_DELAY_MS } from "@/lib/collector/config";
import {
  bestTriageAcrossSources,
  isDailyBacklogQueue,
} from "@/lib/collector/candidateTriage";
import { processSurveyCandidate } from "@/lib/collector/processCandidate";
import { updateSurveyLinkStatus } from "@/lib/collector/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CollectorSurveyStatus, SurveyLinkRow } from "@/lib/collector/types";

export type RevalidateTransition = {
  id: string;
  url: string;
  from: CollectorSurveyStatus;
  to: CollectorSurveyStatus;
  reason: string;
};

export type RevalidateResult = {
  targeted: number;
  processed: number;
  pageRequests: number;
  skipped: number;
  transitions: RevalidateTransition[];
  byToStatus: Partial<Record<CollectorSurveyStatus, number>>;
  before: Partial<Record<CollectorSurveyStatus, number>>;
  after: Partial<Record<CollectorSurveyStatus, number>>;
  errors: string[];
};

const TRANSIENT_RE =
  /429|rate.?limit|일시적|서버 오류|타임아웃|timeout|네트워크|HTTP 5\d\d/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function countByStatus(
  statuses: CollectorSurveyStatus[],
): Promise<Partial<Record<CollectorSurveyStatus, number>>> {
  const supabase = createSupabaseServerClient();
  const out: Partial<Record<CollectorSurveyStatus, number>> = {};
  await Promise.all(
    statuses.map(async (status) => {
      const { count } = await supabase
        .from("survey_links")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      out[status] = count ?? 0;
    }),
  );
  return out;
}

async function validateWithRetry(
  url: string,
  maxRetries: number,
): Promise<{
  status: CollectorSurveyStatus;
  reason: string;
  pageRequests: number;
}> {
  let pageRequests = 0;
  let lastStatus: CollectorSurveyStatus = "unreachable";
  let lastReason = "재검증 실패";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    pageRequests += 1;
    const processed = await processSurveyCandidate({ rawUrl: url });
    if (processed.ok) {
      return {
        status: processed.status,
        reason: processed.reason,
        pageRequests,
      };
    }
    const status =
      processed.status ||
      (processed.stage === "format" ? "invalid" : "unreachable");
    lastStatus = status;
    lastReason = processed.reason;

    const transient =
      status === "unreachable" && TRANSIENT_RE.test(processed.reason);
    if (!transient || attempt >= maxRetries) {
      // Never promote transient failure to invalid
      if (status === "invalid" && TRANSIENT_RE.test(processed.reason)) {
        return {
          status: "unreachable",
          reason: processed.reason,
          pageRequests,
        };
      }
      return { status, reason: processed.reason, pageRequests };
    }
    const backoff = COLLECTOR_SEARCH_DELAY_MS * Math.pow(2, attempt + 1);
    await sleep(backoff);
  }

  return { status: lastStatus, reason: lastReason, pageRequests };
}

/**
 * One-pass revalidation of discovered and/or unreachable rows.
 * Does not start a collection_run / Naver search.
 *
 * Ordering: oldest first (first_discovered_at / last_discovered_at ascending)
 * so backlog drains FIFO under batch caps.
 */
export async function revalidatePendingSurveyLinks(input?: {
  statuses?: Array<"discovered" | "unreachable">;
  concurrency?: number;
  delayMs?: number;
  maxRetries?: number;
  limit?: number;
  /**
   * discovered priority:
   * - newest: recent inflow first (org_v1.1 default for draining new backlog)
   * - oldest: classic FIFO
   */
  order?: "newest" | "oldest";
  /** @deprecated use order */
  oldestFirst?: boolean;
  /**
   * When true (default for discovered-only), skip C_ARCHIVE via low-cost triage
   * so daily backlog stays A/B only.
   */
  skipArchiveQueue?: boolean;
}): Promise<RevalidateResult> {
  const statuses = input?.statuses || ["discovered", "unreachable"];
  const concurrency = Math.max(1, Math.min(input?.concurrency ?? 3, 5));
  const delayMs = input?.delayMs ?? COLLECTOR_SEARCH_DELAY_MS;
  const maxRetries = Math.max(0, Math.min(input?.maxRetries ?? 2, 3));
  const limit = input?.limit ?? 500;
  const order: "newest" | "oldest" =
    input?.order ||
    (input?.oldestFirst === false ? "newest" : "oldest");
  const skipArchive =
    input?.skipArchiveQueue !== false &&
    statuses.length === 1 &&
    statuses[0] === "discovered";

  const trackStatuses: CollectorSurveyStatus[] = [
    "discovered",
    "unreachable",
    "active",
    "closed",
    "restricted",
    "invalid",
    "ignored",
  ];
  const before = await countByStatus(trackStatuses);

  const supabase = createSupabaseServerClient();
  const orderCol = "first_discovered_at";
  // Over-fetch when filtering archive so batch still fills
  const fetchLimit = skipArchive ? Math.min(limit * 4, 800) : limit;
  const { data, error } = await supabase
    .from("survey_links")
    .select("*")
    .in("status", statuses)
    .order(orderCol, { ascending: order === "oldest" })
    .limit(fetchLimit);

  if (error) {
    throw new Error(`재검증 대상 조회 실패: ${error.message}`);
  }

  let rows = (data || []) as SurveyLinkRow[];

  if (skipArchive && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: sources } = await supabase
      .from("survey_sources")
      .select(
        "survey_link_id, source_url, source_title, search_query, source_published_at, source_type",
      )
      .in("survey_link_id", ids)
      .limit(4000);
    const byLink = new Map<
      string,
      Array<{
        source_url?: string;
        source_title?: string;
        search_query?: string;
        source_published_at?: string;
        source_type?: string;
      }>
    >();
    for (const s of sources || []) {
      const key = String(s.survey_link_id);
      const list = byLink.get(key) || [];
      list.push({
        source_url: s.source_url || undefined,
        source_title: s.source_title || undefined,
        search_query: s.search_query || undefined,
        source_published_at: s.source_published_at || undefined,
        source_type: s.source_type || undefined,
      });
      byLink.set(key, list);
    }
    const filtered: SurveyLinkRow[] = [];
    for (const row of rows) {
      const srcList = byLink.get(row.id) || [{}];
      // Best across sources: C can promote to A/B when rediscovered from official source.
      const triage = bestTriageAcrossSources(
        srcList.map((src) => ({
          sourceUrl: src.source_url,
          sourceTitle: src.source_title || row.title,
          surveyTitle: row.title,
          searchQuery: src.search_query,
          sourcePublishedAt: src.source_published_at,
          sourceType:
            (src.source_type as "web" | "blog" | "cafe" | "unknown") ||
            "unknown",
          firstSeenThisRun: false,
        })),
      );
      if (!isDailyBacklogQueue(triage.queue)) continue;
      filtered.push(row);
      if (filtered.length >= limit) break;
    }
    rows = filtered;
  } else {
    rows = rows.slice(0, limit);
  }
  const seen = new Set<string>();
  const transitions: RevalidateTransition[] = [];
  const byToStatus: Partial<Record<CollectorSurveyStatus, number>> = {};
  const errors: string[] = [];
  let processed = 0;
  let pageRequests = 0;
  let skipped = 0;

  let index = 0;
  async function worker() {
    while (index < rows.length) {
      const current = index;
      index += 1;
      const row = rows[current]!;
      if (seen.has(row.canonical_url)) {
        skipped += 1;
        continue;
      }
      seen.add(row.canonical_url);

      try {
        const result = await validateWithRetry(row.canonical_url, maxRetries);
        pageRequests += result.pageRequests;
        processed += 1;

        let nextStatus = result.status;
        // Keep unreachable on continued failure; don't invent discovered for prior unreachable
        if (
          row.status === "unreachable" &&
          (nextStatus === "discovered" || nextStatus === "unreachable")
        ) {
          nextStatus = "unreachable";
        }

        if (nextStatus !== row.status) {
          await updateSurveyLinkStatus(row.id, nextStatus);
          transitions.push({
            id: row.id,
            url: row.canonical_url,
            from: row.status,
            to: nextStatus,
            reason: result.reason,
          });
        }
        byToStatus[nextStatus] = (byToStatus[nextStatus] || 0) + 1;
      } catch (err) {
        errors.push(
          `${row.canonical_url}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      await sleep(delayMs);
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  const after = await countByStatus(trackStatuses);

  return {
    targeted: rows.length,
    processed,
    pageRequests,
    skipped,
    transitions,
    byToStatus,
    before,
    after,
    errors,
  };
}
