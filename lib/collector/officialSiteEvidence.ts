/**
 * Official-site discovery-page evidence: which notice/board page held the
 * survey link, plus posted date / period text used for freshness.
 */

import * as cheerio from "cheerio";
import {
  extractSurveyDateSignals,
  extractPostedDateYmd,
  hasPeriodLanguage,
} from "@/lib/collector/surveyFreshness";
import { sourcePageConfidenceCap } from "@/lib/collector/officialSiteSourceQuality";

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

const CHROME_SELECTORS = [
  "footer",
  "header",
  "nav",
  "aside",
  "sitemap",
  ".footer",
  "#footer",
  ".copyright",
  "#copyright",
  ".sitemap",
  "[class*='footer']",
  "[id*='footer']",
  "[class*='copyright']",
  "[id*='copyright']",
  "[class*='gnb']",
  "[class*='lnb']",
  "[role='navigation']",
  "[role='contentinfo']",
].join(", ");

function isoToYmd(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const labelled = extractPostedDateYmd(`등록일 ${raw}`) || extractPostedDateYmd(raw);
  if (labelled) return labelled;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  const kst = new Date(parsed + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
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
  $(CHROME_SELECTORS).remove();
  return ($("body").text() || $.root().text())
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

function collectJsonLdDates($: ReturnType<typeof cheerio.load>): string[] {
  const out: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text() || $(el).text();
    if (!raw.trim()) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const graph =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as Record<string, unknown>)["@graph"])
          ? ((parsed as Record<string, unknown>)["@graph"] as unknown[])
          : [];
      const nodes: unknown[] = Array.isArray(parsed)
        ? parsed
        : [parsed, ...graph];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const rec = node as Record<string, unknown>;
        for (const key of ["datePublished", "dateCreated", "dateModified"]) {
          if (typeof rec[key] === "string") out.push(rec[key]);
        }
      }
    } catch {
      /* ignore invalid json-ld */
    }
  });
  return out;
}

function collectLabeledTableDates($: ReturnType<typeof cheerio.load>): string[] {
  const out: string[] = [];
  $("th, dt, label, span, strong, em").each((_, el) => {
    const label = $(el).text().replace(/\s+/g, " ").trim();
    if (!/(등록일|작성일|게시일|공지일|날짜|작성날짜|최초등록일|최종수정일|최종수정|작성시간|등록시간)/.test(label)) {
      return;
    }
    const sibling = $(el).next("td, dd, span, p").text();
    const parent = $(el).parent().find("td, dd").last().text();
    const value = (sibling || parent || $(el).parent().text()).replace(/\s+/g, " ").trim();
    if (value) out.push(value);
  });
  return out;
}

export function extractAnchorContext(
  html: string,
  hrefOrUrl: string,
  anchorText: string,
): string {
  const $ = cheerio.load(html);
  $(CHROME_SELECTORS).remove();
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
  const metaCandidates = [
    $('meta[property="article:published_time"]').attr("content"),
    $('meta[property="og:published_time"]').attr("content"),
    $('meta[name="date"]').attr("content"),
    $('meta[name="Date"]').attr("content"),
    $('meta[name="created"]').attr("content"),
    $('meta[name="regDate"]').attr("content"),
    $('meta[name="regdate"]').attr("content"),
    $("time[datetime]").attr("datetime"),
    $("[data-date]").attr("data-date"),
    $("[data-regdate]").attr("data-regdate"),
    ...collectJsonLdDates($),
  ].filter(Boolean) as string[];
  const tableDates = collectLabeledTableDates($);
  const mainText = pageText || extractVisiblePageText(html);
  const text = [mainText, ...metaCandidates, ...tableDates].join(" ");
  const range = extractSurveyDateSignals(text);
  let postedYmd = extractPostedDateYmd(text);
  if (!postedYmd) {
    for (const candidate of [...tableDates, ...metaCandidates]) {
      postedYmd = isoToYmd(candidate);
      if (postedYmd) break;
    }
  }
  const deadlineMatch = text.match(
    /(?:마감일|종료일|접수\s*마감|신청\s*마감|응답\s*마감)\s*[:：]?\s*((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/,
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
  periodLanguage?: boolean;
  sourcePageCap?: "high" | "medium" | "low";
}): "high" | "medium" | "low" | "none" {
  const hasStructured =
    Boolean(input.postedYmd) ||
    Boolean(input.periodStart && input.periodEnd) ||
    Boolean(input.deadline) ||
    Boolean(input.periodEnd);
  let level: "high" | "medium" | "low" | "none";
  if (hasStructured && (input.postedYmd || input.periodEnd || input.deadline)) {
    level = "high";
  } else if (hasStructured || (input.periodLanguage && input.eligible)) {
    level = "medium";
  } else if (input.eligible) {
    level = "medium";
  } else if (input.unknown) {
    level = "none";
  } else {
    level = "low";
  }
  if (input.sourcePageCap === "low" && level === "high") level = "medium";
  if (!hasStructured && input.sourcePageCap === "low") {
    level = input.unknown ? "none" : "low";
  }
  return level;
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
  source?: { sourcePageUrl?: string | null; homepageUrl?: string | null },
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
  const keepExistingExclusion =
    oldYear ||
    /closed|restricted|stale|personal|published_too_old|end_date|start_date_future/.test(
      reason,
    );
  const sourcePageCap = sourcePageConfidenceCap({
    sourcePageUrl: source?.sourcePageUrl,
    homepageUrl: source?.homepageUrl,
  });
  const confidence = freshnessConfidence({
    postedYmd: dates.postedYmd,
    periodStart: dates.periodStart,
    periodEnd: dates.periodEnd,
    deadline: dates.deadline,
    eligible,
    unknown,
    periodLanguage: hasPeriodLanguage(dates.dateText || ""),
    sourcePageCap,
  });
  const holdByConfidence =
    !keepExistingExclusion && (confidence === "low" || confidence === "none");
  const shouldDiagnose =
    record.should_diagnose === true &&
    eligible &&
    !keepExistingExclusion &&
    !holdByConfidence;
  return {
    ...record,
    discovery_channel: "official_site",
    freshness_basis: "source_page",
    freshness_confidence: confidence,
    should_diagnose: shouldDiagnose,
    diagnosis_eligible_recent: shouldDiagnose,
    diagnosis_exclusion_reason: shouldDiagnose
      ? null
      : keepExistingExclusion
        ? record.diagnosis_exclusion_reason || reason
        : holdByConfidence
          ? "date_unknown_hold"
          : record.diagnosis_exclusion_reason || reason || "date_unknown_hold",
    old_year_signal: oldYear,
    source_posted_date: dates.postedYmd,
    source_period_start: dates.periodStart,
    source_period_end: dates.periodEnd,
    source_deadline: dates.deadline,
    source_date_text: dates.dateText,
  };
}
