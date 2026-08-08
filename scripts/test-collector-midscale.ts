/**
 * Mid-scale collector run + Naver Form audit + quality sample.
 *
 * Plan (computed before run):
 * - seeds: 12
 * - sources: blog, cafearticle, webkr (3)
 * - display: 20
 * - API calls: 12 * 3 = 36
 * - max search hits: 36 * 20 = 720
 *
 * Never prints secrets.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCollectorConfigured } from "../lib/collector/config";
import { extractSurveyUrlsFromText } from "../lib/collector/extractLinks";
import {
  NaverSearchError,
  searchNaverEndpoint,
} from "../lib/collector/naverSearch";
import { processSurveyCandidate } from "../lib/collector/processCandidate";
import {
  finishCollectionRun,
  insertSurveySource,
  tryStartCollectionRun,
  upsertSurveyLink,
} from "../lib/collector/repository";
import { createSupabaseServerClient } from "../lib/supabase/server";
import {
  classifyUrlKind,
  isShortenerUrl,
  validateSurveyResponseUrl,
} from "../lib/collector/platformDetect";
import { isUrlLikeTitle } from "../lib/collector/titleUtils";
import type { CollectorSurveyStatus } from "../lib/collector/types";

const SEEDS = [
  "설문조사 참여",
  "만족도 조사",
  "인식조사",
  "실태조사",
  "수요조사",
  "의견수렴",
  "연구 설문",
  "논문 설문",
  "시민 설문",
  "교육 만족도",
  "행사 만족도",
  "참여자 모집",
] as const;

const ENDPOINTS = ["blog", "cafearticle", "webkr"] as const;
const DISPLAY = 20;
const EXPECTED_API_CALLS = SEEDS.length * ENDPOINTS.length;
const MAX_HITS = EXPECTED_API_CALLS * DISPLAY;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type StatusCount = Record<string, number>;

async function main() {
  loadLocalEnvFiles();
  if (!isCollectorConfigured()) throw new Error("collector not configured");

  console.log(
    JSON.stringify(
      {
        plan: {
          seeds: SEEDS.length,
          endpoints: ENDPOINTS.length,
          display: DISPLAY,
          expectedApiCalls: EXPECTED_API_CALLS,
          maxHits: MAX_HITS,
        },
      },
      null,
      2,
    ),
  );

  const supabase = createSupabaseServerClient();

  const { count: linksBefore } = await supabase
    .from("survey_links")
    .select("id", { count: "exact", head: true });
  const beforeCount = linksBefore ?? 0;

  // Clear stuck locks
  const { data: stuck } = await supabase
    .from("collection_runs")
    .select("id")
    .eq("status", "running");
  for (const row of stuck || []) {
    await finishCollectionRun({
      runId: String(row.id),
      status: "failed",
      queriesCount: 0,
      resultsCount: 0,
      candidateLinksCount: 0,
      newSurveysCount: 0,
      duplicateSurveysCount: 0,
      errorCount: 1,
      errorSummary: "cleared before mid-scale run",
    });
  }

  // Reclassify closedform invalid → closed (requires migration 005)
  const { data: closedformRows, error: closedErr } = await supabase
    .from("survey_links")
    .select("id, canonical_url, status")
    .ilike("canonical_url", "%closedform%");
  let closedReclass = { attempted: 0, updated: 0, error: null as string | null };
  if (closedErr) {
    closedReclass.error = closedErr.message;
  } else {
    for (const row of closedformRows || []) {
      closedReclass.attempted += 1;
      if (row.status === "closed") continue;
      const { error } = await supabase
        .from("survey_links")
        .update({ status: "closed" })
        .eq("id", row.id);
      if (error) {
        closedReclass.error = error.message;
        break;
      }
      closedReclass.updated += 1;
    }
  }
  console.log(JSON.stringify({ closedformReclass: closedReclass }, null, 2));
  if (closedReclass.error?.includes("check") || closedReclass.error?.includes("violates")) {
    throw new Error(
      "migration 005 not applied — run db/migrations/005_survey_link_status_taxonomy.sql in Supabase first",
    );
  }

  const lock = await tryStartCollectionRun("admin");
  if (!lock.ok) throw new Error(lock.reason);

  const stats = {
    apiCalls: 0,
    apiErrors: [] as string[],
    resultsCount: 0,
    candidateLinksCount: 0,
    formatRejectedCount: 0,
    pageRejectedCount: 0,
    redirectFailedCount: 0,
    newSurveysCount: 0,
    duplicateSurveysCount: 0,
    savedByStatus: {} as StatusCount,
    platforms: { google_forms: 0, naver_form: 0, moaform: 0 } as StatusCount,
    falsePositives: [] as Array<{ url: string; reason: string }>,
    naverAudit: {
      candidatesMentioningNaverForm: 0,
      candidatesNaverMe: 0,
      formatAcceptedNaver: 0,
      savedNaver: 0,
      sampleExtracts: [] as string[],
      searchHitsWithFormNaverText: 0,
    },
  };

  try {
    for (const seed of SEEDS) {
      for (const endpoint of ENDPOINTS) {
        stats.apiCalls += 1;
        try {
          const result = await searchNaverEndpoint(endpoint, seed, {
            display: DISPLAY,
          });
          stats.resultsCount += result.resultCount;

          for (const hit of result.hits) {
            const blob = `${hit.title}\n${hit.description}\n${hit.link}`;
            if (/form\.naver\.com|네이버\s*폼|네이버폼/i.test(blob)) {
              stats.naverAudit.searchHitsWithFormNaverText += 1;
            }

            const candidates = extractSurveyUrlsFromText(
              hit.link,
              hit.title,
              hit.description,
            );
            for (const candidate of candidates) {
              stats.candidateLinksCount += 1;
              if (/form\.naver\.com/i.test(candidate)) {
                stats.naverAudit.candidatesMentioningNaverForm += 1;
                if (stats.naverAudit.sampleExtracts.length < 10) {
                  stats.naverAudit.sampleExtracts.push(candidate);
                }
              }
              if (isShortenerUrl(candidate) && /naver\.me/i.test(candidate)) {
                stats.naverAudit.candidatesNaverMe += 1;
              }

              const processed = await processSurveyCandidate({
                rawUrl: candidate,
                searchTitle: hit.title,
              });

              if (!processed.ok && processed.stage === "format") {
                stats.formatRejectedCount += 1;
                stats.falsePositives.push({
                  url: candidate,
                  reason: `[format] ${processed.reason}`,
                });
                continue;
              }
              if (!processed.ok && processed.stage === "redirect") {
                stats.redirectFailedCount += 1;
                stats.falsePositives.push({
                  url: candidate,
                  reason: `[redirect] ${processed.reason}`,
                });
                continue;
              }
              if (!processed.ok && processed.stage === "page") {
                stats.pageRejectedCount += 1;
                stats.falsePositives.push({
                  url: processed.canonicalUrl || candidate,
                  reason: `[page] ${processed.reason}`,
                });
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
                  stats.savedByStatus.invalid =
                    (stats.savedByStatus.invalid || 0) + 1;
                  if (upserted.isNew) stats.newSurveysCount += 1;
                  else stats.duplicateSurveysCount += 1;
                  await insertSurveySource({
                    surveyLinkId: upserted.link.id,
                    sourceType: hit.sourceType,
                    sourceUrl: hit.link,
                    sourceTitle: hit.title,
                    searchQuery: hit.searchQuery,
                    sourcePublishedAt: hit.publishedAt ?? null,
                  });
                }
                continue;
              }
              if (!processed.ok) continue;

              if (processed.platform === "naver_form") {
                stats.naverAudit.formatAcceptedNaver += 1;
              }

              const upserted = await upsertSurveyLink({
                canonicalUrl: processed.canonicalUrl,
                originalUrl: processed.originalUrl,
                platform: processed.platform,
                title: processed.title,
                status: processed.status,
              });
              stats.savedByStatus[processed.status] =
                (stats.savedByStatus[processed.status] || 0) + 1;
              stats.platforms[processed.platform] =
                (stats.platforms[processed.platform] || 0) + 1;
              if (processed.platform === "naver_form") {
                stats.naverAudit.savedNaver += 1;
              }
              if (upserted.isNew) stats.newSurveysCount += 1;
              else stats.duplicateSurveysCount += 1;
              await insertSurveySource({
                surveyLinkId: upserted.link.id,
                sourceType: hit.sourceType,
                sourceUrl: hit.link,
                sourceTitle: hit.title,
                searchQuery: hit.searchQuery,
                sourcePublishedAt: hit.publishedAt ?? null,
              });
            }
          }
        } catch (error) {
          const msg =
            error instanceof NaverSearchError
              ? `${endpoint}/${seed}/${error.kind}: ${error.message}`
              : `${endpoint}/${seed}: ${String(error)}`;
          stats.apiErrors.push(msg);
        }
        await sleep(250);
      }
    }

    await finishCollectionRun({
      runId: lock.run.id,
      status: stats.apiErrors.length === 0 ? "completed" : "partial",
      queriesCount: stats.apiCalls,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.apiErrors.length,
      errorSummary: stats.apiErrors.slice(0, 20).join("\n").slice(0, 4000) || null,
    });
  } catch (error) {
    await finishCollectionRun({
      runId: lock.run.id,
      status: "failed",
      queriesCount: stats.apiCalls,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.apiErrors.length + 1,
      errorSummary: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // Extra Naver Form diagnostic (same 36-call budget already used — analyze only).
  // Also run 3 dedicated probe calls OUTSIDE the main run accounting? User capped at 36.
  // Keep probes as post-analysis of collected hits only.

  // ---- Quality sample: prefer newest links first, up to 50 ----
  const { data: newestLinks } = await supabase
    .from("survey_links")
    .select("id, canonical_url, platform, title, status")
    .order("last_discovered_at", { ascending: false })
    .limit(80);

  const qualityPool = newestLinks || [];
  const sampleSize = Math.min(50, qualityPool.length);
  const sample = qualityPool.slice(0, sampleSize);

  const sampleClasses: StatusCount = {};
  let titleUrlCount = 0;
  let titleOkCount = 0;
  let platformMatch = 0;
  let statusMatch = 0;
  let realSurveyInSample = 0;
  let falsePositiveLabeledActiveOrDiscovered = 0;
  const sampleDetails: Array<Record<string, unknown>> = [];

  for (const row of sample) {
    if (isUrlLikeTitle(row.title)) titleUrlCount += 1;
    else if (row.title && String(row.title).trim() && String(row.title) !== "제목 확인 필요") {
      titleOkCount += 1;
    }

    const processed = await processSurveyCandidate({
      rawUrl: String(row.canonical_url),
      searchTitle: row.title,
    });
    const classified: CollectorSurveyStatus | "unresolved" = processed.ok
      ? processed.status
      : processed.verdict === "not_survey"
        ? "invalid"
        : processed.status || "unreachable";
    const classKey =
      classified === "discovered" ? "판단불가(discovered)" : String(classified);
    sampleClasses[classKey] = (sampleClasses[classKey] || 0) + 1;

    const kind = classifyUrlKind(String(row.canonical_url));
    const platformOk =
      kind === row.platform ||
      (kind === "shortener" && Boolean(row.platform));
    if (platformOk) platformMatch += 1;
    if (String(row.status) === String(classified)) statusMatch += 1;

    const isReal =
      classified === "active" ||
      classified === "closed" ||
      classified === "restricted" ||
      classified === "unreachable" ||
      classified === "discovered";
    if (isReal) realSurveyInSample += 1;

    if (
      (row.status === "active" || row.status === "discovered") &&
      classified === "invalid"
    ) {
      falsePositiveLabeledActiveOrDiscovered += 1;
    }

    if (sampleDetails.length < 15) {
      sampleDetails.push({
        url: row.canonical_url,
        dbStatus: row.status,
        recheck: classified,
        platform: row.platform,
        reason: processed.ok ? processed.reason : processed.reason,
      });
    }
    await sleep(80);
  }

  const { count: linksAfter } = await supabase
    .from("survey_links")
    .select("id", { count: "exact", head: true });

  // Dedup checks
  const { data: allLinks2 } = await supabase
    .from("survey_links")
    .select("id, canonical_url, platform, title, status");
  const links = allLinks2 || [];
  const urls = links.map((l) => String(l.canonical_url));
  const uniqueUrls = new Set(urls);
  const { data: sources } = await supabase
    .from("survey_sources")
    .select("survey_link_id, source_url");
  const sourceKeys = (sources || []).map(
    (s) => `${s.survey_link_id}||${s.source_url}`,
  );
  const uniqueSources = new Set(sourceKeys);

  const { count: runningCount } = await supabase
    .from("collection_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const byStatus: StatusCount = {};
  const byPlatform: StatusCount = {};
  let titleUrlInDb = 0;
  for (const row of links) {
    byStatus[String(row.status)] = (byStatus[String(row.status)] || 0) + 1;
    byPlatform[String(row.platform)] = (byPlatform[String(row.platform)] || 0) + 1;
    if (isUrlLikeTitle(row.title)) titleUrlInDb += 1;
  }

  const defaultList = links.filter(
    (l) => l.status === "active" || l.status === "discovered",
  );
  const invalidPatternsInDefault = defaultList.filter((l) => {
    const u = String(l.canonical_url).toLowerCase();
    return (
      u.includes("help.moaform") ||
      u.includes("api.moaform") ||
      /^https?:\/\/answer\.moaform\.com\/?$/.test(u)
    );
  });

  const report = {
    closedformReclass: closedReclass,
    collection: {
      apiCalls: stats.apiCalls,
      expectedApiCalls: EXPECTED_API_CALLS,
      apiErrors: stats.apiErrors,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      formatRejectedCount: stats.formatRejectedCount,
      pageRejectedCount: stats.pageRejectedCount,
      redirectFailedCount: stats.redirectFailedCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      dbLinksBefore: beforeCount,
      dbLinksAfter: linksAfter ?? links.length,
      dbLinksDelta: (linksAfter ?? links.length) - beforeCount,
      savedByStatusThisPass: stats.savedByStatus,
      platformsTouchedThisPass: stats.platforms,
      falsePositivesSample: stats.falsePositives.slice(0, 50),
    },
    naverAudit: {
      ...stats.naverAudit,
      domainFilterIncludesFormNaver: true,
      domainFilterIncludesNaverMe: true,
      seedsUsed: SEEDS,
      note:
        stats.naverAudit.savedNaver === 0
          ? stats.naverAudit.candidatesMentioningNaverForm === 0 &&
            stats.naverAudit.candidatesNaverMe === 0
            ? "검색 히트/추출에서 form.naver.com·naver.me 후보 부재 (검색 결과 부재 가능성 큼)"
            : stats.naverAudit.formatAcceptedNaver === 0
              ? "후보는 있었으나 형식/리디렉션/페이지 단계에서 탈락"
              : "저장 단계 이슈 가능"
          : "네이버폼 저장 성공",
    },
    dbTotals: {
      totalLinks: links.length,
      byStatus,
      byPlatform,
      defaultListCount: defaultList.length,
      obviousInvalidInDefault: invalidPatternsInDefault.length,
      obviousInvalidUrls: invalidPatternsInDefault.map((r) => r.canonical_url),
      titleUrlInDb,
      canonicalDupes: urls.length - uniqueUrls.size,
      sourceDupes: sourceKeys.length - uniqueSources.size,
      runningRuns: runningCount ?? 0,
    },
    qualitySample: {
      sampleSize,
      sampleClasses,
      sampleDetails,
      realSurveyRatio: sampleSize ? realSurveyInSample / sampleSize : 0,
      falsePositiveRatio: sampleSize
        ? falsePositiveLabeledActiveOrDiscovered / sampleSize
        : 0,
      platformMatchRatio: sampleSize ? platformMatch / sampleSize : 0,
      statusMatchRatio: sampleSize ? statusMatch / sampleSize : 0,
      titleSuccessRatio: sampleSize ? titleOkCount / sampleSize : 0,
      titleUrlRatio: sampleSize ? titleUrlCount / sampleSize : 0,
      duplicateRateThisPass:
        stats.newSurveysCount + stats.duplicateSurveysCount > 0
          ? stats.duplicateSurveysCount /
            (stats.newSurveysCount + stats.duplicateSurveysCount)
          : 0,
    },
    passChecks: {
      invalidInDefaultPct: defaultList.length
        ? (invalidPatternsInDefault.length / defaultList.length) * 100
        : 0,
      canonicalDupes: urls.length - uniqueUrls.size,
      sourceDupes: sourceKeys.length - uniqueSources.size,
      titleUrlPctDb: links.length ? (titleUrlInDb / links.length) * 100 : 0,
      runningRuns: runningCount ?? 0,
    },
  };

  writeFileSync(
    resolve(process.cwd(), "scripts/tmp-midscale-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("MIDSCALE_FAIL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
