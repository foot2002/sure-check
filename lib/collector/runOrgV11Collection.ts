/**
 * org_v1.1 collection: keep search throughput, defer most page validates.
 * - Search + extract + format + save discovered
 * - Inline page-validate only top N by priority score
 * - dryRun: no DB writes / no collection_runs lock
 */

import {
  COLLECTOR_DEEP_SEARCH_API_SHARE,
  COLLECTOR_DEEP_SEARCH_MAX_PAGES,
  COLLECTOR_INLINE_PAGE_VALIDATE_ORG,
  COLLECTOR_DAILY_BACKLOG_CAP,
  COLLECTOR_MAX_API_CALLS,
  COLLECTOR_MAX_RUNTIME_MS,
  COLLECTOR_ORG_RUNTIME_TARGET_MS,
  COLLECTOR_SEARCH_DELAY_MS,
  COLLECTOR_SEARCH_DISPLAY_ORG,
  getCollectorConfigError,
  isCollectorConfigured,
  isNaverSearchConfigured,
} from "@/lib/collector/config";
import {
  buildCollectorSearchQueries,
  type CollectorSearchQuery,
} from "@/lib/collector/searchQueries";
import {
  COLLECTOR_PARTITION_RUNTIME_MAX_MS,
  getPartitionApiBudget,
  selectDeepQueriesForPartition,
  selectOrgV1QueriesForPartition,
  type CollectorPartition,
} from "@/lib/collector/searchPartitions";
import { extractSurveyUrlsFromText } from "@/lib/collector/extractLinks";
import {
  NaverSearchError,
  searchNaverEndpoint,
} from "@/lib/collector/naverSearch";
import { isShortenerUrl } from "@/lib/collector/platformDetect";
import { processSurveyCandidate } from "@/lib/collector/processCandidate";
import {
  finishCollectionRun,
  insertSurveySource,
  loadKnownCanonicalUrls,
  loadKnownSourceUrls,
  loadTopPerformingSearchQueries,
  tryStartCollectionRun,
  upsertCollectionQueryStat,
  upsertSurveyLink,
} from "@/lib/collector/repository";
import { validateSurveyResponseUrl } from "@/lib/collector/surveyUrlRules";
import { normalizeSurveyUrl } from "@/lib/collector/urlNormalize";
import { scoreValidationPriority } from "@/lib/collector/validationPriority";
import { reviewOrgSample } from "@/lib/collector/orgSampleReview";
import {
  triageCandidate,
  applyCanaryAbCaps,
  type TriageQueue,
} from "@/lib/collector/candidateTriage";
import { isCollectorCanaryEnabled } from "@/lib/collector/canaryPolicy";
import {
  formatCapMarker,
  getRemainingDailyAbCaps,
} from "@/lib/collector/dailyCanaryCap";
import {
  createPhaseTiming,
  finalizePhaseTiming,
  formatPhaseTiming,
  timePhase,
  topPhase,
  type PhaseTiming,
} from "@/lib/collector/phaseTiming";
import { mapPool } from "@/lib/collector/mapPool";
import type {
  CollectionRunRow,
  CollectionRunTrigger,
  CollectionRunStats,
  CollectorPlatform,
  CollectorSourceType,
  CollectionQueryStatInput,
} from "@/lib/collector/types";

/** Safe Naver concurrency for Production (do not raise above 5). */
const NAVER_SEARCH_CONCURRENCY = 3;
type Endpoint = "webkr" | "blog" | "cafearticle";

const ENDPOINT_SOURCE: Record<Endpoint, CollectorSourceType> = {
  webkr: "web",
  blog: "blog",
  cafearticle: "cafe",
};

const CYCLE: Endpoint[] = ["blog", "cafearticle", "webkr"];

type PendingCandidate = {
  candidateUrl: string;
  canonicalUrl: string;
  originalUrl: string;
  platform: CollectorPlatform;
  sourceUrl: string;
  sourceTitle: string;
  description?: string;
  sourceType: CollectorSourceType;
  searchQuery: string;
  publishedAt: string | null;
  sortMode?: "date" | "sim";
  priority: number;
};

