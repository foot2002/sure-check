/**
 * Lightweight survey-page validation (not full diagnosis).
 * Distinguishes active / closed / restricted / unreachable / invalid / discovered.
 */

import { safeUrlCheck } from "@/lib/security/urlSafety";
import {
  COLLECTOR_REDIRECT_MAX,
  COLLECTOR_REDIRECT_TIMEOUT_MS,
} from "@/lib/collector/config";
import { validateSurveyResponseUrl } from "@/lib/collector/surveyUrlRules";
import type { CollectorPlatform, CollectorSurveyStatus } from "@/lib/collector/types";
import { fetchNaverFormAccessData } from "@/lib/extractors/naverFormsParser";
import {
  extractNaverSurveyId,
  NAVER_CLOSED_STATUSES,
} from "@/lib/extractors/naverFormsTypes";
import { fetchMoaformSpaForm } from "@/lib/extractors/moaformSpaClient";
import { extractMoaformId } from "@/lib/extractors/moaformTypes";
import {
  htmlLooksClosedSurvey,
  htmlLooksLoginRequired,
  isClosedSurveyUrl,
} from "@/lib/scan/surveyStatusSignals";

export const COLLECTOR_PAGE_VALIDATE_TIMEOUT_MS = 10_000;
export const COLLECTOR_PAGE_VALIDATE_MAX_BYTES = 512_000;

export type PageValidationVerdict =
  | "confirmed_survey"
  | "closed_survey"
  | "restricted_survey"
  | "not_survey"
  | "unreachable"
  | "unresolved";

export type PageValidationResult = {
  verdict: PageValidationVerdict;
  status: CollectorSurveyStatus;
  reason: string;
  finalUrl: string | null;
  httpStatus: number | null;
  contentType: string | null;
  pageTitle: string | null;
  platform: CollectorPlatform | null;
};

function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  return m[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
    .slice(0, 300) || null;
}

function looksLikeClosedSurvey(html: string, title: string | null, url: string): boolean {
  return htmlLooksClosedSurvey(html, title, url);
}

function looksLikeLoginPage(html: string, title: string | null): boolean {
  return htmlLooksLoginRequired(html, title);
}

/** Lightweight Naver /access status — same CLOSED set as Diagnosis parser. */
async function precheckNaverAccessStatus(
  finalUrl: string,
): Promise<"closed" | "restricted" | null> {
  const surveyId = extractNaverSurveyId(finalUrl);
  if (!surveyId) return null;
  const access = await fetchNaverFormAccessData(surveyId, finalUrl);
  if (!access.ok) {
    if (access.limitedReason?.includes("로그인")) return "restricted";
    return null;
  }
  const status = String(access.data?.status || "").toUpperCase();
  if (NAVER_CLOSED_STATUSES.has(status)) return "closed";
  return null;
}

function looksLikeHelpCenter(html: string, title: string | null, url: string): boolean {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.startsWith("help.") || host.includes("help.moaform")) return true;
  const blob = `${title || ""}\n${html.slice(0, 12_000)}`.toLowerCase();
  return /help center|고객센터|support center|zendesk/i.test(blob);
}

function hasPlatformSurveyMarkers(
  platform: CollectorPlatform,
  html: string,
  finalUrl: string,
): boolean {
  const sample = html.slice(0, 80_000).toLowerCase();
  if (platform === "google_forms") {
    return (
      sample.includes("google forms") ||
      sample.includes("docs-forms") ||
      sample.includes("freebirdformviewer") ||
      sample.includes("formviewer") ||
      sample.includes("closedform") ||
      /name=["']fbzx["']/i.test(html) ||
      /\/forms\/d\//i.test(finalUrl)
    );
  }
  if (platform === "naver_form") {
    return (
      sample.includes("form.naver.com") ||
      sample.includes("naver form") ||
      sample.includes("네이버폼") ||
      /\/response\//i.test(finalUrl)
    );
  }
  return (
    sample.includes("moaform") ||
    sample.includes("surveyl.ink") ||
    /answer\.moaform\.com/i.test(finalUrl) ||
    /\/q\/[a-z0-9_-]+/i.test(finalUrl)
  );
}

function decodeHtmlChunk(buffer: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean; totalBytes: number }> {
  if (!response.body) {
    const text = await response.text();
    const encoded = new TextEncoder().encode(text);
    if (encoded.byteLength > maxBytes) {
      return {
        text: decodeHtmlChunk(encoded.slice(0, maxBytes)),
        truncated: true,
        totalBytes: encoded.byteLength,
      };
    }
    return { text, truncated: false, totalBytes: encoded.byteLength };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total >= maxBytes) {
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    const remaining = maxBytes - total;
    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining));
      total += remaining;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: decodeHtmlChunk(merged), truncated, totalBytes: total };
}

