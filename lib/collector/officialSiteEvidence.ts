/**
 * Official-site discovery-page evidence: which notice/board page held the
 * survey link, plus posted date / period text used for freshness.
 */

import * as cheerio from "cheerio";
import {
  extractSurveyDateSignals,
  extractPostedDateYmd,
} from "@/lib/collector/surveyFreshness";

export type OfficialSiteSurveyFind = {
  surveyUrl: string;
  sourcePageUrl: string;
  sourcePageTitle: string;
  sourceAnchorText: string;
  sourceContextExcerpt: string;
  sourcePageText: string;
  dates: OfficialSitePageDates;
};

export type OfficialSitePageDates = {
  postedYmd: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  deadline: string | null;
  dateText: string | null;
};

const ARTICLE_PATH_RE =
  /bbs|board|article|notice|nadata|selectboard|view\.do|detail|공지|알림|참여|설문|신청/i;

export function normalizePageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isHomepageUrl(pageUrl: string, homepageUrl: string): boolean {
  try {
    const page = new URL(normalizePageUrl(pageUrl));
    const home = new URL(normalizePageUrl(homepageUrl));
    const pageHost = page.hostname.replace(/^www\./i, "").toLowerCase();
    const homeHost = home.hostname.replace(/^www\./i, "").toLowerCase();
    if (pageHost !== homeHost) return false;
    const path = page.pathname === "" ? "/" : page.pathname;
    return path === "/" && !page.search;
  } catch {
    return false;
  }
}

export function sourcePageScore(pageUrl: string, homepageUrl: string): number {
  if (isHomepageUrl(pageUrl, homepageUrl)) return 0;
  let score = 10;
  try {
    const parsed = new URL(pageUrl);
    const blob = `${parsed.pathname} ${parsed.search}`;
    if (ARTICLE_PATH_RE.test(blob)) score += 20;
    if (parsed.search.length > 8) score += 5;
    if (parsed.pathname.length > 2) score += 5;
  } catch {
    score += 1;
  }
  return score;
}

export function pickBetterOfficialSource(
  current: OfficialSiteSurveyFind | undefined,
  next: OfficialSiteSurveyFind,
  homepageUrl: string,
): OfficialSiteSurveyFind {
  if (!current) return next;
  const currentScore = sourcePageScore(current.sourcePageUrl, homepageUrl);
  const nextScore = sourcePageScore(next.sourcePageUrl, homepageUrl);
  if (nextScore !== currentScore) return nextScore > currentScore ? next : current;
  if (next.sourceAnchorText.length !== current.sourceAnchorText.length) {
    return next.sourceAnchorText.length > current.sourceAnchorText.length
      ? next
      : current;
  }
  return next.sourceContextExcerpt.length > current.sourceContextExcerpt.length
    ? next
    : current;
}

export function clipExcerpt(text: string, max = 500, min = 200): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= max) {
    if (compact.length >= min) return compact;
    return compact;
  }
  return compact.slice(0, max);
}

export function excerptAround(
  haystack: string,
  needle: string,
  max = 500,
): string {
  const compact = haystack.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (!needle) return clipExcerpt(compact, max);
  const idx = compact.toLowerCase().indexOf(needle.replace(/\s+/g, " ").trim().toLowerCase());
  if (idx < 0) return clipExcerpt(compact, max);
  const start = Math.max(0, idx - 120);
  return clipExcerpt(compact.slice(start), max);
}

export function extractPageTitle(html: string): string {
  const $ = cheerio.load(html);
  const heading = $("h1, h2")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  return (heading || title).slice(0, 300);
}

export function extractVisiblePageText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();
  return ($("body").text() || $.root().text())
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

