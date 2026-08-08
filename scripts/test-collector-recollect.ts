/**
 * Limited recollect with accuracy metrics (display<=5 per endpoint).
 * Never prints secrets.
 *
 * Usage: npx tsx scripts/test-collector-recollect.ts
 */

import { existsSync, readFileSync } from "node:fs";
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
import { getCollectorSummary, listSurveyLinks } from "../lib/collector/queries";

const QUERY = "forms.gle OR form.naver.com OR moaform.com 설문";
const DISPLAY = 5;
const ENDPOINTS = ["blog", "cafearticle", "webkr"] as const;

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

async function main() {
  loadLocalEnvFiles();
  if (!isCollectorConfigured()) throw new Error("collector not configured");

  const supabase = createSupabaseServerClient();
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
      errorSummary: "cleared stuck lock before accuracy recollect",
    });
  }

  const lock = await tryStartCollectionRun("admin");
  if (!lock.ok) throw new Error(lock.reason);

  const stats = {
    resultsCount: 0,
    candidateLinksCount: 0,
    formatRejectedCount: 0,
    pageRejectedCount: 0,
    verifiedSavedCount: 0,
    unresolvedSavedCount: 0,
    invalidSavedCount: 0,
    newSurveysCount: 0,
    duplicateSurveysCount: 0,
    errorCount: 0,
    falsePositives: [] as Array<{ url: string; reason: string }>,
    platforms: { google_forms: 0, naver_form: 0, moaform: 0 },
  };

  try {
    for (const endpoint of ENDPOINTS) {
      try {
        const result = await searchNaverEndpoint(endpoint, QUERY, {
          display: DISPLAY,
        });
        stats.resultsCount += result.resultCount;
        for (const hit of result.hits) {
          const candidates = extractSurveyUrlsFromText(
            hit.link,
            hit.title,
            hit.description,
          );
          for (const candidate of candidates) {
            stats.candidateLinksCount += 1;
            const processed = await processSurveyCandidate({
              rawUrl: candidate,
              searchTitle: hit.title,
            });

            if (!processed.ok && (processed.stage === "format" || processed.stage === "redirect")) {
              stats.formatRejectedCount += 1;
              stats.falsePositives.push({
                url: candidate,
                reason: `[format] ${processed.reason}`,
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
                stats.invalidSavedCount += 1;
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

            const upserted = await upsertSurveyLink({
              canonicalUrl: processed.canonicalUrl,
              originalUrl: processed.originalUrl,
              platform: processed.platform,
              title: processed.title,
              status: processed.status,
            });
            if (processed.status === "active") {
              stats.verifiedSavedCount += 1;
              stats.platforms[processed.platform] += 1;
            } else {
              stats.unresolvedSavedCount += 1;
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
        stats.errorCount += 1;
        const msg =
          error instanceof NaverSearchError
            ? `${endpoint}/${error.kind}: ${error.message}`
            : String(error);
        stats.falsePositives.push({ url: endpoint, reason: msg });
      }
      await sleep(300);
    }

    const runStatus =
      stats.errorCount === 0
        ? "completed"
        : stats.newSurveysCount + stats.duplicateSurveysCount > 0
          ? "partial"
          : "failed";

    await finishCollectionRun({
      runId: lock.run.id,
      status: runStatus,
      queriesCount: ENDPOINTS.length,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.errorCount,
      errorSummary:
        stats.falsePositives
          .slice(0, 20)
          .map((f) => `${f.url}: ${f.reason}`)
          .join("\n")
          .slice(0, 4000) || null,
    });

    const summary = await getCollectorSummary();
    const visible = await listSurveyLinks({ status: "non_invalid", limit: 50 });
    const invalids = await listSurveyLinks({ status: "invalid", limit: 50 });
    const allRows = await supabase
      .from("survey_links")
      .select("canonical_url, status, platform, title")
      .order("first_discovered_at", { ascending: true });

    console.log(
      JSON.stringify(
        {
          runStatus,
          resultsCount: stats.resultsCount,
          candidateLinksCount: stats.candidateLinksCount,
          formatRejectedCount: stats.formatRejectedCount,
          pageRejectedCount: stats.pageRejectedCount,
          verifiedSavedCount: stats.verifiedSavedCount,
          unresolvedSavedCount: stats.unresolvedSavedCount,
          invalidSavedCount: stats.invalidSavedCount,
          platformsVerifiedThisPass: stats.platforms,
          falsePositives: stats.falsePositives.slice(0, 30),
          adminDefaultCount: visible.length,
          adminInvalidFilterCount: invalids.length,
          summaryTotalExclInvalid: summary.totalSurveys,
          summaryByPlatform: summary.byPlatform,
          dbAll: (allRows.data || []).map((r) => ({
            url: r.canonical_url,
            status: r.status,
            platform: r.platform,
            titleIsUrl: /^https?:\/\//i.test(String(r.title || "")),
            title: r.title,
          })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await finishCollectionRun({
      runId: lock.run.id,
      status: "failed",
      queriesCount: ENDPOINTS.length,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.errorCount + 1,
      errorSummary: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

main().catch((e) => {
  console.error("RECOLLECT_FAIL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
