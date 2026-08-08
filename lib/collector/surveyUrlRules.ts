/**
 * Strict survey response URL path rules for the collector.
 * Does NOT loosen diagnosis extractors — collector-only validation.
 */

import type { CollectorPlatform, UrlKind } from "@/lib/collector/types";

export type SurveyUrlRuleResult =
  | {
      ok: true;
      platform: CollectorPlatform;
      surveyId: string;
    }
  | {
      ok: false;
      reason: string;
    };

const MOAFORM_BLOCKED_HOSTS = new Set([
  "help.moaform.com",
  "api.moaform.com",
  "admin.moaform.com",
  "dashboard.moaform.com",
  "www.help.moaform.com",
]);

const MOAFORM_BLOCKED_PATH_PREFIXES = [
  "/hc/",
  "/help/",
  "/login",
  "/signin",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/admin",
  "/dashboard",
  "/pricing",
  "/blog",
  "/docs/",
  "/api/",
  "/v1/",
  "/oauth",
  "/account",
  "/settings",
];

function safeParse(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

function pathWithoutTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** Broad extract-stage: survey-related domain mention (not yet a valid response URL). */
export function looksLikeSurveyDomainUrl(url: string): boolean {
  const parsed = safeParse(url);
  if (!parsed) {
    const lower = url.toLowerCase();
    return (
      lower.includes("forms.gle") ||
      lower.includes("docs.google.com/forms") ||
      lower.includes("form.naver.com") ||
      lower.includes("naver.me/") ||
      lower.includes("moaform.com") ||
      lower.includes("surveyl.ink")
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "forms.gle" || host === "naver.me") return true;
  if (host === "docs.google.com" && parsed.pathname.toLowerCase().includes("/forms")) {
    return true;
  }
  if (host === "form.naver.com") return true;
  if (host === "moaform.com" || host.endsWith(".moaform.com")) return true;
  if (host === "surveyl.ink" || host.endsWith(".surveyl.ink")) return true;
  return false;
}

export function isCollectorShortenerUrl(url: string): boolean {
  const parsed = safeParse(url);
  if (!parsed) {
    const lower = url.toLowerCase();
    return /(^|\/)naver\.me\//i.test(lower) || /(^|\/)forms\.gle\//i.test(lower);
  }
  const host = parsed.hostname.toLowerCase();
  return host === "naver.me" || host === "forms.gle";
}

/**
 * Google Forms: individual response pages only.
 * Accepts docs.google.com/forms/d/.../viewform (and /d/e/.../viewform).
 * Rejects edit, analytics, formResponse-as-destination, generic /forms paths.
 */
export function isValidGoogleFormsResponseUrl(url: string): SurveyUrlRuleResult {
  const parsed = safeParse(url);
  if (!parsed) return { ok: false, reason: "URL 파싱 실패" };
  const host = parsed.hostname.toLowerCase();
  if (host === "forms.gle") {
    return { ok: false, reason: "forms.gle는 리디렉션 후 검증 필요" };
  }
  if (host !== "docs.google.com") {
    return { ok: false, reason: "Google Forms 호스트가 아님" };
  }

  const path = pathWithoutTrailingSlash(parsed.pathname);
  const lower = path.toLowerCase();

  if (/\/edit$/i.test(lower)) {
    return { ok: false, reason: "Google Forms 편집 URL 제외" };
  }
  if (/\/viewanalytics|\/analytics|\/reporting/i.test(lower)) {
    return { ok: false, reason: "Google Forms 결과/분석 URL 제외" };
  }
  if (/\/formresponse$/i.test(lower)) {
    return { ok: false, reason: "Google Forms formResponse URL 제외" };
  }
  // Closed but real survey: /forms/d/e/{id}/closedform[/viewform]
  const closedMatch = path.match(
    /^\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]+)\/closedform(?:\/viewform)?$/i,
  );
  if (closedMatch?.[1]) {
    return { ok: true, platform: "google_forms", surveyId: closedMatch[1] };
  }
  // Published form: /forms/d/e/{id}/viewform or /forms/d/{id}/viewform
  const viewMatch = path.match(
    /^\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]+)\/viewform$/i,
  );
  if (viewMatch?.[1]) {
    return { ok: true, platform: "google_forms", surveyId: viewMatch[1] };
  }
  // Some share links: /forms/d/e/{id} without trailing viewform — still a form id path
  const idOnly = path.match(/^\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]+)$/i);
  if (idOnly?.[1]) {
    return { ok: true, platform: "google_forms", surveyId: idOnly[1] };
  }

  return { ok: false, reason: "Google Forms 개별 응답 경로가 아님" };
}

/**
 * Naver Form: form.naver.com/response/{id} only.
 */
