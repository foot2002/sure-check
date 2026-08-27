import * as cheerio from "cheerio";
import {
  extractSurveyUrlsFromText,
} from "@/lib/collector/extractLinks";
import {
  isShortenerUrl,
  looksLikeSurveyDomainUrl,
} from "@/lib/collector/platformDetect";
import {
  extractAnchorContext,
  extractOfficialPageDates,
  extractPageTitle,
  extractVisiblePageText,
  pickBetterOfficialSource,
  postedYmdToIso,
  withOfficialSiteFreshnessMeta,
  type OfficialSiteSurveyFind,
} from "@/lib/collector/officialSiteEvidence";
import {
  isPriorityOfficialPath,
  OFFICIAL_SITE_MAX_DEPTH,
  OFFICIAL_SITE_MAX_PAGES,
  OFFICIAL_SITE_ORG_BUDGET_MS,
  OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS,
} from "@/lib/collector/officialSiteCrawlPolicy";
import { officialSiteSameOrigin } from "@/lib/collector/officialSiteOrigin";
import { isHomepageLikeSource } from "@/lib/collector/officialSiteSourceQuality";
import type { OfficialInstitutionSiteRow } from "@/lib/collector/officialSiteRepository";
import { processSurveyCandidate } from "@/lib/collector/processCandidate";
import { insertSurveySource, upsertSurveyLink } from "@/lib/collector/repository";
import { safeUrlCheck } from "@/lib/security/urlSafety";
import { evaluateSurveyFreshness } from "@/lib/collector/surveyFreshness";
import {
  isChromePageTitle,
  sanitizeSurveyTitle,
} from "@/lib/collector/titleUtils";
import type { SurveyLinkFreshness } from "@/lib/collector/types";

export type OfficialSiteOrgCrawlResult = {
  organizationName: string;
  pagesFetched: number;
  surveyUrlsFound: number;
  surveysSaved: number;
  crossOriginSkipped: number;
  errors: string[];
  ok: boolean;
};

type QueueItem = { url: string; depth: number; score: number };

const originSafety = new Map<string, boolean>();

function sameOriginOnly(seed: URL, candidate: URL): boolean {
  return officialSiteSameOrigin(seed.toString(), candidate.toString());
}

function absoluteUrl(base: string, href: string): string | null {
  try {
    const resolved = new URL(href, base);
    resolved.hash = "";
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

async function originAllowed(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    const cached = originSafety.get(origin);
    if (cached != null) return cached;
    const check = await safeUrlCheck(url);
    originSafety.set(origin, check.safe);
    return check.safe;
  } catch {
    return false;
  }
}

async function fetchHtml(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; html: string; finalUrl: string; error?: string }> {
  if (!(await originAllowed(url))) {
    return { ok: false, html: "", finalUrl: url, error: "blocked url" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "SURECheckOfficialSiteBot/1.0",
      },
    });
    const html = await res.text();
    return {
      ok: res.ok,
      html: html.slice(0, 750_000),
      finalUrl: res.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      html: "",
      finalUrl: url,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function collectPageFinds(
  html: string,
  pageUrl: string,
  seedOrigin: URL,
): { nextPages: QueueItem[]; finds: OfficialSiteSurveyFind[] } {
  const $ = cheerio.load(html);
  const nextPages: QueueItem[] = [];
  const pageTitle = extractPageTitle(html);
  const pageText = extractVisiblePageText(html);
  const dates = extractOfficialPageDates(html, pageText);
  const finds: OfficialSiteSurveyFind[] = [];
  const seenSurvey = new Set<string>();

  const pushFind = (surveyUrl: string, anchorText: string, excerpt: string) => {
    const key = surveyUrl.replace(/\/$/, "").toLowerCase();
    if (seenSurvey.has(key)) return;
    seenSurvey.add(key);
    finds.push({
      surveyUrl,
      sourcePageUrl: pageUrl,
      sourcePageTitle: pageTitle,
      sourceAnchorText: anchorText.slice(0, 200),
      sourceContextExcerpt: excerpt,
      sourcePageText: pageText,
      dates,
    });
  };

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const abs = absoluteUrl(pageUrl, href);
    if (!abs) return;
    if (looksLikeSurveyDomainUrl(abs) || isShortenerUrl(abs) || /wiseon/i.test(abs)) {
      pushFind(abs, text, extractAnchorContext(html, href, text));
      return;
    }
    try {
      const parsed = new URL(abs);
      if (!sameOriginOnly(seedOrigin, parsed)) return;
      if (/\.(pdf|jpg|jpeg|png|gif|zip|hwp|hwpx|xlsx|docx?)$/i.test(parsed.pathname)) {
        return;
      }
      const blob = `${parsed.pathname} ${parsed.search} ${text}`;
      const score = isPriorityOfficialPath(blob) ? 10 : 1;
      nextPages.push({ url: parsed.toString(), depth: 0, score });
    } catch {
      /* ignore */
    }
  });

  for (const surveyUrl of extractSurveyUrlsFromText(html, pageUrl)) {
    const key = surveyUrl.replace(/\/$/, "").toLowerCase();
    if (seenSurvey.has(key)) continue;
    pushFind(surveyUrl, "", extractAnchorContext(html, surveyUrl, surveyUrl));
  }

  return { nextPages, finds };
}