export type OrgV11RunResult =
  | {
      ok: true;
      dryRun: boolean;
      run: CollectionRunRow | null;
      stats: CollectionRunStats;
      meta: {
        strategy: "org_v1_2";
        partition: CollectorPartition;
        inlinePageValidates: number;
        inlineBudget: number;
        deferredDiscovered: number;
        archivedSkipped: number;
        queueCounts: Record<TriageQueue, number>;
        cappedA: number;
        cappedB: number;
        elapsedMs: number;
        runtimeTargetMs: number;
        sampleOrgReview: Record<string, number>;
        phaseTiming: PhaseTiming;
        topPhase: string;
        naverConcurrency: number;
      };
    }
  | { ok: false; status: number; error: string };

function emptyStats(): CollectionRunStats {
  return {
    queriesCount: 0,
    resultsCount: 0,
    candidateLinksCount: 0,
    newSurveysCount: 0,
    duplicateSurveysCount: 0,
    errorCount: 0,
    errors: [],
    apiCalls: 0,
    skippedKnownSources: 0,
    formatRejectedCount: 0,
    pageRejectedCount: 0,
    invalidSavedCount: 0,
    verifiedSavedCount: 0,
    unreachableCount: 0,
    closedCount: 0,
    restrictedCount: 0,
    queryStats: [],
  };
}

function sleep(ms: number) {
  return Promise.resolve().then(
    () => new Promise((r) => setTimeout(r, ms)),
  );
}

function fakeRun(trigger: CollectionRunTrigger): CollectionRunRow {
  const now = new Date().toISOString();
  return {
    id: "dry-run",
    trigger,
    started_at: now,
    completed_at: null,
    status: "running",
    queries_count: 0,
    results_count: 0,
    candidate_links_count: 0,
    new_surveys_count: 0,
    duplicate_surveys_count: 0,
    error_count: 0,
    error_summary: null,
    created_at: now,
    updated_at: now,
  };
}

