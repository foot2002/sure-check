import * as cheerio from "cheerio";
import {
  extractSurveyUrlsFromText,
} from "@/lib/collector/extractLinks";
import {
  isShortenerUrl,
  looksLikeSurveyDomainUrl,
} from "@/lib/collector/platformDetect";
import {
  isPriorityOfficialPath,
  OFFICIAL_SITE_MAX_DEPTH,
  OFFICIAL_SITE_MAX_PAGES,
  OFFICIAL_SITE_ORG_BUDGET_MS,
  OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS,
} from "@/lib/collector/officialSiteCrawlPolicy";
import type { OfficialInstitutionSiteRow } from "@/lib/collector/officialSiteRepository";
import { processSurveyCandidate } from "@/lib/collector/processCandidate";
import { insertSurveySource, upsertSurveyLink } from "@/lib/collector/repository";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export type OfficialSiteOrgCrawlResult = {
  organizationName: string;
  pagesFetched: number;
  surveyUrlsFound: number;
  surveysSaved: number;
  errors: string[];
  ok: boolean;
};

type QueueItem = { url: string; depth: number; score: number };

const originSafety = new Map<string, boolean>();

function hostKey(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function sameOriginOnly(seed: URL, candidate: URL): boolean {
  return hostKey(seed.hostname) === hostKey(candidate.hostname);
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

function collectLinks(
  html: string,
  pageUrl: string,
  seedOrigin: URL,
): { nextPages: QueueItem[]; surveyUrls: string[] } {
  const $ = cheerio.load(html);
  const nextPages: QueueItem[] = [];
  const surveyUrls = new Set<string>(extractSurveyUrlsFromText(html, pageUrl));

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const abs = absoluteUrl(pageUrl, href);
    if (!abs) return;
    if (looksLikeSurveyDomainUrl(abs) || isShortenerUrl(abs) || /wiseon/i.test(abs)) {
      surveyUrls.add(abs);
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

  return { nextPages, surveyUrls: [...surveyUrls] };
}

export async function crawlOfficialInstitutionSite(
  row: OfficialInstitutionSiteRow,
  options?: { now?: Date; maxPages?: number },
): Promise<OfficialSiteOrgCrawlResult> {
  const started = Date.now();
  const maxPages = options?.maxPages ?? OFFICIAL_SITE_MAX_PAGES;
  const seedOrigin = new URL(row.homepage_url);
  const seen = new Set<string>();
  const queue: QueueItem[] = [];
  for (const seed of [row.homepage_url, ...row.seed_urls]) {
    queue.push({ url: seed, depth: 0, score: 20 });
  }
  const surveyFound = new Set<string>();
  const errors: string[] = [];
  let pagesFetched = 0;
  let surveysSaved = 0;

  while (queue.length > 0 && pagesFetched < maxPages) {
    if (Date.now() - started > OFFICIAL_SITE_ORG_BUDGET_MS) break;
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

    const found = collectLinks(page.html, page.finalUrl || item.url, seedOrigin);
    for (const surveyUrl of found.surveyUrls) surveyFound.add(surveyUrl);
    if (item.depth < OFFICIAL_SITE_MAX_DEPTH) {
      for (const next of found.nextPages) {
        const nextKey = next.url.replace(/\/$/, "").toLowerCase();
        if (seen.has(nextKey)) continue;
        queue.push({ ...next, depth: item.depth + 1 });
      }
    }
  }

  for (const surveyUrl of surveyFound) {
    try {
      const processed = await processSurveyCandidate({
        rawUrl: surveyUrl,
        searchTitle: `${row.organization_name} 공식 사이트 설문`,
      });
      if (!processed.ok || !processed.canonicalUrl || !processed.platform) continue;
      const saved = await upsertSurveyLink({
        canonicalUrl: processed.canonicalUrl,
        originalUrl: processed.originalUrl || surveyUrl,
        platform: processed.platform,
        title: processed.title,
        status: processed.status,
        freshness: {
          ...(processed.freshness || {}),
          discovery_channel: "official_site",
        },
      });
      try {
        await insertSurveySource({
          surveyLinkId: saved.link.id,
          sourceType: "official_site",
          sourceUrl: row.homepage_url,
          sourceTitle: row.organization_name,
          searchQuery: `official_site:${row.organization_name}`,
        });
      } catch {
        await insertSurveySource({
          surveyLinkId: saved.link.id,
          sourceType: "web",
          sourceUrl: row.homepage_url,
          sourceTitle: row.organization_name,
          searchQuery: `official_site:${row.organization_name}`,
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
    surveyUrlsFound: surveyFound.size,
    surveysSaved,
    errors: errors.slice(0, 8),
    ok: errors.length === 0 || surveysSaved > 0 || pagesFetched > 0,
  };
}
