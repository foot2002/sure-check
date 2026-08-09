import { safeUrlCheck } from "@/lib/security/urlSafety";

const IS_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV,
);
const TIMEOUT_MS = IS_SERVERLESS ? 8_000 : 12_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SPA_PAGES = IS_SERVERLESS ? 24 : 40;
const QOOM_CLIENT_VERSION = "20220808";
const ANSWER_ORIGIN = "https://answer.moaform.com";

type CookieJar = Map<string, string>;

export type MoaformSpaFetchResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  softFail?: boolean;
  /** Definitive closed response window (Collector + Diagnosis share this). */
  closed?: boolean;
  limitedReason?: string;
  pageCount?: number;
  blockCount?: number;
};

function storeCookies(jar: CookieJar, setCookies: string[]) {
  for (const raw of setCookies) {
    const part = raw.split(";")[0] ?? "";
    const eq = part.indexOf("=");
    if (eq > 0) {
      jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function spaRequest(
  jar: CookieJar,
  formId: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; text: string; location: string | null }> {
  const { token, ...rest } = init;
  const url = path.startsWith("http") ? path : `${ANSWER_ORIGIN}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "SURE-Check/1.0 (Privacy Survey Scanner)",
    Referer: `${ANSWER_ORIGIN}/answers/${formId}`,
    Origin: ANSWER_ORIGIN,
    "X-Requested-With": "XMLHttpRequest",
    "x-qoom-v": QOOM_CLIENT_VERSION,
    ...((rest.headers as Record<string, string>) || {}),
  };
  if (token) headers["x-qoom-token"] = token;
  const cookie = cookieHeader(jar);
  if (cookie) headers.Cookie = cookie;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...rest,
      headers,
      signal: controller.signal,
      redirect: "manual",
    });
    storeCookies(jar, response.headers.getSetCookie?.() ?? []);
    const text = await response.text();
    if (text.length > MAX_BYTES) {
      throw new Error("SPA response too large");
    }
    return {
      status: response.status,
      text,
      location: response.headers.get("location"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function looksClosedRedirect(location: string | null, text: string): boolean {
  const blob = `${location || ""}\n${text.slice(0, 4000)}`;
  if (/\/closed(?:\/|$|\?|#)/i.test(blob)) return true;
  if (/"status"\s*:\s*"closed"/i.test(text)) return true;
  // Gateway JSON for ended surveys, e.g. conflict + redirect …/closed
  if (
    /설문이\s*마감|더\s*이상\s*답변|응답이\s*종료|no longer accepting/i.test(text) &&
    (/\/closed/i.test(text) || /"code"\s*:\s*"conflict"/i.test(text))
  ) {
    return true;
  }
  try {
    const parsed = JSON.parse(text) as {
      error?: { redirect?: string; message?: string; code?: string };
    };
    if (parsed?.error?.redirect && /\/closed/i.test(parsed.error.redirect)) {
      return true;
    }
    if (
      parsed?.error?.code === "conflict" &&
      /마감|종료|더\s*이상/i.test(String(parsed.error.message || ""))
    ) {
      return true;
    }
  } catch {
    /* not JSON */
  }
  return false;
}

function extractGatewayToken(html: string): string | null {
  const match = html.match(/const\s+token\s*=\s*'([^']+)'/);
  return match?.[1] ?? null;
}

/**
 * Public answer SPA flow (no Playwright):
 * HTML → /start → /gateway (JWT) → /form2 → POST /next2 pages with empty answers.
 * Stops after the last visible page (progress 100%) and does not POST a final submit.
 */
export async function fetchMoaformSpaForm(
  formId: string,
): Promise<MoaformSpaFetchResult> {
  const form2Url = `${ANSWER_ORIGIN}/answers/${formId}/form2`;
  const safety = await safeUrlCheck(form2Url);
  if (!safety.safe) {
    return {
      ok: false,
      softFail: true,
      limitedReason: safety.reason ?? "모아폼 SPA URL 안전검사에서 차단됨",
    };
  }

  const jar: CookieJar = new Map();
  const base = `/answers/${formId}`;

  try {
    const shell = await spaRequest(jar, formId, base);
    if (looksClosedRedirect(shell.location, shell.text)) {
      return {
        ok: false,
        closed: true,
        limitedReason: "모아폼 응답이 종료되었습니다.",
      };
    }

    const start = await spaRequest(jar, formId, `${base}/start`);
    if (looksClosedRedirect(start.location, start.text)) {
      return {
        ok: false,
        closed: true,
        limitedReason: "모아폼 응답이 종료되었습니다.",
      };
    }
    let gatewayPath = `${base}/gateway`;
    try {
      const startJson = JSON.parse(start.text) as { redirect_url?: string };
      if (startJson.redirect_url) {
        if (/\/closed(?:\/|$|\?|#)/i.test(startJson.redirect_url)) {
          return {
            ok: false,
            closed: true,
            limitedReason: "모아폼 응답이 종료되었습니다.",
          };
        }
        gatewayPath = startJson.redirect_url;
      }
    } catch {
      // start may already be HTML in some edge cases
    }

    const gateway = await spaRequest(jar, formId, gatewayPath);
    if (looksClosedRedirect(gateway.location, gateway.text)) {
      return {
        ok: false,
        closed: true,
        limitedReason: "모아폼 응답이 종료되었습니다.",
      };
    }
    const token = extractGatewayToken(gateway.text);
    if (!token) {
      // Closed surveys often serve gateway HTML without a session token.
      if (
        /\/closed|응답이\s*종료|설문이\s*종료|더\s*이상\s*응답|no longer accepting/i.test(
          `${gateway.location || ""}\n${gateway.text}`,
        )
      ) {
        return {
          ok: false,
          closed: true,
          limitedReason: "모아폼 응답이 종료되었습니다.",
        };
      }
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 gateway 세션 토큰을 확인하지 못했습니다.",
      };
    }

    // Mirror browser: return to answer shell after gateway token handoff
    await spaRequest(jar, formId, base, { token });

    const form2 = await spaRequest(jar, formId, `${base}/form2`, { token });
    let formPayload: Record<string, unknown>;
    try {
      formPayload = JSON.parse(form2.text) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 form2 JSON 파싱에 실패했습니다.",
      };
    }

    const formRecord = asRecord(formPayload.form);
    if (!formRecord) {
      const err = asRecord(formPayload.error);
      if (err) {
        return {
          ok: false,
          softFail: true,
          limitedReason: `모아폼 form2 오류: ${String(err.message ?? err.code ?? "unknown")}`,
        };
      }
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 form2 응답에 form이 없습니다.",
      };
    }

    const pages: Array<Record<string, unknown>> = [];
    let pid = "welcome";
    let pnumber = 0;
    let blockCount = 0;

    for (let step = 0; step < MAX_SPA_PAGES; step += 1) {
      const body = new URLSearchParams({
        utf8: "✓",
        id: formId,
        pid,
        pnumber: String(pnumber),
        answers: "[]",
        lqn: "0",
        crypt: "",
        ebs: "{}",
        ma: "[]",
        requestId: String(Date.now() + step),
      });

      const next = await spaRequest(jar, formId, `${base}/next2`, {
        method: "POST",
        token,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: body.toString(),
      });

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(next.text) as Record<string, unknown>;
      } catch {
        break;
      }

      if (asRecord(data.error)) {
        break;
      }

      const page = asRecord(data.page);
      if (!page) {
        break;
      }

      pages.push(page);
      blockCount += asArray(page.blocks).length;

      const progress = String(page.progressPercentage ?? "");
      // Include the final page, but do not advance again (avoids final submit).
      if (progress === "100%" || page.number === undefined) {
        break;
      }

      const nextId = typeof page.id === "string" ? page.id : "";
      if (!nextId) break;
      pid = nextId;
      pnumber = typeof page.number === "number" ? page.number : pnumber + 1;
    }

    if (pages.length === 0 || blockCount === 0) {
      // Still return form metadata so welcome/title can be used
      return {
        ok: true,
        data: {
          form: {
            ...formRecord,
            pages: [],
            blocks: [],
          },
        },
        pageCount: 0,
        blockCount: 0,
        softFail: true,
        limitedReason: "모아폼 SPA 세션은 열렸지만 문항 블록을 받지 못했습니다.",
      };
    }

    return {
      ok: true,
      data: {
        form: {
          ...formRecord,
          pages,
        },
      },
      pageCount: pages.length,
      blockCount,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 SPA 응답 시간 초과",
      };
    }
    return {
      ok: false,
      softFail: true,
      limitedReason: "모아폼 SPA 세션 fetch 중 오류가 발생했습니다.",
    };
  }
}