export async function runOrgV11Collection(input: {
  trigger: CollectionRunTrigger;
  maxQueries?: number;
  maxApiCalls?: number;
  dryRun?: boolean;
  inlinePageValidateBudget?: number;
  /** a | b | all — sequential partitions share one daily canary cap */
  partition?: CollectorPartition;
}): Promise<OrgV11RunResult> {
  const dryRun = Boolean(input.dryRun);
  const partition: CollectorPartition = input.partition || "all";
  const timing = createPhaseTiming();
  if (dryRun) {
    if (!isNaverSearchConfigured()) {
      return {
        ok: false,
        status: 503,
        error: getCollectorConfigError() || "네이버 검색 미설정",
      };
    }
  } else if (!isCollectorConfigured()) {
    return {
      ok: false,
      status: 503,
      error: getCollectorConfigError() || "수집 기능이 비활성화되어 있습니다.",
    };
  }

  let run: CollectionRunRow | null = null;
  if (!dryRun) {
    const lock = await tryStartCollectionRun(input.trigger);
    if (!lock.ok) {
      return { ok: false, status: lock.status, error: lock.reason };
    }
    run = lock.run;
  } else {
    run = fakeRun(input.trigger);
  }

  const partBudget = getPartitionApiBudget(partition);
  const display = COLLECTOR_SEARCH_DISPLAY_ORG;
  const inlineBudget =
    input.inlinePageValidateBudget ??
    (partition === "all"
      ? COLLECTOR_INLINE_PAGE_VALIDATE_ORG
      : partBudget.inlineBudget);
  const stats = emptyStats();
  const startedAt = Date.now();
  const runtimeMaxMs =
    partition === "all"
      ? COLLECTOR_MAX_RUNTIME_MS
      : COLLECTOR_PARTITION_RUNTIME_MAX_MS;
  const runtimeTargetMs =
    partition === "all"
      ? COLLECTOR_ORG_RUNTIME_TARGET_MS
      : Math.min(60_000, COLLECTOR_PARTITION_RUNTIME_MAX_MS);
  const maxApiCalls = Math.min(
    input.maxApiCalls ?? partBudget.maxApiCalls,
    partition === "all" ? COLLECTOR_MAX_API_CALLS : partBudget.maxApiCalls,
  );
  const deepReserve =
    partition === "all"
      ? Math.max(1, Math.floor(maxApiCalls * COLLECTOR_DEEP_SEARCH_API_SHARE))
      : partBudget.deepReserve;

  let limited = selectOrgV1QueriesForPartition(
    partition,
    maxApiCalls,
    deepReserve,
  );
  if (typeof input.maxQueries === "number" && input.maxQueries > 0) {
    limited = limited.slice(0, input.maxQueries);
  }

  const knownSources = dryRun
    ? new Set<string>()
    : await timePhase(timing, "load_known", () => loadKnownSourceUrls());
  const knownCanonicals = dryRun
    ? new Map<
        string,
        { id: string; status: string; platform: CollectorPlatform }
      >()
    : await timePhase(timing, "load_known", () => loadKnownCanonicalUrls());

  // dry-run still benefits from known sets when DB is available
  if (dryRun && isCollectorConfigured()) {
    try {
      await timePhase(timing, "load_known", async () => {
        const ks = await loadKnownSourceUrls();
        for (const u of ks) knownSources.add(u);
        const kc = await loadKnownCanonicalUrls();
        for (const [k, v] of kc) knownCanonicals.set(k, v);
      });
    } catch {
      /* ignore — pure search dry-run */
    }
  }

  let apiCalls = 0;
  const pageOneExecuted: CollectorSearchQuery[] = [];
  const pending: PendingCandidate[] = [];
  const pendingKeys = new Set<string>();
  const sampleReview: Record<string, number> = {
    public: 0,
    company: 0,
    university_official: 0,
    individual_or_academic: 0,
    unknown: 0,
  };

  const runId = run.id;

  async function persistDiscovered(p: PendingCandidate): Promise<"new" | "dup"> {
    if (dryRun) {
      if (knownCanonicals.has(p.canonicalUrl)) return "dup";
      knownCanonicals.set(p.canonicalUrl, {
        id: "dry",
        status: "discovered",
        platform: p.platform,
      });
      return "new";
    }
    return timePhase(timing, "db_upsert", async () => {
      const upserted = await upsertSurveyLink({
        canonicalUrl: p.canonicalUrl,
        originalUrl: p.originalUrl,
        platform: p.platform,
        title: p.sourceTitle,
        status: "discovered",
      });
      knownCanonicals.set(p.canonicalUrl, {
        id: upserted.link.id,
        status: "discovered",
        platform: p.platform,
      });
      await insertSurveySource({
        surveyLinkId: upserted.link.id,
        sourceType: p.sourceType,
        sourceUrl: p.sourceUrl,
        sourceTitle: p.sourceTitle,
        searchQuery: p.searchQuery,
        sourcePublishedAt: p.publishedAt,
      });
      knownSources.add(p.sourceUrl);
      return upserted.isNew ? "new" : "dup";
    });
  }

  async function handleHits(
    hits: Array<{
      link: string;
      title: string;
      description: string;
      sourceType: CollectorSourceType;
      searchQuery: string;
      publishedAt?: string | null;
    }>,
    qStat: CollectionQueryStatInput,
  ) {
    const uniqueLinks = new Set<string>();
    for (const hit of hits) {
      uniqueLinks.add(hit.link);
      if (knownSources.has(hit.link)) {
        qStat.skippedKnownSourceCount += 1;
        stats.skippedKnownSources = (stats.skippedKnownSources || 0) + 1;
        continue;
      }
      const candidates = extractSurveyUrlsFromText(
        hit.link,
        hit.title,
        hit.description,
      );
      if (candidates.length === 0) {
        knownSources.add(hit.link);
        continue;
      }

      for (const candidate of candidates) {
        qStat.candidateCount += 1;
        stats.candidateLinksCount += 1;

        // Shorteners need network resolve — defer as pending with raw URL
        if (isShortenerUrl(candidate)) {
          const key = `short:${candidate}`;
          if (pendingKeys.has(key)) {
            qStat.duplicateSurveyCount += 1;
            stats.duplicateSurveysCount += 1;
            continue;
          }
          pendingKeys.add(key);
          pending.push({
            candidateUrl: candidate,
            canonicalUrl: candidate,
            originalUrl: candidate,
            platform: "google_forms",
            sourceUrl: hit.link,
            sourceTitle: hit.title,
            description: hit.description,
            sourceType: hit.sourceType,
            searchQuery: hit.searchQuery,
            publishedAt: hit.publishedAt ?? null,
            sortMode: qStat.sortMode,
            priority: scoreValidationPriority({
              sourceUrl: hit.link,
              sourceTitle: hit.title,
              searchQuery: hit.searchQuery,
              candidateUrl: candidate,
            }),
          });
          const review = reviewOrgSample({
            sourceTitle: hit.title,
            sourceUrl: hit.link,
            searchQuery: hit.searchQuery,
          });
          sampleReview[review.label] = (sampleReview[review.label] || 0) + 1;
          continue;
        }

        const normalized = normalizeSurveyUrl(candidate);
        if (!normalized.ok) {
          stats.formatRejectedCount = (stats.formatRejectedCount || 0) + 1;
          continue;
        }
        const format = validateSurveyResponseUrl(normalized.canonicalUrl);
        if (!format.ok) {
          stats.formatRejectedCount = (stats.formatRejectedCount || 0) + 1;
          continue;
        }

        if (knownCanonicals.has(normalized.canonicalUrl)) {
          qStat.duplicateSurveyCount += 1;
          stats.duplicateSurveysCount += 1;
          if (!dryRun) {
            const known = knownCanonicals.get(normalized.canonicalUrl)!;
            await insertSurveySource({
              surveyLinkId: known.id,
              sourceType: hit.sourceType,
              sourceUrl: hit.link,
              sourceTitle: hit.title,
              searchQuery: hit.searchQuery,
              sourcePublishedAt: hit.publishedAt ?? null,
            });
          }
          knownSources.add(hit.link);
          continue;
        }

        if (pendingKeys.has(normalized.canonicalUrl)) {
          qStat.duplicateSurveyCount += 1;
          stats.duplicateSurveysCount += 1;
          continue;
        }
        pendingKeys.add(normalized.canonicalUrl);

        const priority = scoreValidationPriority({
          sourceUrl: hit.link,
          sourceTitle: hit.title,
          searchQuery: hit.searchQuery,
          surveyTitle: hit.title,
          candidateUrl: normalized.canonicalUrl,
        });

        pending.push({
          candidateUrl: candidate,
          canonicalUrl: normalized.canonicalUrl,
          originalUrl: normalized.originalUrl,
          platform: format.platform,
          sourceUrl: hit.link,
          sourceTitle: hit.title,
          description: hit.description,
          sourceType: hit.sourceType,
          searchQuery: hit.searchQuery,
          publishedAt: hit.publishedAt ?? null,
          sortMode: qStat.sortMode,
          priority,
        });

        const review = reviewOrgSample({
          surveyTitle: hit.title,
          sourceTitle: hit.title,
          sourceUrl: hit.link,
          searchQuery: hit.searchQuery,
          canonicalUrl: normalized.canonicalUrl,
        });
        sampleReview[review.label] = (sampleReview[review.label] || 0) + 1;
      }
      knownSources.add(hit.link);
    }
    qStat.uniqueSourceCount = uniqueLinks.size;
  }

  try {
    // Page-1: bounded concurrency Naver search (3), then sequential extract.
    type SearchJob = {
      item: CollectorSearchQuery;
      endpoint: Endpoint;
      sourceType: CollectorSourceType;
      sort: "date" | "sim";
      qStat: CollectionQueryStatInput;
    };
    const jobs: SearchJob[] = [];
    for (let qi = 0; qi < limited.length; qi += 1) {
      if (apiCalls >= maxApiCalls - deepReserve) break;
      const item = limited[qi]!;
      stats.queriesCount += 1;
      pageOneExecuted.push(item);
      const endpoint = CYCLE[qi % CYCLE.length]!;
      const sourceType = ENDPOINT_SOURCE[endpoint];
      const sort = (item.sort || item.preferredSort) as "date" | "sim";
      apiCalls += 1;
      stats.apiCalls = apiCalls;
      jobs.push({
        item,
        endpoint,
        sourceType,
        sort,
        qStat: {
          collectionRunId: runId,
          searchQuery: item.query,
          sourceType,
          sortMode: sort,
          resultsCount: 0,
          uniqueSourceCount: 0,
          candidateCount: 0,
          validSurveyCount: 0,
          newSurveyCount: 0,
          duplicateSurveyCount: 0,
          invalidCount: 0,
          unreachableCount: 0,
          closedCount: 0,
          restrictedCount: 0,
          skippedKnownSourceCount: 0,
          errorCount: 0,
        },
      });
    }

    const fetched = await mapPool(jobs, NAVER_SEARCH_CONCURRENCY, async (job) => {
      if (Date.now() - startedAt > runtimeMaxMs) {
        return {
          job,
          result: null as Awaited<ReturnType<typeof searchNaverEndpoint>> | null,
          error: "runtime_budget" as string | null,
        };
      }
      try {
        const result = await timePhase(timing, "naver_search", () =>
          searchNaverEndpoint(job.endpoint, job.item.query, {
            display,
            sort: job.sort,
            start: 1,
          }),
        );
        await sleep(COLLECTOR_SEARCH_DELAY_MS);
        return { job, result, error: null };
      } catch (error) {
        const message =
          error instanceof NaverSearchError
            ? `[${job.endpoint}/${error.kind}] ${error.message}`
            : String(error);
        return { job, result: null, error: message };
      }
    });

    for (const row of fetched) {
      if (Date.now() - startedAt > runtimeMaxMs) {
        stats.errors.push("실행시간 한도 도달 — 조기 종료");
        break;
      }
      const { job, result, error } = row;
      if (error === "runtime_budget") {
        stats.errors.push("실행시간 한도 도달 — 검색 중단");
        continue;
      }
      if (error || !result) {
        job.qStat.errorCount += 1;
        stats.errorCount += 1;
        stats.errors.push(`${job.item.query}: ${error || "search failed"}`);
      } else {
        job.qStat.resultsCount = result.resultCount;
        stats.resultsCount += result.resultCount;
        await handleHits(
          result.hits.map((h) => ({
            ...h,
            searchQuery: job.item.query,
            sourceType: job.sourceType,
          })),
          job.qStat,
        );
      }
      stats.queryStats = [...(stats.queryStats || []), job.qStat];
      if (!dryRun) {
        await timePhase(timing, "query_stats", () =>
          upsertCollectionQueryStat(job.qStat),
        );
      }
    }

    // Deep pages (partition-scoped, bounded concurrency)
    const historical = dryRun
      ? []
      : await loadTopPerformingSearchQueries({ lookbackDays: 7, limit: 20 });
    const deepFromHist: CollectorSearchQuery[] = [];
    const seenQ = new Set<string>();
    const depthCatalog = new Map(
      buildCollectorSearchQueries({ strategy: "org_v1" })
        .filter((q) => q.depthEnabled)
        .map((q) => [q.query, q]),
    );
    for (const row of historical) {
      const item = depthCatalog.get(row.searchQuery);
      if (!item || seenQ.has(item.query) || row.newSurveyCount <= 0) continue;
      deepFromHist.push(item);
      seenQ.add(item.query);
    }
    const deepCandidates =
      deepFromHist.length > 0
        ? deepFromHist.slice(0, partition === "a" ? 2 : 3)
        : selectDeepQueriesForPartition(
            partition,
            pageOneExecuted,
            partition === "a" ? 2 : 3,
          );

    const deepStarts = [101, 201].slice(0, COLLECTOR_DEEP_SEARCH_MAX_PAGES);
    const deepJobs: Array<{
      item: CollectorSearchQuery;
      endpoint: Endpoint;
      start: number;
      sourceType: CollectorSourceType;
    }> = [];
    let deepIdx = 0;
    for (const item of deepCandidates) {
      if (apiCalls >= maxApiCalls) break;
      const endpoint = CYCLE[deepIdx % CYCLE.length]!;
      deepIdx += 1;
      for (const start of deepStarts) {
        if (apiCalls >= maxApiCalls) break;
        apiCalls += 1;
        stats.apiCalls = apiCalls;
        deepJobs.push({
          item,
          endpoint,
          start,
          sourceType: ENDPOINT_SOURCE[endpoint],
        });
      }
    }

    const deepFetched = await mapPool(
      deepJobs,
      NAVER_SEARCH_CONCURRENCY,
      async (job) => {
        const qStat: CollectionQueryStatInput = {
          collectionRunId: runId,
          searchQuery: `${job.item.query} [deep:start=${job.start}]`,
          sourceType: job.sourceType,
          sortMode: "date",
          resultsCount: 0,
          uniqueSourceCount: 0,
          candidateCount: 0,
          validSurveyCount: 0,
          newSurveyCount: 0,
          duplicateSurveyCount: 0,
          invalidCount: 0,
          unreachableCount: 0,
          closedCount: 0,
          restrictedCount: 0,
          skippedKnownSourceCount: 0,
          errorCount: 0,
        };
        if (Date.now() - startedAt > runtimeMaxMs) {
          return { job, result: null, error: "runtime_budget" as string | null, qStat };
        }
        try {
          const result = await timePhase(timing, "naver_search", () =>
            searchNaverEndpoint(job.endpoint, job.item.query, {
              display,
              sort: "date",
              start: job.start,
            }),
          );
          await sleep(COLLECTOR_SEARCH_DELAY_MS);
          return { job, result, error: null, qStat };
        } catch (error) {
          qStat.errorCount += 1;
          const message =
            error instanceof NaverSearchError
              ? `[${job.endpoint}/${error.kind}] ${error.message}`
              : String(error);
          return { job, result: null, error: message, qStat };
        }
      },
    );

    for (const row of deepFetched) {
      stats.queriesCount += 1;
      if (row.error || !row.result) {
        if (row.error && row.error !== "runtime_budget") {
          stats.errorCount += 1;
          stats.errors.push(
            `${row.job.item.query} deep@${row.job.start}: ${row.error}`,
          );
        }
        stats.queryStats = [...(stats.queryStats || []), row.qStat];
        if (!dryRun) {
          await timePhase(timing, "query_stats", () =>
            upsertCollectionQueryStat(row.qStat),
          );
        }
        continue;
      }
      row.qStat.resultsCount = row.result.resultCount;
      stats.resultsCount += row.result.resultCount;
      await handleHits(
        row.result.hits.map((h) => ({
          ...h,
          searchQuery: row.job.item.query,
          sourceType: row.job.sourceType,
        })),
        row.qStat,
      );
      stats.queryStats = [...(stats.queryStats || []), row.qStat];
      if (!dryRun) {
        await timePhase(timing, "query_stats", () =>
          upsertCollectionQueryStat(row.qStat),
        );
      }
    }

    // ── Phase 2: org_v1.2 triage → A inline, B backlog, C archive ──
    const queueCounts: Record<TriageQueue, number> = {
      A_PRIORITY: 0,
      B_PRIORITY: 0,
      C_ARCHIVE: 0,
    };
    const enriched = await timePhase(timing, "triage", async () =>
      pending.map((p) => {
        const triage = triageCandidate({
          sourceUrl: p.sourceUrl,
          sourceTitle: p.sourceTitle,
          description: p.description,
          surveyTitle: p.sourceTitle,
          searchQuery: p.searchQuery,
          sourceType: p.sourceType,
          sourcePublishedAt: p.publishedAt,
          sortMode: p.sortMode || null,
          firstSeenThisRun: true,
        });
        queueCounts[triage.queue] += 1;
        return {
          ...p,
          triage,
          priority:
            p.priority + triage.organizationScore + triage.recencyScore,
        };
      }),
    );

    const aQueue = enriched.filter((p) => p.triage.queue === "A_PRIORITY");
    const bQueue = enriched.filter((p) => p.triage.queue === "B_PRIORITY");
    const cQueueBase = enriched.filter((p) => p.triage.queue === "C_ARCHIVE");

    // Shared daily canary cap across partitions (A+B same day ≤ 120 total).
    const remaining = dryRun
      ? {
          maxA: isCollectorCanaryEnabled() ? 100 : COLLECTOR_DAILY_BACKLOG_CAP,
          maxB: isCollectorCanaryEnabled() ? 20 : COLLECTOR_DAILY_BACKLOG_CAP,
          maxAb: isCollectorCanaryEnabled() ? 120 : COLLECTOR_DAILY_BACKLOG_CAP,
          used: { aUsed: 0, bUsed: 0, abUsed: 0, runsCounted: 0 },
        }
      : await getRemainingDailyAbCaps();
    const caps = {
      maxA: remaining.maxA,
      maxB: remaining.maxB,
      maxAb: remaining.maxAb,
    };
    const { cappedAB, overflow, counts: cappedCounts } = applyCanaryAbCaps(
      aQueue,
      bQueue,
      caps,
    );
    const cQueue = [...cQueueBase, ...overflow];
    queueCounts.C_ARCHIVE = cQueue.length;
    queueCounts.A_PRIORITY = cappedCounts.A_PRIORITY;
    queueCounts.B_PRIORITY = cappedCounts.B_PRIORITY;
    const cappedACount = cappedCounts.A_PRIORITY;
    const cappedBCount = cappedCounts.B_PRIORITY;

    // C_ARCHIVE (+ overflow): preserve as discovered but not daily backlog
    const persistKinds = await mapPool(cQueue, 4, async (p) => persistDiscovered(p));
    for (const kind of persistKinds) {
      if (kind === "new") stats.newSurveysCount += 1;
      else stats.duplicateSurveysCount += 1;
    }

    // Inline: capped A/B first
    const toValidate = cappedAB.slice(0, inlineBudget);
    const toDefer = cappedAB.slice(inlineBudget);
    let inlinePageValidates = 0;

    const deferKinds = await mapPool(toDefer, 4, async (p) => persistDiscovered(p));
    for (const kind of deferKinds) {
      if (kind === "new") stats.newSurveysCount += 1;
      else stats.duplicateSurveysCount += 1;
    }

    for (const p of toValidate) {
      if (Date.now() - startedAt > runtimeMaxMs) {
        const kind = await persistDiscovered(p);
        if (kind === "new") stats.newSurveysCount += 1;
        else stats.duplicateSurveysCount += 1;
        continue;
      }
      inlinePageValidates += 1;
      try {
        const processed = await timePhase(timing, "inline_page_validate", () =>
          processSurveyCandidate({
            rawUrl: p.candidateUrl,
            searchTitle: p.sourceTitle,
          }),
        );
        if (!processed.ok) {
          if (
            processed.stage === "page" &&
            processed.status === "invalid" &&
            processed.canonicalUrl &&
            processed.platform
          ) {
            stats.invalidSavedCount = (stats.invalidSavedCount || 0) + 1;
            if (!dryRun) {
              const upserted = await upsertSurveyLink({
                canonicalUrl: processed.canonicalUrl,
                originalUrl: processed.originalUrl || p.originalUrl,
                platform: processed.platform,
                title: processed.title,
                status: "invalid",
              });
              await insertSurveySource({
                surveyLinkId: upserted.link.id,
                sourceType: p.sourceType,
                sourceUrl: p.sourceUrl,
                sourceTitle: p.sourceTitle,
                searchQuery: p.searchQuery,
                sourcePublishedAt: p.publishedAt,
              });
            }
            knownCanonicals.set(processed.canonicalUrl, {
              id: "x",
              status: "invalid",
              platform: processed.platform,
            });
            stats.newSurveysCount += 1;
          } else if (processed.stage === "redirect") {
            stats.unreachableCount = (stats.unreachableCount || 0) + 1;
            const kind = await persistDiscovered(p);
            if (kind === "new") stats.newSurveysCount += 1;
          } else {
            const kind = await persistDiscovered(p);
            if (kind === "new") stats.newSurveysCount += 1;
          }
          continue;
        }

        if (!dryRun) {
          const upserted = await upsertSurveyLink({
            canonicalUrl: processed.canonicalUrl,
            originalUrl: processed.originalUrl,
            platform: processed.platform,
            title: processed.title,
            status: processed.status,
          });
          knownCanonicals.set(processed.canonicalUrl, {
            id: upserted.link.id,
            status: processed.status,
            platform: processed.platform,
          });
          await insertSurveySource({
            surveyLinkId: upserted.link.id,
            sourceType: p.sourceType,
            sourceUrl: p.sourceUrl,
            sourceTitle: p.sourceTitle,
            searchQuery: p.searchQuery,
            sourcePublishedAt: p.publishedAt,
          });
          if (upserted.isNew) stats.newSurveysCount += 1;
          else stats.duplicateSurveysCount += 1;
        } else {
          if (knownCanonicals.has(processed.canonicalUrl)) {
            stats.duplicateSurveysCount += 1;
          } else {
            knownCanonicals.set(processed.canonicalUrl, {
              id: "dry",
              status: processed.status,
              platform: processed.platform,
            });
            stats.newSurveysCount += 1;
          }
        }

        if (
          processed.status === "active" ||
          processed.status === "closed" ||
          processed.status === "restricted"
        ) {
          stats.verifiedSavedCount = (stats.verifiedSavedCount || 0) + 1;
        }
        if (processed.status === "closed") {
          stats.closedCount = (stats.closedCount || 0) + 1;
        }
        if (processed.status === "restricted") {
          stats.restrictedCount = (stats.restrictedCount || 0) + 1;
        }
        if (processed.status === "unreachable") {
          stats.unreachableCount = (stats.unreachableCount || 0) + 1;
        }
      } catch (error) {
        stats.errorCount += 1;
        stats.errors.push(
          `${p.candidateUrl}: ${error instanceof Error ? error.message : String(error)}`,
        );
        const kind = await persistDiscovered(p);
        if (kind === "new") stats.newSurveysCount += 1;
      }
      knownSources.add(p.sourceUrl);
    }

    finalizePhaseTiming(timing);
    const elapsedMs = timing.totalMs;
    const status =
      stats.errorCount === 0
        ? "completed"
        : stats.newSurveysCount + stats.duplicateSurveysCount > 0
          ? "partial"
          : "failed";

    const capMarker = formatCapMarker(cappedACount, cappedBCount);
    const summaryBase = `[org_v1.2] partition=${partition} ${capMarker} inline=${inlinePageValidates}/${inlineBudget} backlogAB=${toDefer.length + inlinePageValidates} archive=${cQueue.length} elapsedMs=${elapsedMs} ${formatPhaseTiming(timing)} usedBefore=${remaining.used.abUsed}`;

    let finished: CollectionRunRow | null = run;
    if (!dryRun && run) {
      finished = await finishCollectionRun({
        runId: run.id,
        status,
        queriesCount: stats.queriesCount,
        resultsCount: stats.resultsCount,
        candidateLinksCount: stats.candidateLinksCount,
        newSurveysCount: stats.newSurveysCount,
        duplicateSurveysCount: stats.duplicateSurveysCount,
        errorCount: stats.errorCount,
        errorSummary:
          stats.errors.length > 0
            ? `${summaryBase}\n${stats.errors.slice(0, 20).join("\n")}`.slice(
                0,
                4000,
              )
            : summaryBase.slice(0, 4000),
      });
    }

    return {
      ok: true,
      dryRun,
      run: finished,
      stats,
      meta: {
        strategy: "org_v1_2",
        partition,
        inlinePageValidates,
        inlineBudget,
        deferredDiscovered: toDefer.length,
        archivedSkipped: cQueue.length,
        queueCounts,
        cappedA: cappedACount,
        cappedB: cappedBCount,
        elapsedMs,
        runtimeTargetMs,
        sampleOrgReview: sampleReview,
        phaseTiming: timing,
        topPhase: topPhase(timing),
        naverConcurrency: NAVER_SEARCH_CONCURRENCY,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun && run) {
      await finishCollectionRun({
        runId: run.id,
        status: "failed",
        queriesCount: stats.queriesCount,
        resultsCount: stats.resultsCount,
        candidateLinksCount: stats.candidateLinksCount,
        newSurveysCount: stats.newSurveysCount,
        duplicateSurveysCount: stats.duplicateSurveysCount,
        errorCount: stats.errorCount + 1,
        errorSummary:
          `[org_v1.2] partition=${partition} failed: ${message}`.slice(0, 4000),
      });
    }
    return { ok: false, status: 500, error: message };
  }
}