export function isValidNaverFormResponseUrl(url: string): SurveyUrlRuleResult {
  const parsed = safeParse(url);
  if (!parsed) return { ok: false, reason: "URL 파싱 실패" };
  const host = parsed.hostname.toLowerCase();
  if (host === "naver.me") {
    return { ok: false, reason: "naver.me는 리디렉션 후 검증 필요" };
  }
  if (host !== "form.naver.com") {
    return { ok: false, reason: "Naver Form 호스트가 아님" };
  }
  const path = pathWithoutTrailingSlash(parsed.pathname);
  const match = path.match(/^\/response\/([A-Za-z0-9_-]+)$/i);
  if (!match?.[1]) {
    return { ok: false, reason: "Naver Form /response/{id} 경로가 아님" };
  }
  return { ok: true, platform: "naver_form", surveyId: match[1] };
}

/**
 * Moaform: individual response paths only (/q/{code}, answer.../answers/{id}, surveyl.ink/{id}).
 */
export function isValidMoaformResponseUrl(url: string): SurveyUrlRuleResult {
  const parsed = safeParse(url);
  if (!parsed) return { ok: false, reason: "URL 파싱 실패" };
  const host = parsed.hostname.toLowerCase();
  const path = pathWithoutTrailingSlash(parsed.pathname);
  const lowerPath = path.toLowerCase() || "/";

  if (!host.includes("moaform.com") && host !== "surveyl.ink" && !host.endsWith(".surveyl.ink")) {
    return { ok: false, reason: "Moaform 호스트가 아님" };
  }

  if (MOAFORM_BLOCKED_HOSTS.has(host) || host.startsWith("help.") || host.startsWith("api.")) {
    return { ok: false, reason: `Moaform 비설문 호스트 제외: ${host}` };
  }

  if (host === "answer.moaform.com" && (lowerPath === "/" || lowerPath === "")) {
    return { ok: false, reason: "answer.moaform.com 루트 제외" };
  }

  for (const prefix of MOAFORM_BLOCKED_PATH_PREFIXES) {
    if (lowerPath === prefix.replace(/\/$/, "") || lowerPath.startsWith(prefix)) {
      return { ok: false, reason: `Moaform 비설문 경로 제외: ${prefix}` };
    }
  }

  // Homepage / marketing
  if (
    (host === "moaform.com" || host === "www.moaform.com") &&
    (lowerPath === "/" || lowerPath === "")
  ) {
    return { ok: false, reason: "Moaform 홈페이지 제외" };
  }

  const qMatch = path.match(/^\/q\/([A-Za-z0-9_-]+)$/i);
  if (
    qMatch?.[1] &&
    (host === "moaform.com" || host === "www.moaform.com")
  ) {
    return { ok: true, platform: "moaform", surveyId: qMatch[1] };
  }

  const answerMatch = path.match(
    /^\/answers\/([A-Za-z0-9_-]+)(?:\/start)?$/i,
  );
  if (answerMatch?.[1] && host === "answer.moaform.com") {
    if (answerMatch[1].toLowerCase() === "answers") {
      return { ok: false, reason: "잘못된 answer 경로" };
    }
    return { ok: true, platform: "moaform", surveyId: answerMatch[1] };
  }

  const formMatch = path.match(/^\/(?:forms?|s|survey)\/([A-Za-z0-9_-]+)$/i);
  if (
    formMatch?.[1] &&
    (host === "moaform.com" || host === "www.moaform.com") &&
    formMatch[1].toLowerCase() !== "404"
  ) {
    return { ok: true, platform: "moaform", surveyId: formMatch[1] };
  }

  if (host === "surveyl.ink" || host.endsWith(".surveyl.ink")) {
    const short = path.match(/^\/([A-Za-z0-9_-]+)$/i);
    if (short?.[1] && short[1].toLowerCase() !== "404") {
      return { ok: true, platform: "moaform", surveyId: short[1] };
    }
    return { ok: false, reason: "surveyl.ink 개별 설문 경로가 아님" };
  }

  return { ok: false, reason: "Moaform 개별 설문 응답 경로가 아님" };
}

/** Validate a fully-resolved (non-shortener) URL against platform path rules. */
export function validateSurveyResponseUrl(url: string): SurveyUrlRuleResult {
  const parsed = safeParse(url);
  if (!parsed) return { ok: false, reason: "URL 파싱 실패" };
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "http/https만 허용" };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "forms.gle" || host === "naver.me") {
    return { ok: false, reason: "단축 URL은 리디렉션 후 검증 필요" };
  }
  if (host === "docs.google.com" || host.includes("google.com")) {
    if (host === "docs.google.com") return isValidGoogleFormsResponseUrl(url);
  }
  if (host === "form.naver.com") return isValidNaverFormResponseUrl(url);
  if (host.includes("moaform.com") || host.includes("surveyl.ink")) {
    return isValidMoaformResponseUrl(url);
  }
  return { ok: false, reason: "지원하지 않는 설문 플랫폼" };
}

export function classifyCollectorUrlKind(url: string): UrlKind {
  if (isCollectorShortenerUrl(url)) return "shortener";
  const validated = validateSurveyResponseUrl(url);
  if (validated.ok) return validated.platform;
  return "unsupported";
}

export function toStrictCollectorPlatform(url: string): CollectorPlatform | null {
  const kind = classifyCollectorUrlKind(url);
  if (kind === "google_forms" || kind === "naver_form" || kind === "moaform") {
    return kind;
  }
  return null;
}
