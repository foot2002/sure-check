import {
  COLLECTOR_SEARCH_DELAY_MS,
  COLLECTOR_SEARCH_DISPLAY,
  COLLECTOR_SEARCH_MAX_RETRIES,
  getNaverClientId,
  getNaverClientSecret,
} from "@/lib/collector/config";
import type { CollectorSearchHit, CollectorSourceType } from "@/lib/collector/types";

type NaverSearchEndpoint = "webkr" | "blog" | "cafearticle";

/** NAVER API HUB (ncloud) — not the legacy openapi.naver.com endpoints. */
const NAVER_API_HUB_BASE = "https://naverapihub.apigw.ntruss.com";

const ENDPOINT_TO_SOURCE: Record<NaverSearchEndpoint, CollectorSourceType> = {
  webkr: "web",
  blog: "blog",
  cafearticle: "cafe",
};

export type NaverSearchErrorKind = "auth" | "rate_limit" | "server" | "timeout" | "network" | "parse";

export class NaverSearchError extends Error {
  readonly kind: NaverSearchErrorKind;
  readonly status?: number;

  constructor(kind: NaverSearchErrorKind, message: string, status?: number) {
    super(message);
    this.name = "NaverSearchError";
    this.kind = kind;
    this.status = status;
  }
}

type NaverItem = {
  title?: string;
  description?: string;
  link?: string;
  bloggerlink?: string;
  cafeUrl?: string;
  postdate?: string;
};

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type NaverSearchCallResult = {
  httpStatus: number;
  items: NaverItem[];
  total?: number;
};

async function callNaverSearchOnce(
  endpoint: NaverSearchEndpoint,
  query: string,
  display: number = COLLECTOR_SEARCH_DISPLAY,
  sort: "sim" | "date" = "sim",
): Promise<NaverSearchCallResult> {
  const clientId = getNaverClientId();
  const clientSecret = getNaverClientSecret();
  if (!clientId || !clientSecret) {
    throw new NaverSearchError(
      "auth",
      "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다.",
    );
  }

  const url = new URL(`${NAVER_API_HUB_BASE}/search/v1/${endpoint}`);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(100, Math.max(1, display))));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", sort === "date" ? "date" : "sim");
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new NaverSearchError("auth", "네이버 검색 API 인증 실패", response.status);
    }
    if (response.status === 429) {
      throw new NaverSearchError("rate_limit", "네이버 검색 API 요청 한도 초과", 429);
    }
    if (response.status >= 500) {
      throw new NaverSearchError("server", `네이버 검색 API 서버 오류 (${response.status})`, response.status);
    }
    if (!response.ok) {
      throw new NaverSearchError(
        "server",
        `네이버 검색 API 오류 (${response.status})`,
        response.status,
      );
    }

    const json = (await response.json()) as {
      items?: NaverItem[];
      total?: number;
    };
    return {
      httpStatus: response.status,
      items: Array.isArray(json.items) ? json.items : [],
      total: typeof json.total === "number" ? json.total : undefined,
    };
  } catch (error) {
    if (error instanceof NaverSearchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NaverSearchError("timeout", "네이버 검색 API 타임아웃");
    }
    throw new NaverSearchError("network", `네이버 검색 네트워크 오류: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function callNaverSearchWithRetry(
  endpoint: NaverSearchEndpoint,
  query: string,
  display: number = COLLECTOR_SEARCH_DISPLAY,
  sort: "sim" | "date" = "sim",
): Promise<NaverSearchCallResult> {
  let lastError: NaverSearchError | null = null;
  for (let attempt = 0; attempt <= COLLECTOR_SEARCH_MAX_RETRIES; attempt += 1) {
    try {
      return await callNaverSearchOnce(endpoint, query, display, sort);
    } catch (error) {
      const typed =
        error instanceof NaverSearchError
          ? error
          : new NaverSearchError("network", String(error));
      lastError = typed;
      if (typed.kind === "auth") throw typed;
      if (attempt >= COLLECTOR_SEARCH_MAX_RETRIES) break;
      const backoff =
        typed.kind === "rate_limit"
          ? COLLECTOR_SEARCH_DELAY_MS * (attempt + 2) * 3
          : COLLECTOR_SEARCH_DELAY_MS * (attempt + 2);
      await sleep(backoff);
    }
  }
  throw lastError ?? new NaverSearchError("network", "네이버 검색 실패");
}

/**
 * Single-endpoint call for smoke tests / diagnostics. Does not log credentials.
 */
export async function searchNaverEndpoint(
  endpoint: NaverSearchEndpoint,
  query: string,
  options?: { display?: number; sort?: "sim" | "date" },
): Promise<{
  hits: CollectorSearchHit[];
  httpStatus: number;
  resultCount: number;
  total?: number;
}> {
  const result = await callNaverSearchWithRetry(
    endpoint,
    query,
    options?.display ?? COLLECTOR_SEARCH_DISPLAY,
    options?.sort ?? "sim",
  );
  return {
    hits: mapItems(result.items, endpoint, query),
    httpStatus: result.httpStatus,
    resultCount: result.items.length,
    total: result.total,
  };
}

function mapItems(
  items: NaverItem[],
  endpoint: NaverSearchEndpoint,
  searchQuery: string,
): CollectorSearchHit[] {
  const sourceType = ENDPOINT_TO_SOURCE[endpoint];
  const hits: CollectorSearchHit[] = [];
  for (const item of items) {
    const link = (item.link || item.cafeUrl || item.bloggerlink || "").trim();
    if (!link) continue;
    hits.push({
      title: stripHtml(item.title || ""),
      description: stripHtml(item.description || ""),
      link,
      sourceType,
      searchQuery,
      publishedAt: item.postdate
        ? item.postdate.length === 8
          ? `${item.postdate.slice(0, 4)}-${item.postdate.slice(4, 6)}-${item.postdate.slice(6, 8)}T00:00:00.000Z`
          : null
        : null,
    });
  }
  return hits;
}

export async function searchNaverAllSources(
  query: string,
  options?: { display?: number; sort?: "sim" | "date" },
): Promise<{ hits: CollectorSearchHit[]; errors: string[] }> {
  const endpoints: NaverSearchEndpoint[] = ["webkr", "blog", "cafearticle"];
  const hits: CollectorSearchHit[] = [];
  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const result = await callNaverSearchWithRetry(
        endpoint,
        query,
        options?.display ?? COLLECTOR_SEARCH_DISPLAY,
        options?.sort ?? "sim",
      );
      hits.push(...mapItems(result.items, endpoint, query));
    } catch (error) {
      const message =
        error instanceof NaverSearchError
          ? `[${endpoint}/${error.kind}] ${error.message}`
          : `[${endpoint}] ${String(error)}`;
      errors.push(message);
    }
    await sleep(COLLECTOR_SEARCH_DELAY_MS);
  }

  return { hits, errors };
}
