import { safeUrlCheck } from "@/lib/security/urlSafety";

export interface SafeFetchResult {
  ok: boolean;
  html?: string;
  finalUrl?: string;
  contentType?: string;
  limitedReason?: string;
  failedReason?: string;
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;

const FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "User-Agent": "SURE-Check/1.0 (Privacy Survey Scanner; +https://sure-check.local)",
};

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);
  return buffer.toString("utf-8");
}

export async function safeFetchHtml(startUrl: string): Promise<SafeFetchResult> {
  let currentUrl = startUrl;
  let redirects = 0;

  while (redirects <= MAX_REDIRECTS) {
    const safety = await safeUrlCheck(currentUrl);
    if (!safety.safe) {
      return {
        ok: false,
        failedReason: safety.reason ?? "URL 안전검사에서 차단됨",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: FETCH_HEADERS,
      });

      clearTimeout(timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects >= MAX_REDIRECTS) {
          return {
            ok: false,
            limitedReason:
              redirects >= MAX_REDIRECTS
                ? "리다이렉트 횟수 제한(3회)을 초과했습니다."
                : "유효하지 않은 리다이렉트 응답입니다.",
          };
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirects += 1;
        continue;
      }

      if (!response.ok) {
        return {
          ok: false,
          limitedReason: `HTTP ${response.status} 응답으로 HTML을 가져올 수 없습니다.`,
        };
      }

      const contentType = response.headers.get("content-type");
      if (!isHtmlContentType(contentType)) {
        return {
          ok: false,
          limitedReason: "HTML이 아닌 콘텐츠입니다.",
          contentType: contentType ?? undefined,
        };
      }

      let html: string;
      try {
        html = await readLimitedBody(response, MAX_BYTES);
      } catch (err) {
        if (err instanceof Error && err.message === "RESPONSE_TOO_LARGE") {
          return { ok: false, limitedReason: "응답 크기가 2MB 제한을 초과했습니다." };
        }
        throw err;
      }

      return {
        ok: true,
        html,
        finalUrl: currentUrl,
        contentType: contentType ?? undefined,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, limitedReason: "응답 시간 초과(8초)" };
      }
      return {
        ok: false,
        limitedReason: "HTML fetch 중 오류가 발생했습니다.",
      };
    }
  }

  return { ok: false, limitedReason: "리다이렉트 처리에 실패했습니다." };
}
