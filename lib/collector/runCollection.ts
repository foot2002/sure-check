import {
  COLLECTOR_MAX_API_CALLS,
  COLLECTOR_MAX_PAGE_VALIDATES,
  COLLECTOR_MAX_RUNTIME_MS,
  COLLECTOR_SEARCH_DELAY_MS,
  COLLECTOR_SEARCH_DISPLAY,
  getCollectorConfigError,
  isCollectorConfigured,
} from "@/lib/collector/config";
import {
  buildCollectorSearchQueries,
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
  tryStartCollectionRun,
  upsertCollectionQueryStat,
  upsertSurveyLink,
} from "@/lib/collector/repository";
import { validateSurveyResponseUrl } from "@/lib/collector/surveyUrlRules";
import { normalizeSurveyUrl } from "@/lib/collector/urlNormalize";
import type {
  CollectionRunRow,
  CollectionRunTrigger,
  CollectionRunStats,
  CollectorSourceType,
} from "@/lib/collector/types";

export type RunCollectionResult =
  | {
      ok: true;
      run: CollectionRunRow;
      stats: CollectionRunStats;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type Endpoint = "webkr" | "blog" | "cafearticle";

const ENDPOINT_SOURCE: Record<Endpoint, CollectorSourceType> = {
  webkr: "web",
  blog: "blog",
  cafearticle: "cafe",
};

const CYCLE: Endpoint[] = ["blog", "cafearticle", "webkr"];

/**
 * Domain queries: 2 sources (coverage). Intent: 1 cycling source.
 * With 8 domain + 16 intent → ~32 API calls (under midscale 36).
 */
function endpointsForQuery(
  item: CollectorSearchQuery,
  index: number,
): Endpoint[] {
  if (item.group === "domain") {
    return index % 2 === 0
      ? ["blog", "webkr"]
      : ["cafearticle", "webkr"];
  }
  return [CYCLE[index % CYCLE.length]!];
}

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
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Execute a collection pass with dual search strategy, sort mix,
 * known-source skip, API/runtime caps, and per-query stats.
 */
export async function runCollection(input: {
  trigger: CollectionRunTrigger;
  maxQueries?: number;
  maxApiCalls?: number;
}): Promise<RunCollectionResult> {
  if (!isCollectorConfigured()) {
    return {
      ok: false,
      status: 503,
      error: getCollectorConfigError() || "수집 기능이 비활성화되어 있습니다.",
    };
  }

  const lock = await tryStartCollectionRun(input.trigger);
  if (!lock.ok) {
    return { ok: false, status: lock.status, error: lock.reason };
  }

  const stats = emptyStats();
  const startedAt = Date.now();
  const maxApiCalls = Math.min(
    input.maxApiCalls ?? COLLECTOR_MAX_API_CALLS,
    COLLECTOR_MAX_API_CALLS,
  );
  const queries = buildCollectorSearchQueries();
  const limited =
    typeof input.maxQueries === "number" && input.maxQueries > 0
      ? queries.slice(0, input.maxQueries)
      : queries;

  const knownSources = await loadKnownSourceUrls();
  const knownCanonicals = await loadKnownCanonicalUrls();
  let apiCalls = 0;
  let pageValidates = 0;

  try {
    for (let qi = 0; qi < limited.length; qi += 1) {
      if (Date.now() - startedAt > COLLECTOR_MAX_RUNTIME_MS) {
        stats.errors.push("실행시간 한도 도달 — 조기 종료");
        break;
      }
      const item = limited[qi]!;
      stats.queriesCount += 1;
      const endpoints = endpointsForQuery(item, qi);

      for (let ei = 0; ei < endpoints.length; ei += 1) {
        if (apiCalls >= maxApiCalls) break;
        if (Date.now() - startedAt > COLLECTOR_MAX_RUNTIME_MS) break;

        const endpoint = endpoints[ei]!;
        const sourceType = ENDPOINT_SOURCE[endpoint];
        // Mix date/sim: prefer query preference, alternate by endpoint index.
        const sort =
          ei % 2 === 0
            ? item.preferredSort
            : item.preferredSort === "date"
              ? "sim"
              : "date";

        const qStat = {
          collectionRunId: lock.run.id,
          searchQuery: item.query,
          sourceType,
          sortMode: sort as "sim" | "date",
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
            display: COLLECTOR_SEARCH_DISPLAY,
            sort,
          });
          qStat.resultsCount = result.resultCount;
          stats.resultsCount += result.resultCount;

          const uniqueLinks = new Set<string>();
          for (const hit of result.hits) {
            uniqueLinks.add(hit.link);
            if (knownSources.has(hit.link)) {
              qStat.skippedKnownSourceCount += 1;
              stats.skippedKnownSources =
                (stats.skippedKnownSources || 0) + 1;
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
              try {
                // Non-shortener: skip page validate when canonical already known
                if (!isShortenerUrl(candidate)) {
                  const normalized = normalizeSurveyUrl(candidate);
                  if (!normalized.ok) {
                    stats.formatRejectedCount =
                      (stats.formatRejectedCount || 0) + 1;
                    continue;
                  }
                  const format = validateSurveyResponseUrl(
                    normalized.canonicalUrl,
                  );
                  if (!format.ok) {
                    stats.formatRejectedCount =
                      (stats.formatRejectedCount || 0) + 1;
                    continue;
                  }
                  const known = knownCanonicals.get(normalized.canonicalUrl);
                  if (known) {
                    const upserted = await upsertSurveyLink({
                      canonicalUrl: normalized.canonicalUrl,
                      originalUrl: normalized.originalUrl,
                      platform: known.platform,
                      title: hit.title,
                      status: known.status,
                    });
                    if (
                      known.status === "active" ||
                      known.status === "closed" ||
                      known.status === "restricted"
                    ) {
                      qStat.validSurveyCount += 1;
                    }
                    if (known.status === "unreachable") {
                      qStat.unreachableCount += 1;
                    } else if (upserted.isNew) {
                      qStat.newSurveyCount += 1;
                      stats.newSurveysCount += 1;
                    } else {
                      qStat.duplicateSurveyCount += 1;
                      stats.duplicateSurveysCount += 1;
                    }
                    await insertSurveySource({
                      surveyLinkId: upserted.link.id,
                      sourceType: hit.sourceType,
                      sourceUrl: hit.link,
                      sourceTitle: hit.title,
                      searchQuery: hit.searchQuery,
                      sourcePublishedAt: hit.publishedAt ?? null,
                    });
                    knownSources.add(hit.link);
                    continue;
                  }
                  if (pageValidates >= COLLECTOR_MAX_PAGE_VALIDATES) {
                    const upserted = await upsertSurveyLink({
                      canonicalUrl: normalized.canonicalUrl,
                      originalUrl: normalized.originalUrl,
                      platform: format.platform,
                      title: hit.title,
                      status: "discovered",
                    });
                    if (upserted.isNew) {
                      qStat.newSurveyCount += 1;
                      stats.newSurveysCount += 1;
                      knownCanonicals.set(normalized.canonicalUrl, {
                        id: upserted.link.id,
                        status: "discovered",
                        platform: format.platform,
                      });
                    } else {
                      qStat.duplicateSurveyCount += 1;
                      stats.duplicateSurveysCount += 1;
                    }
                    await insertSurveySource({
                      surveyLinkId: upserted.link.id,
                      sourceType: hit.sourceType,
                      sourceUrl: hit.link,
                      sourceTitle: hit.title,
                      searchQuery: hit.searchQuery,
                      sourcePublishedAt: hit.publishedAt ?? null,
                    });
                    knownSources.add(hit.link);
                    continue;
                  }
                } else if (pageValidates >= COLLECTOR_MAX_PAGE_VALIDATES) {
                  continue;
                }

                pageValidates += 1;
                const processed = await processSurveyCandidate({
                  rawUrl: candidate,
                  searchTitle: hit.title,
                });

                if (!processed.ok && processed.stage === "format") {
                  stats.formatRejectedCount =
                    (stats.formatRejectedCount || 0) + 1;
                  continue;
                }
                if (!processed.ok && processed.stage === "redirect") {
                  qStat.unreachableCount += 1;
                  stats.unreachableCount = (stats.unreachableCount || 0) + 1;
                  continue;
                }
                if (!processed.ok && processed.stage === "page") {
                  stats.pageRejectedCount = (stats.pageRejectedCount || 0) + 1;
                  if (
                    processed.status === "invalid" &&
                    processed.canonicalUrl &&
                    processed.platform
                  ) {
                    const upserted = await upsertSurveyLink({
                      canonicalUrl: processed.canonicalUrl,
                      originalUrl: processed.originalUrl || candidate,
                      platform: processed.platform,
                      title: processed.title,
                      status: "invalid",
                    });
                    qStat.invalidCount += 1;
                    stats.invalidSavedCount =
                      (stats.invalidSavedCount || 0) + 1;
                    knownCanonicals.set(processed.canonicalUrl, {
                      id: upserted.link.id,
                      status: "invalid",
                      platform: processed.platform,
                    });
                    await insertSurveySource({
                      surveyLinkId: upserted.link.id,
                      sourceType: hit.sourceType,
                      sourceUrl: hit.link,
                      sourceTitle: hit.title,
                      searchQuery: hit.searchQuery,
                      sourcePublishedAt: hit.publishedAt ?? null,
                    });
                    knownSources.add(hit.link);
                  }
                  continue;
                }
                if (!processed.ok) continue;

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

                if (
                  processed.status === "active" ||
                  processed.status === "closed" ||
                  processed.status === "restricted"
                ) {
                  qStat.validSurveyCount += 1;
                }
                if (processed.status === "active") {
                  stats.verifiedSavedCount =
                    (stats.verifiedSavedCount || 0) + 1;
                }
                if (processed.status === "closed") {
                  qStat.closedCount += 1;
                  stats.closedCount = (stats.closedCount || 0) + 1;
                }
                if (processed.status === "restricted") {
                  qStat.restrictedCount += 1;
                  stats.restrictedCount = (stats.restrictedCount || 0) + 1;
                }
                if (processed.status === "unreachable") {
                  qStat.unreachableCount += 1;
                  stats.unreachableCount = (stats.unreachableCount || 0) + 1;
                  await insertSurveySource({
                    surveyLinkId: upserted.link.id,
                    sourceType: hit.sourceType,
                    sourceUrl: hit.link,
                    sourceTitle: hit.title,
                    searchQuery: hit.searchQuery,
                    sourcePublishedAt: hit.publishedAt ?? null,
                  });
                  knownSources.add(hit.link);
                  continue;
                }

                if (upserted.isNew) {
                  qStat.newSurveyCount += 1;
                  stats.newSurveysCount += 1;
                } else {
                  qStat.duplicateSurveyCount += 1;
                  stats.duplicateSurveysCount += 1;
                }

                await insertSurveySource({
                  surveyLinkId: upserted.link.id,
                  sourceType: hit.sourceType,
                  sourceUrl: hit.link,
                  sourceTitle: hit.title,
                  searchQuery: hit.searchQuery,
                  sourcePublishedAt: hit.publishedAt ?? null,
                });
                knownSources.add(hit.link);
              } catch (error) {
                qStat.errorCount += 1;
                stats.errorCount += 1;
                stats.errors.push(
                  `${candidate}: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
            knownSources.add(hit.link);
          }
          qStat.uniqueSourceCount = uniqueLinks.size;
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
        await upsertCollectionQueryStat(qStat);
        await sleep(COLLECTOR_SEARCH_DELAY_MS);
      }
      if (apiCalls >= maxApiCalls) break;
    }

    const status =
      stats.errorCount === 0
        ? "completed"
        : stats.newSurveysCount + stats.duplicateSurveysCount > 0
          ? "partial"
          : "failed";

    const finished = await finishCollectionRun({
      runId: lock.run.id,
      status,
      queriesCount: stats.queriesCount,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.errorCount,
      errorSummary:
        stats.errors.length > 0
          ? stats.errors.slice(0, 30).join("\n").slice(0, 4000)
          : null,
    });

    return { ok: true, run: finished || lock.run, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stats.errorCount += 1;
    stats.errors.push(message);
    await finishCollectionRun({
      runId: lock.run.id,
      status: "failed",
      queriesCount: stats.queriesCount,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.errorCount,
      errorSummary: stats.errors.slice(0, 30).join("\n").slice(0, 4000),
    });
    return { ok: false, status: 500, error: message };
  }
}