export function extractAnchorContext(
  html: string,
  hrefOrUrl: string,
  anchorText: string,
): string {
  const $ = cheerio.load(html);
  let best = "";
  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "");
    if (!href) return;
    if (
      !href.includes(hrefOrUrl) &&
      !hrefOrUrl.includes(href) &&
      $(el).text().replace(/\s+/g, " ").trim() !== anchorText
    ) {
      return;
    }
    const block = $(el).closest("p, li, dd, td, article, section, div").first();
    const text = (block.text() || $(el).parent().text() || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > best.length) best = text;
  });
  if (!best) best = extractVisiblePageText(html);
  const around = excerptAround(best, anchorText || hrefOrUrl);
  return around || clipExcerpt(best);
}

export function extractOfficialPageDates(
  html: string,
  pageText?: string,
): OfficialSitePageDates {
  const $ = cheerio.load(html);
  const meta =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="date"]').attr("content") ||
    $("time[datetime]").attr("datetime") ||
    "";
  const text = `${pageText || extractVisiblePageText(html)} ${meta}`;
  const range = extractSurveyDateSignals(text);
  let postedYmd = extractPostedDateYmd(text);
  if (!postedYmd && meta) {
    const parsed = Date.parse(meta);
    if (Number.isFinite(parsed)) {
      const kst = new Date(parsed + 9 * 60 * 60 * 1000);
      postedYmd = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
    }
  }
  const deadlineMatch = text.match(
    /(?:마감일|종료일|접수\s*마감|응답\s*마감)\s*[:：]?\s*((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/,
  );
  const deadline = deadlineMatch
    ? `${deadlineMatch[1]}-${String(Number(deadlineMatch[2])).padStart(2, "0")}-${String(Number(deadlineMatch[3])).padStart(2, "0")}`
    : range.end;
  const dateBits = [
    postedYmd ? `게시일 ${postedYmd}` : "",
    range.start || range.end
      ? `기간 ${range.start || "?"} ~ ${range.end || "?"}`
      : "",
    deadline ? `마감 ${deadline}` : "",
  ].filter(Boolean);
  return {
    postedYmd,
    periodStart: range.start,
    periodEnd: range.end,
    deadline: deadline || range.end,
    dateText: dateBits.join(" / ").slice(0, 400) || null,
  };
}

export function postedYmdToIso(ymd: string | null): string | null {
  if (!ymd) return null;
  const t = Date.parse(`${ymd}T00:00:00+09:00`);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export function freshnessConfidence(input: {
  postedYmd: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  deadline: string | null;
  eligible: boolean;
  unknown: boolean;
}): "high" | "medium" | "low" {
  if (input.postedYmd || input.periodStart || input.periodEnd || input.deadline) {
    return "high";
  }
  if (input.eligible) return "medium";
  if (input.unknown) return "low";
  return "medium";
}

export function withOfficialSiteFreshnessMeta(
  record: {
    diagnosis_eligible_recent?: boolean;
    diagnosis_exclusion_reason?: string | null;
    reason_code?: string;
    should_diagnose?: boolean;
    [key: string]: unknown;
  },
  dates: OfficialSitePageDates,
): Record<string, unknown> {
  const reason = String(
    record.diagnosis_exclusion_reason || record.reason_code || "",
  );
  const oldYear =
    reason === "stale_year" ||
    reason === "stale_topic_year" ||
    reason === "previous_year_phrase" ||
    reason === "old_year_2024" ||
    reason === "old_year_2025";
  const unknown = reason === "date_unknown_hold" || reason === "active_unknown_date";
  const eligible = record.diagnosis_eligible_recent === true;
  return {
    ...record,
    discovery_channel: "official_site",
    freshness_basis: "source_page",
    freshness_confidence: freshnessConfidence({
      postedYmd: dates.postedYmd,
      periodStart: dates.periodStart,
      periodEnd: dates.periodEnd,
      deadline: dates.deadline,
      eligible,
      unknown,
    }),
    old_year_signal: oldYear,
    source_posted_date: dates.postedYmd,
    source_period_start: dates.periodStart,
    source_period_end: dates.periodEnd,
    source_deadline: dates.deadline,
    source_date_text: dates.dateText,
  };
}