function result(
  partial: Omit<PageValidationResult, never>,
): PageValidationResult {
  return partial;
}

/**
 * Lightweight GET validation for a format-valid survey URL.
 */
export async function validateSurveyPage(
  url: string,
  expectedPlatform?: CollectorPlatform,
): Promise<PageValidationResult> {
  const format = validateSurveyResponseUrl(url);
  if (!format.ok) {
    return result({
      verdict: "not_survey",
      status: "invalid",
      reason: format.reason,
      finalUrl: null,
      httpStatus: null,
      contentType: null,
      pageTitle: null,
      platform: null,
    });
  }

  const platform = expectedPlatform || format.platform;

  const safety = await safeUrlCheck(url);
  if (!safety.safe) {
    return result({
      verdict: "unresolved",
      status: "discovered",
      reason: safety.reason || "SSRF 차단",
      finalUrl: null,
      httpStatus: null,
      contentType: null,
      pageTitle: null,
      platform,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    COLLECTOR_PAGE_VALIDATE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "SURE-Check-Collector/1.0 (Survey Page Validation; +https://sure-check.local)",
      },
    });

    const finalUrl = response.url || url;
    if (finalUrl !== url) {
      // soft hop count; fetch follows redirects internally
    }

    const finalSafety = await safeUrlCheck(finalUrl);
    if (!finalSafety.safe) {
      return result({
        verdict: "unresolved",
        status: "discovered",
        reason: finalSafety.reason || "최종 URL SSRF 차단",
        finalUrl,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        pageTitle: null,
        platform,
      });
    }

    const finalFormat = validateSurveyResponseUrl(finalUrl);
    if (!finalFormat.ok) {
      return result({
        verdict: "not_survey",
        status: "invalid",
        reason: `리디렉션 최종 URL 비설문: ${finalFormat.reason}`,
        finalUrl,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        pageTitle: null,
        platform,
      });
    }

    if (isClosedSurveyUrl(finalUrl)) {
      return result({
        verdict: "closed_survey",
        status: "closed",
        reason: "리디렉션 최종 URL이 종료(closed/closedform)",
        finalUrl,
        httpStatus: response.status,
        contentType: response.headers.get("content-type"),
        pageTitle: null,
        platform: finalFormat.platform,
      });
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      return result({
        verdict: "not_survey",
        status: "invalid",
        reason: "API JSON 응답",
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle: null,
        platform,
      });
    }

    // Transient server errors → unreachable (not invalid)
    if (response.status === 429 || response.status >= 500) {
      return result({
        verdict: "unreachable",
        status: "unreachable",
        reason:
          response.status === 429
            ? "일시적 rate limit HTTP 429"
            : `일시적 서버 오류 HTTP ${response.status}`,
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle: null,
        platform: finalFormat.platform,
      });
    }

    if (response.status === 401 || response.status === 403) {
      return result({
        verdict: "restricted_survey",
        status: "restricted",
        reason: `접근 권한 필요 HTTP ${response.status}`,
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle: null,
        platform: finalFormat.platform,
      });
    }

    if (response.status === 404 || response.status === 410) {
      // Could be deleted survey page — treat as unreachable/closed-ish, not help-center invalid
      // Prefer unreachable for missing public page of a format-valid survey URL.
      return result({
        verdict: "unreachable",
        status: "unreachable",
        reason: `설문 URL HTTP ${response.status}`,
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle: null,
        platform: finalFormat.platform,
      });
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return result({
        verdict: "not_survey",
        status: "invalid",
        reason: `HTML이 아닌 Content-Type: ${contentType || "unknown"}`,
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle: null,
        platform,
      });
    }

    const body = await readLimitedBody(response, COLLECTOR_PAGE_VALIDATE_MAX_BYTES);
    const html = body.text;
    const pageTitle = extractHtmlTitle(html);

    if (looksLikeHelpCenter(html, pageTitle, finalUrl)) {
      return result({
        verdict: "not_survey",
        status: "invalid",
        reason: "고객센터/도움말 페이지",
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle,
        platform,
      });
    }

    if (looksLikeLoginPage(html, pageTitle)) {
      return result({
        verdict: "restricted_survey",
        status: "restricted",
        reason: "로그인/계정 권한 필요",
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle,
        platform: finalFormat.platform,
      });
    }

    if (looksLikeClosedSurvey(html, pageTitle, finalUrl)) {
      return result({
        verdict: "closed_survey",
        status: "closed",
        reason: "응답 종료된 설문",
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle,
        platform: finalFormat.platform,
      });
    }

    if (/페이지를 찾을 수 없음|page not found|404 not found/i.test(pageTitle || "")) {
      return result({
        verdict: "unreachable",
        status: "unreachable",
        reason: "404 페이지 제목",
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle,
        platform: finalFormat.platform,
      });
    }

    if (!response.ok) {
      return result({
        verdict: "unreachable",
        status: "unreachable",
        reason: `HTTP ${response.status}`,
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle,
        platform: finalFormat.platform,
      });
    }

    if (!hasPlatformSurveyMarkers(finalFormat.platform, html, finalUrl)) {
      return result({
        verdict: "unresolved",
        status: "discovered",
        reason: "설문 페이지 식별 요소 부족",
        finalUrl,
        httpStatus: response.status,
        contentType,
        pageTitle,
        platform: finalFormat.platform,
      });
    }

    // Platform-specific definitive signals (Diagnosis-aligned, no browser).
    if (finalFormat.platform === "naver_form") {
      const naver = await precheckNaverAccessStatus(finalUrl);
      if (naver === "closed") {
        return result({
          verdict: "closed_survey",
          status: "closed",
          reason: "네이버폼 access API 종료/일시중지 상태",
          finalUrl,
          httpStatus: response.status,
          contentType,
          pageTitle,
          platform: finalFormat.platform,
        });
      }
      if (naver === "restricted") {
        return result({
          verdict: "restricted_survey",
          status: "restricted",
          reason: "네이버폼 access API 로그인/접근 제한",
          finalUrl,
          httpStatus: response.status,
          contentType,
          pageTitle,
          platform: finalFormat.platform,
        });
      }
    }

    if (finalFormat.platform === "moaform") {
      const formId = extractMoaformId(finalUrl) || extractMoaformId(url);
      if (formId) {
        const spa = await fetchMoaformSpaForm(formId);
        if (spa.closed) {
          return result({
            verdict: "closed_survey",
            status: "closed",
            reason: spa.limitedReason || "모아폼 SPA 종료 상태",
            finalUrl,
            httpStatus: response.status,
            contentType,
            pageTitle,
            platform: finalFormat.platform,
          });
        }
        if (spa.ok) {
          return result({
            verdict: "confirmed_survey",
            status: "active",
            reason: "모아폼 SPA form2/next2 확인",
            finalUrl,
            httpStatus: response.status,
            contentType,
            pageTitle,
            platform: finalFormat.platform,
          });
        }
        // Uncertain SPA soft-fail — do not promote to active.
        return result({
          verdict: "unresolved",
          status: "discovered",
          reason: spa.limitedReason || "모아폼 SPA 상태 미확정",
          finalUrl,
          httpStatus: response.status,
          contentType,
          pageTitle,
          platform: finalFormat.platform,
        });
      }
    }

    return result({
      verdict: "confirmed_survey",
      status: "active",
      reason: "설문 응답 페이지 확인",
      finalUrl,
      httpStatus: response.status,
      contentType,
      pageTitle,
      platform: finalFormat.platform,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return result({
      verdict: "unreachable",
      status: "unreachable",
      reason: isTimeout
        ? "페이지 검증 타임아웃"
        : `네트워크 오류: ${error instanceof Error ? error.message : String(error)}`,
      finalUrl: null,
      httpStatus: null,
      contentType: null,
      pageTitle: null,
      platform,
    });
  } finally {
    clearTimeout(timer);
  }
}

void COLLECTOR_REDIRECT_MAX;
void COLLECTOR_REDIRECT_TIMEOUT_MS;
