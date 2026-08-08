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
  selectOrgV1PageOneQueries,
  type CollectorSearchQuery,
} from "@/lib/collector/searchQueries";
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
import {
  getCanaryDailyCaps,
  isCollectorCanaryEnabled,
} from "@/lib/collector/canaryPolicy";
import type {
  CollectionRunRow,
  CollectionRunTrigger,
  CollectionRunStats,
  CollectorPlatform,
  CollectorSourceType,
  CollectionQueryStatInput,
} from "@/lib/collector/types";

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
        inlinePageValidates: number;
        inlineBudget: number;
        deferredDiscovered: number;
        archivedSkipped: number;
        queueCounts: Record<TriageQueue, number>;
        elapsedMs: number;
        runtimeTargetMs: number;
        sampleOrgReview: Record<string, number>;
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
}): Promise<OrgV11RunResult> {
  const dryRun = Boolean(input.dryRun);
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

  const display = COLLECTOR_SEARCH_DISPLAY_ORG;
  const inlineBudget =
    input.inlinePageValidateBudget ?? COLLECTOR_INLINE_PAGE_VALIDATE_ORG;
  const stats = emptyStats();
  const startedAt = Date.now();
  const maxApiCalls = Math.min(
    input.maxApiCalls ?? COLLECTOR_MAX_API_CALLS,
    COLLECTOR_MAX_API_CALLS,
  );
  const deepReserve = Math.max(
    1,
    Math.floor(maxApiCalls * COLLECTOR_DEEP_SEARCH_API_SHARE),
  );

  let limited = selectOrgV1PageOneQueries(maxApiCalls, deepReserve);
  if (typeof input.maxQueries === "number" && input.maxQueries > 0) {
    limited = limited.slice(0, input.maxQueries);
  }

  const knownSources = dryRun
    ? new Set<string>()
    : await loadKnownSourceUrls();
  const knownCanonicals = dryRun
    ? new Map<
        string,
        { id: string; status: string; platform: CollectorPlatform }
      >()
    : await loadKnownCanonicalUrls();

  // dry-run still benefits from known sets when DB is available
  if (dryRun && isCollectorConfigured()) {
    try {
      const ks = await loadKnownSourceUrls();
      for (const u of ks) knownSources.add(u);
      const kc = await loadKnownCanonicalUrls();
      for (const [k, v] of kc) knownCanonicals.set(k, v);
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
    for (let qi = 0; qi < limited.length; qi += 1) {
      if (Date.now() - startedAt > COLLECTOR_MAX_RUNTIME_MS) {
        stats.errors.push("실행시간 한도 도달 — 조기 종료");
        break;
      }
      if (apiCalls >= maxApiCalls - deepReserve) break;

      const item = limited[qi]!;
      stats.queriesCount += 1;
      pageOneExecuted.push(item);
      const endpoint = CYCLE[qi % CYCLE.length]!;
      const sourceType = ENDPOINT_SOURCE[endpoint];
      const sort = item.sort || item.preferredSort;

      const qStat: CollectionQueryStatInput = {
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
      };

      apiCalls += 1;
      stats.apiCalls = apiCalls;

      try {
        const result = await searchNaverEndpoint(endpoint, item.query, {
          display,
          sort,
          start: 1,
        });
        qStat.resultsCount = result.resultCount;
        stats.resultsCount += result.resultCount;
        await handleHits(result.hits, qStat);
      } catch (error) {
        qStat.errorCount += 1;
        stats.errorCount += 1;
        const message =
          error instanceof NaverSearchError
            ? `[${endpoint}/${error.kind}] ${error.message}`
            : String(error);
        stats.errors.push(`${item.query}: ${message}`);
      }

      stats.queryStats = [...(stats.queryStats || []), qStat];
      if (!dryRun) await upsertCollectionQueryStat(qStat);
      await sleep(COLLECTOR_SEARCH_DELAY_MS);
    }

    // Deep pages (search only — still no page validate here)
    const depthEnabled = new Map(
      buildCollectorSearchQueries({ strategy: "org_v1" })
        .filter((q) => q.depthEnabled)
        .map((q) => [q.query, q]),
    );
    const historical = dryRun
      ? []
      : await loadTopPerformingSearchQueries({ lookbackDays: 7, limit: 20 });
    const deepCandidates: CollectorSearchQuery[] = [];
    const seenQ = new Set<string>();
    for (const row of historical) {
      const item = depthEnabled.get(row.searchQuery);
      if (!item || seenQ.has(item.query) || row.newSurveyCount <= 0) continue;
      deepCandidates.push(item);
      seenQ.add(item.query);
    }
    if (deepCandidates.length === 0) {
      for (const item of pageOneExecuted) {
        if (!item.depthEnabled || seenQ.has(item.query)) continue;
        deepCandidates.push(item);
        seenQ.add(item.query);
        if (deepCandidates.length >= 3) break;
      }
    }

    const deepStarts = [101, 201].slice(0, COLLECTOR_DEEP_SEARCH_MAX_PAGES);
    let deepIdx = 0;
    outer: for (const item of deepCandidates) {
      if (apiCalls >= maxApiCalls) break;
      if (Date.now() - startedAt > COLLECTOR_MAX_RUNTIME_MS) break;
      const endpoint = CYCLE[deepIdx % CYCLE.length]!;
      deepIdx += 1;
      for (const start of deepStarts) {
        if (apiCalls >= maxApiCalls) break outer;
        if (Date.now() - startedAt > COLLECTOR_MAX_RUNTIME_MS) break outer;
        const sourceType = ENDPOINT_SOURCE[endpoint];
        const sort = item.sort || item.preferredSort;
        const qStat: CollectionQueryStatInput = {
          collectionRunId: runId,
          searchQuery: `${item.query} [deep:start=${start}]`,
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
        };
        apiCalls += 1;
        stats.apiCalls = apiCalls;
        stats.queriesCount += 1;
        try {
          const result = await searchNaverEndpoint(endpoint, item.query, {
            display,
            sort,
            start,
          });
          qStat.resultsCount = result.resultCount;
          stats.resultsCount += result.resultCount;
          await handleHits(result.hits, qStat);
        } catch (error) {
          qStat.errorCount += 1;
          stats.errorCount += 1;
          stats.errors.push(
            `${item.query} deep@${start}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        stats.queryStats = [...(stats.queryStats || []), qStat];
        if (!dryRun) await upsertCollectionQueryStat(qStat);
        await sleep(COLLECTOR_SEARCH_DELAY_MS);
      }
    }

    // ── Phase 2: org_v1.2 triage → A inline, B backlog, C archive ──
    const queueCounts: Record<TriageQueue, number> = {
      A_PRIORITY: 0,
      B_PRIORITY: 0,
      C_ARCHIVE: 0,
    };
    const enriched = pending.map((p) => {
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
      return { ...p, triage, priority: p.priority + triage.organizationScore + triage.recencyScore };
    });

    const aQueue = enriched.filter((p) => p.triage.queue === "A_PRIORITY");
    const bQueue = enriched.filter((p) => p.triage.queue === "B_PRIORITY");
    const cQueueBase = enriched.filter((p) => p.triage.queue === "C_ARCHIVE");

    // Canary: A≤120, B≤30, AB≤150. Non-canary: soft AB cap (180) with A-first recency order.
    const canaryOn = isCollectorCanaryEnabled();
    const caps = canaryOn
      ? getCanaryDailyCaps(true)
      : {
          maxA: COLLECTOR_DAILY_BACKLOG_CAP,
          maxB: COLLECTOR_DAILY_BACKLOG_CAP,
          maxAb: COLLECTOR_DAILY_BACKLOG_CAP,
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

    // C_ARCHIVE (+ overflow): preserve as discovered but not daily backlog
    for (const p of cQueue) {
      const kind = await persistDiscovered(p);
      if (kind === "new") stats.newSurveysCount += 1;
      else stats.duplicateSurveysCount += 1;
    }

    // Inline: capped A/B first
    const toValidate = cappedAB.slice(0, inlineBudget);
    const toDefer = cappedAB.slice(inlineBudget);
    let inlinePageValidates = 0;

    for (const p of toDefer) {
      const kind = await persistDiscovered(p);
      if (kind === "new") {
        stats.newSurveysCount += 1;
      } else {
        stats.duplicateSurveysCount += 1;
      }
    }

    for (const p of toValidate) {
      if (Date.now() - startedAt > COLLECTOR_MAX_RUNTIME_MS) {
        const kind = await persistDiscovered(p);
        if (kind === "new") stats.newSurveysCount += 1;
        else stats.duplicateSurveysCount += 1;
        continue;
      }
      inlinePageValidates += 1;
      try {
        const processed = await processSurveyCandidate({
          rawUrl: p.candidateUrl,
          searchTitle: p.sourceTitle,
        });
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

    const elapsedMs = Date.now() - startedAt;
    const status =
      stats.errorCount === 0
        ? "completed"
        : stats.newSurveysCount + stats.duplicateSurveysCount > 0
          ? "partial"
          : "failed";

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
            ? `[org_v1.1] ${stats.errors.slice(0, 30).join("\n")}`.slice(0, 4000)
            : `[org_v1.2] inline=${inlinePageValidates}/${inlineBudget} backlogAB=${toDefer.length + inlinePageValidates} archive=${cQueue.length} elapsedMs=${elapsedMs}`,
      });
    }

    return {
      ok: true,
      dryRun,
      run: finished,
      stats,
      meta: {
        strategy: "org_v1_2",
        inlinePageValidates,
        inlineBudget,
        deferredDiscovered: toDefer.length,
        archivedSkipped: cQueue.length,
        queueCounts,
        elapsedMs,
        runtimeTargetMs: COLLECTOR_ORG_RUNTIME_TARGET_MS,
        sampleOrgReview: sampleReview,
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
        errorSummary: `[org_v1.1] ${message}`.slice(0, 4000),
      });
    }
    return { ok: false, status: 500, error: message };
  }
}
