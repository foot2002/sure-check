/**
 * Official-site source_page_url quality: same-origin article pages, not
 * homepage roots or external survey platforms.
 */

import { officialSiteSameOrigin } from "@/lib/collector/officialSiteOrigin";

const SURVEY_PLATFORM_HOST_RE =
  /(docs\.google\.com|forms\.gle|form\.naver\.com|naver\.me|moaform\.com|wiseon)/i;

const HOMEPAGE_PATH_RE = /\/(main|home|index|default)(\.(do|jsp|php|html?|asp|aspx))?$/i;

export function isExternalSurveyPlatformUrl(url: string | null | undefined): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return SURVEY_PLATFORM_HOST_RE.test(host) || SURVEY_PLATFORM_HOST_RE.test(raw);
  } catch {
    return SURVEY_PLATFORM_HOST_RE.test(raw);
  }
}

export function isHomepageLikeSource(
  pageUrl: string,
  homepageUrl: string,
): boolean {
  try {
    const page = new URL(pageUrl);
    const path = (page.pathname || "/").replace(/\/+$/, "") || "/";
    const homeHostOk = homepageUrl
      ? officialSiteSameOrigin(homepageUrl, pageUrl)
      : true;
    if (!homeHostOk) return false;
    if (path === "/" && !page.search) return true;
    return HOMEPAGE_PATH_RE.test(path) && page.search.length < 8;
  } catch {
    return false;
  }
}

export function sourcePageHostMismatch(
  pageUrl: string | null | undefined,
  homepageUrl: string | null | undefined,
): boolean {
  const page = String(pageUrl || "").trim();
  const home = String(homepageUrl || "").trim();
  if (!page || !home) return false;
  if (isExternalSurveyPlatformUrl(page)) return true;
  return !officialSiteSameOrigin(home, page);
}

export function isRealOfficialSourcePage(input: {
  sourcePageUrl: string | null | undefined;
  homepageUrl: string | null | undefined;
}): boolean {
  const page = String(input.sourcePageUrl || "").trim();
  const home = String(input.homepageUrl || "").trim();
  if (!page.startsWith("http")) return false;
  if (isExternalSurveyPlatformUrl(page)) return false;
  if (home && sourcePageHostMismatch(page, home)) return false;
  if (home && isHomepageLikeSource(page, home)) return false;
  if (!home) {
    try {
      const path = new URL(page).pathname.replace(/\/+$/, "") || "/";
      if (path === "/" || HOMEPAGE_PATH_RE.test(path)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function summarizeOfficialSourceQuality(
  rows: Array<{
    source_page_url?: string | null;
    source_institution_homepage?: string | null;
    source_url?: string | null;
  }>,
): {
  sampleSize: number;
  withSourcePageUrl: number;
  realSourcePageCount: number;
  hostMismatchCount: number;
  sourcePageUrlSaveRate: number | null;
  realSourcePageRate: number | null;
} {
  const sampleSize = rows.length;
  let withSourcePageUrl = 0;
  let realSourcePageCount = 0;
  let hostMismatchCount = 0;
  for (const row of rows) {
    const page = String(row.source_page_url || "").trim();
    const home = String(row.source_institution_homepage || "").trim();
    if (page) {
      withSourcePageUrl += 1;
      if (isRealOfficialSourcePage({ sourcePageUrl: page, homepageUrl: home })) {
        realSourcePageCount += 1;
      }
      if (sourcePageHostMismatch(page, home) || isExternalSurveyPlatformUrl(page)) {
        hostMismatchCount += 1;
      }
    }
  }
  return {
    sampleSize,
    withSourcePageUrl,
    realSourcePageCount,
    hostMismatchCount,
    sourcePageUrlSaveRate: sampleSize > 0 ? withSourcePageUrl / sampleSize : null,
    realSourcePageRate: sampleSize > 0 ? realSourcePageCount / sampleSize : null,
  };
}

export function sourcePageConfidenceCap(input: {
  sourcePageUrl: string | null | undefined;
  homepageUrl: string | null | undefined;
}): "high" | "medium" | "low" {
  const page = String(input.sourcePageUrl || "").trim();
  const home = String(input.homepageUrl || "").trim();
  if (!page) return "low";
  if (isExternalSurveyPlatformUrl(page) || sourcePageHostMismatch(page, home)) {
    return "low";
  }
  if (home && isHomepageLikeSource(page, home)) return "low";
  if (isRealOfficialSourcePage({ sourcePageUrl: page, homepageUrl: home })) {
    return "high";
  }
  return "medium";
}