export async function crawlOfficialInstitutionSite(
  row: OfficialInstitutionSiteRow,
  options?: { now?: Date; maxPages?: number; budgetMs?: number },
): Promise<OfficialSiteOrgCrawlResult> {
  const empty = (crossOriginSkipped = 0): OfficialSiteOrgCrawlResult => ({
    organizationName: row.organization_name,
    pagesFetched: 0,
    surveyUrlsFound: 0,
    surveysSaved: 0,
    crossOriginSkipped,
    errors: [],
    ok: true,
  });
  if (
    row.seed_review_status === "needs_review" ||
    row.seed_review_status === "excluded"
  ) {
    return empty();
  }
  const started = Date.now();
  const maxPages = options?.maxPages ?? OFFICIAL_SITE_MAX_PAGES;
  const orgBudget = Math.max(
    1,
    Math.min(OFFICIAL_SITE_ORG_BUDGET_MS, options?.budgetMs ?? OFFICIAL_SITE_ORG_BUDGET_MS),
  );
  let seedOrigin: URL;
  try {
    seedOrigin = new URL(row.homepage_url);
  } catch {
    return empty();
  }
  const seen = new Set<string>();
  const queue: QueueItem[] = [];
  let crossOriginSkipped = 0;
  const enqueueSeed = (url: string, depth: number, score: number) => {
    if (!officialSiteSameOrigin(row.homepage_url, url)) {
      crossOriginSkipped += 1;
      return;
    }
    queue.push({ url, depth, score });
  };
  enqueueSeed(row.homepage_url, 0, 20);
  for (const seed of row.seed_urls || []) {
    enqueueSeed(seed, 0, 20);
  }
  const findsBySurvey = new Map<string, OfficialSiteSurveyFind>();
  const errors: string[] = [];
  let pagesFetched = 0;
  let surveysSaved = 0;

  while (queue.length > 0 && pagesFetched < maxPages) {
    if (Date.now() - started > orgBudget) break;
    queue.sort((a, b) => b.score - a.score || a.depth - b.depth);
    const item = queue.shift();
    if (!item) break;
    const key = item.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const page = await fetchHtml(item.url, OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS);
    pagesFetched += 1;
    if (!page.ok) {
      if (page.error) errors.push(`${item.url}: ${page.error}`);
      continue;
    }

    const pageUrl = page.finalUrl || item.url;
    if (!officialSiteSameOrigin(row.homepage_url, pageUrl)) {
      crossOriginSkipped += 1;
      continue;
    }
    const found = collectPageFinds(page.html, pageUrl, seedOrigin);
    for (const find of found.finds) {
      const surveyKey = find.surveyUrl.replace(/\/$/, "").toLowerCase();
      findsBySurvey.set(
        surveyKey,
        pickBetterOfficialSource(findsBySurvey.get(surveyKey), find, row.homepage_url),
      );
    }
    if (item.depth < OFFICIAL_SITE_MAX_DEPTH) {
      for (const next of found.nextPages) {
        const nextKey = next.url.replace(/\/$/, "").toLowerCase();
        if (seen.has(nextKey)) continue;
        if (!officialSiteSameOrigin(row.homepage_url, next.url)) {
          crossOriginSkipped += 1;
          continue;
        }
        queue.push({ ...next, depth: item.depth + 1 });
      }
    }
  }

  for (const find of findsBySurvey.values()) {
    if (!officialSiteSameOrigin(row.homepage_url, find.sourcePageUrl)) {
      crossOriginSkipped += 1;
      continue;
    }
    try {
      const processed = await processSurveyCandidate({
        rawUrl: find.surveyUrl,
        searchTitle:
          sanitizeSurveyTitle(
            find.sourceAnchorText,
            find.sourcePageTitle,
          ) || `${row.organization_name} 공식 사이트 설문`,
      });
      if (!processed.ok || !processed.canonicalUrl || !processed.platform) continue;

      const dates = find.dates;
      const formBlocked =
        processed.status === "closed" ||
        processed.status === "restricted" ||
        processed.status === "invalid" ||
        processed.status === "unreachable";
      const homepageLike = isHomepageLikeSource(
        find.sourcePageUrl,
        row.homepage_url,
      );
      const chromeTitle = isChromePageTitle(find.sourcePageTitle);
      if (
        homepageLike &&
        chromeTitle &&
        !dates.postedYmd &&
        !dates.periodStart &&
        !dates.deadline
      ) {
        continue;
      }
      // Homepage chrome/news text must not classify the survey (login/작년).
      // Use the form page, or the excerpt around the survey link.
      const sourceFreshness = formBlocked
        ? processed.freshness
        : homepageLike
          ? processed.freshness
          : evaluateSurveyFreshness({
              title:
                sanitizeSurveyTitle(find.sourceAnchorText, processed.title) ||
                processed.title,
              snippet: find.sourceContextExcerpt || find.sourceAnchorText,
              pageText: find.sourceContextExcerpt || find.sourceAnchorText,
              publishedAt: postedYmdToIso(dates.postedYmd) || undefined,
              url: processed.canonicalUrl,
              mode: "page",
              confirmedLive: processed.status === "active",
              now: options?.now,
            }).record;
      const freshness = (
        homepageLike
          ? {
              ...(sourceFreshness || processed.freshness || {}),
              discovery_channel: "official_site",
              freshness_basis: "form_page",
              source_posted_date: dates.postedYmd,
              source_period_start: dates.periodStart,
              source_period_end: dates.periodEnd,
              source_deadline: dates.deadline,
              source_date_text: dates.dateText,
            }
          : withOfficialSiteFreshnessMeta(
              (sourceFreshness || processed.freshness || {}) as Record<
                string,
                unknown
              >,
              dates,
              {
                sourcePageUrl: find.sourcePageUrl,
                homepageUrl: row.homepage_url,
              },
            )
      ) as SurveyLinkFreshness;
      if (formBlocked && processed.freshness) {
        freshness.diagnosis_eligible_recent = false;
        freshness.should_diagnose = false;
        freshness.diagnosis_exclusion_reason =
          processed.freshness.diagnosis_exclusion_reason ||
          processed.freshness.reason_code ||
          processed.status;
      }

      const saved = await upsertSurveyLink({
        canonicalUrl: processed.canonicalUrl,
        originalUrl: processed.originalUrl || find.surveyUrl,
        platform: processed.platform,
        title:
          sanitizeSurveyTitle(
            processed.title,
            find.sourceAnchorText || find.sourcePageTitle,
          ) || `${row.organization_name} 공식 사이트 설문`,
        status: processed.status,
        freshness,
      });
      const sourcePayload = {
        surveyLinkId: saved.link.id,
        sourceType: "official_site" as const,
        sourceUrl: find.sourcePageUrl,
        sourceTitle:
          sanitizeSurveyTitle(find.sourcePageTitle, row.organization_name) ||
          row.organization_name,
        searchQuery: `official_site:${row.organization_name}`,
        sourcePublishedAt: postedYmdToIso(dates.postedYmd),
        sourcePageUrl: find.sourcePageUrl,
        sourcePageTitle: find.sourcePageTitle || null,
        sourceAnchorText: find.sourceAnchorText || null,
        sourceContextExcerpt: find.sourceContextExcerpt || null,
        sourceOrganizationName: row.organization_name,
        sourceInstitutionHomepage: row.homepage_url,
        sourcePostedDate: dates.postedYmd,
        sourcePeriodStart: dates.periodStart,
        sourcePeriodEnd: dates.periodEnd,
        sourceDeadline: dates.deadline,
        sourceDateText: dates.dateText,
      };
      try {
        await insertSurveySource(sourcePayload);
      } catch {
        await insertSurveySource({
          ...sourcePayload,
          sourceType: "web",
        });
      }
      surveysSaved += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    organizationName: row.organization_name,
    pagesFetched,
    surveyUrlsFound: findsBySurvey.size,
    surveysSaved,
    crossOriginSkipped,
    errors: errors.slice(0, 8),
    ok: errors.length === 0 || surveysSaved > 0 || pagesFetched > 0,
  };
}
