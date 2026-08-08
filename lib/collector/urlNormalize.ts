import { normalizeUrl as baseNormalizeUrl } from "@/lib/utils/normalizeUrl";
import { safeUrlCheck } from "@/lib/security/urlSafety";
import {
  classifyUrlKind,
  isShortenerUrl,
  toCollectorPlatform,
  validateSurveyResponseUrl,
} from "@/lib/collector/platformDetect";
import type { CollectorPlatform } from "@/lib/collector/types";

const EXTRA_TRACKING = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "nsid",
  "trackingid",
]);

export type NormalizedSurveyUrl = {
  ok: true;
  originalUrl: string;
  canonicalUrl: string;
  platform: CollectorPlatform;
  needsRedirect: boolean;
};

export type NormalizeSurveyUrlFailure = {
  ok: false;
  reason: string;
};

export type NormalizeSurveyUrlResult =
  | NormalizedSurveyUrl
  | NormalizeSurveyUrlFailure;

function ensureGoogleViewformPath(pathname: string): string {
  let path = pathname;
  if (/\/forms\/d\/(?:e\/)?[^/]+$/i.test(path) && !/\/viewform$/i.test(path)) {
    path = `${path.replace(/\/$/, "")}/viewform`;
  }
  return path;
}

function finalizeCanonical(urlString: string): string {
  const parsed = new URL(urlString);
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  if (parsed.hostname === "docs.google.com" && parsed.pathname.includes("/forms")) {
    parsed.pathname = ensureGoogleViewformPath(parsed.pathname);
    parsed.search = "";
  }
  if (
    (parsed.hostname === "moaform.com" || parsed.hostname === "www.moaform.com") &&
    /^\/q\//i.test(parsed.pathname)
  ) {
    parsed.search = "";
  }
  if (parsed.hostname === "form.naver.com") {
    // keep path; drop tracking only (already stripped)
  }
  return parsed.toString();
}

/**
 * Normalize a candidate URL for survey-link storage.
 * Does not follow redirects — callers resolve shorteners first.
 * Rejects edit/analytics/non-response paths (does not rewrite edit → viewform).
 */
export function normalizeSurveyUrl(rawUrl: string): NormalizeSurveyUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "URL 파싱 실패" };
  }

  if (
    parsed.protocol === "javascript:" ||
    parsed.protocol === "data:" ||
    parsed.protocol === "file:"
  ) {
    return { ok: false, reason: `차단된 프로토콜: ${parsed.protocol}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "http/https만 허용" };
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (EXTRA_TRACKING.has(lower) || lower.startsWith("utm_")) {
      parsed.searchParams.delete(key);
    }
  }
  if (![...parsed.searchParams.keys()].length) {
    parsed.search = "";
  }

  const kind = classifyUrlKind(parsed.toString());
  if (kind === "unsupported") {
    // Try adding viewform for bare Google form id paths before rejecting.
    if (
      parsed.hostname === "docs.google.com" &&
      /\/forms\/d\/(?:e\/)?[^/]+$/i.test(parsed.pathname)
    ) {
      parsed.pathname = ensureGoogleViewformPath(parsed.pathname);
    } else if (!isShortenerUrl(parsed.toString())) {
      const failed = validateSurveyResponseUrl(parsed.toString());
      return {
        ok: false,
        reason: failed.ok ? "지원하지 않는 설문 URL" : failed.reason,
      };
    }
  }

  if (kind === "shortener" || isShortenerUrl(parsed.toString())) {
    let canonical: string;
    try {
      canonical = finalizeCanonical(baseNormalizeUrl(parsed.toString()));
    } catch {
      canonical = finalizeCanonical(parsed.toString());
    }
    return {
      ok: true,
      originalUrl: rawUrl.trim(),
      canonicalUrl: canonical,
      platform: "google_forms", // placeholder until redirect resolve
      needsRedirect: true,
    };
  }

  if (parsed.hostname === "docs.google.com") {
    parsed.pathname = ensureGoogleViewformPath(parsed.pathname);
    parsed.search = "";
  }

  let canonical: string;
  try {
    canonical = finalizeCanonical(baseNormalizeUrl(parsed.toString()));
  } catch {
    canonical = finalizeCanonical(parsed.toString());
  }

  const validated = validateSurveyResponseUrl(canonical);
  if (!validated.ok) {
    return { ok: false, reason: validated.reason };
  }

  const platform = toCollectorPlatform(canonical) || validated.platform;
  return {
    ok: true,
    originalUrl: rawUrl.trim(),
    canonicalUrl: canonical,
    platform,
    needsRedirect: false,
  };
}

export async function assertSafePublicUrl(url: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const check = await safeUrlCheck(url);
  if (!check.safe) {
    return { ok: false, reason: check.reason || "SSRF 차단" };
  }
  return { ok: true };
}

export function isSurveyCandidateAfterResolve(url: string): boolean {
  return validateSurveyResponseUrl(url).ok;
}
