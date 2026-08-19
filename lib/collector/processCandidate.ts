/**
 * Candidate processing pipeline: resolve → format → page validate → title.
 */

import { isShortenerUrl } from "@/lib/collector/platformDetect";
import { validateSurveyPage } from "@/lib/collector/pageValidate";
import { resolveShortSurveyUrl } from "@/lib/collector/safeRedirect";
import { validateSurveyResponseUrl } from "@/lib/collector/surveyUrlRules";
import { titleOrNeedsConfirmation } from "@/lib/collector/titleUtils";
import { normalizeSurveyUrl } from "@/lib/collector/urlNormalize";
import { overlayFreshnessOnPage } from "@/lib/collector/surveyFreshness";
import type {
  CollectorPlatform,
  CollectorSurveyStatus,
  SurveyLinkFreshness,
} from "@/lib/collector/types";

export type CandidateProcessResult =
  | {
      ok: true;
      stage: "saved_ready";
      canonicalUrl: string;
      originalUrl: string;
      platform: CollectorPlatform;
      status: CollectorSurveyStatus;
      title: string;
      pageTitle: string | null;
      verdict:
        | "confirmed_survey"
        | "closed_survey"
        | "restricted_survey"
        | "unreachable"
        | "unresolved";
      reason: string;
      freshness?: SurveyLinkFreshness;
    }
  | {
      ok: false;
      stage: "format" | "redirect" | "page";
      reason: string;
      status?: CollectorSurveyStatus;
      canonicalUrl?: string;
      originalUrl?: string;
      platform?: CollectorPlatform | null;
      title?: string | null;
      verdict?: "not_survey" | "unresolved";
    };

function mapPageToReady(
  originalUrl: string,
  canonicalUrl: string,
  fallbackPlatform: CollectorPlatform,
  searchTitle: string | null | undefined,
  page: Awaited<ReturnType<typeof validateSurveyPage>>,
): CandidateProcessResult {
  if (page.verdict === "not_survey") {
    return {
      ok: false,
      stage: "page",
      reason: page.reason,
      status: "invalid",
      verdict: "not_survey",
      originalUrl,
      canonicalUrl,
      platform: page.platform || fallbackPlatform,
      title: titleOrNeedsConfirmation(page.pageTitle, searchTitle),
    };
  }

  const confirmedLive =
    page.verdict === "confirmed_survey" && page.status === "active";
  const freshness = overlayFreshnessOnPage({
    pageStatus: page.status,
    pageReason: page.reason,
    pageTitle: page.pageTitle,
    url: canonicalUrl,
    searchTitle,
    confirmedLive,
  });

  const verdict =
    freshness.status === "closed"
      ? "closed_survey"
      : freshness.status === "restricted"
        ? "restricted_survey"
        : page.verdict === "confirmed_survey" ||
            page.verdict === "closed_survey" ||
            page.verdict === "restricted_survey" ||
            page.verdict === "unreachable" ||
            page.verdict === "unresolved"
          ? page.verdict
          : "unresolved";

  return {
    ok: true,
    stage: "saved_ready",
    canonicalUrl,
    originalUrl,
    platform: page.platform || fallbackPlatform,
    status: freshness.status,
    title: titleOrNeedsConfirmation(page.pageTitle, searchTitle),
    pageTitle: page.pageTitle,
    verdict,
    reason: freshness.reason || page.reason,
    freshness: freshness.record,
  };
}

export async function processSurveyCandidate(input: {
  rawUrl: string;
  searchTitle?: string | null;
}): Promise<CandidateProcessResult> {
  const originalUrl = input.rawUrl.trim();

  if (isShortenerUrl(originalUrl)) {
    const resolved = await resolveShortSurveyUrl(originalUrl);
    if (!resolved.ok) {
      return {
        ok: false,
        stage: "redirect",
        reason: resolved.reason,
        status: "unreachable",
        originalUrl,
      };
    }
    const format = validateSurveyResponseUrl(resolved.canonicalUrl);
    if (!format.ok) {
      return {
        ok: false,
        stage: "format",
        reason: format.reason,
        status: "invalid",
        originalUrl,
        canonicalUrl: resolved.canonicalUrl,
      };
    }
    const page = await validateSurveyPage(resolved.canonicalUrl, format.platform);
    return mapPageToReady(
      originalUrl,
      resolved.canonicalUrl,
      format.platform,
      input.searchTitle,
      page,
    );
  }

  const normalized = normalizeSurveyUrl(originalUrl);
  if (!normalized.ok) {
    return {
      ok: false,
      stage: "format",
      reason: normalized.reason,
      status: "invalid",
      originalUrl,
    };
  }

  const format = validateSurveyResponseUrl(normalized.canonicalUrl);
  if (!format.ok) {
    return {
      ok: false,
      stage: "format",
      reason: format.reason,
      status: "invalid",
      originalUrl,
      canonicalUrl: normalized.canonicalUrl,
    };
  }

  const page = await validateSurveyPage(normalized.canonicalUrl, format.platform);
  return mapPageToReady(
    normalized.originalUrl,
    normalized.canonicalUrl,
    format.platform,
    input.searchTitle,
    page,
  );
}
