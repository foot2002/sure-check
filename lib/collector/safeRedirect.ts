import { safeUrlCheck } from "@/lib/security/urlSafety";
import {
  COLLECTOR_REDIRECT_MAX,
  COLLECTOR_REDIRECT_TIMEOUT_MS,
} from "@/lib/collector/config";
import { isShortenerUrl } from "@/lib/collector/platformDetect";
import {
  assertSafePublicUrl,
  normalizeSurveyUrl,
} from "@/lib/collector/urlNormalize";
import type { CollectorPlatform } from "@/lib/collector/types";
import { toCollectorPlatform } from "@/lib/collector/platformDetect";

export type ResolveShortUrlResult =
  | {
      ok: true;
      finalUrl: string;
      canonicalUrl: string;
      platform: CollectorPlatform;
      hops: number;
    }
  | { ok: false; reason: string };

async function fetchRedirectLocation(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; location: string | null; finalUrl: string }> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent":
        "SURE-Check-Collector/1.0 (Public Survey Discovery; +https://sure-check.local)",
    },
    signal,
  });

  const location = response.headers.get("location");
  return {
    status: response.status,
    location,
    finalUrl: response.url || url,
  };
}

/**
 * Safely follow shortener redirects and return a supported survey URL.
 */
export async function resolveShortSurveyUrl(
  rawUrl: string,
): Promise<ResolveShortUrlResult> {
  const safety = await assertSafePublicUrl(rawUrl);
  if (!safety.ok) {
    return { ok: false, reason: safety.reason || "SSRF 차단" };
  }

  if (!isShortenerUrl(rawUrl)) {
    const normalized = normalizeSurveyUrl(rawUrl);
    if (!normalized.ok) return { ok: false, reason: normalized.reason };
    const platform = toCollectorPlatform(normalized.canonicalUrl);
    if (!platform) return { ok: false, reason: "지원하지 않는 설문 URL" };
    return {
      ok: true,
      finalUrl: normalized.canonicalUrl,
      canonicalUrl: normalized.canonicalUrl,
      platform,
      hops: 0,
    };
  }

  let current = rawUrl.trim();
  let hops = 0;

  while (hops < COLLECTOR_REDIRECT_MAX) {
    const hopSafety = await safeUrlCheck(current);
    if (!hopSafety.safe) {
      return { ok: false, reason: hopSafety.reason || "리다이렉트 SSRF 차단" };
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      COLLECTOR_REDIRECT_TIMEOUT_MS,
    );

    let status: number;
    let location: string | null;
    try {
      const result = await fetchRedirectLocation(current, controller.signal);
      status = result.status;
      location = result.location;
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "리다이렉트 타임아웃"
          : `리다이렉트 요청 실패: ${String(error)}`;
      return { ok: false, reason: message };
    } finally {
      clearTimeout(timer);
    }

    if (status >= 300 && status < 400 && location) {
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { ok: false, reason: "잘못된 Location 헤더" };
      }
      hops += 1;
      current = next;
      continue;
    }

    // Landed without further redirect
    break;
  }

  if (hops >= COLLECTOR_REDIRECT_MAX && isShortenerUrl(current)) {
    return { ok: false, reason: "리다이렉트 횟수 초과" };
  }

  const finalSafety = await assertSafePublicUrl(current);
  if (!finalSafety.ok) {
    return { ok: false, reason: finalSafety.reason || "최종 URL SSRF 차단" };
  }

  const normalized = normalizeSurveyUrl(current);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }

  const platform = toCollectorPlatform(normalized.canonicalUrl);
  if (!platform) {
    return { ok: false, reason: "단축 URL이 지원 설문 플랫폼으로 해석되지 않음" };
  }

  return {
    ok: true,
    finalUrl: current,
    canonicalUrl: normalized.canonicalUrl,
    platform,
    hops,
  };
}
