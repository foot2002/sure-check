import { getCollectorCronExpectedSecret } from "@/lib/collector/cronAuth";

/**
 * Collector configuration — never throws on missing env at import time.
 */

export function getNaverClientId(): string | null {
  return process.env.NAVER_CLIENT_ID?.trim() || null;
}

export function getNaverClientSecret(): string | null {
  return process.env.NAVER_CLIENT_SECRET?.trim() || null;
}

export function getCollectorCronSecret(): string | null {
  return getCollectorCronExpectedSecret();
}

export function isNaverSearchConfigured(): boolean {
  return Boolean(getNaverClientId() && getNaverClientSecret());
}

export function isCollectorStorageConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

/** Search + storage ready for a full collection run. */
export function isCollectorConfigured(): boolean {
  return isNaverSearchConfigured() && isCollectorStorageConfigured();
}

export function getCollectorConfigError(): string | null {
  if (!isNaverSearchConfigured()) {
    return "수집 기능이 비활성화되어 있습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정하세요.";
  }
  if (!isCollectorStorageConfigured()) {
    return "수집 기능이 비활성화되어 있습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 설정하세요.";
  }
  return null;
}

export const COLLECTOR_REDIRECT_MAX = 5;
export const COLLECTOR_REDIRECT_TIMEOUT_MS = 8_000;
export const COLLECTOR_SEARCH_DELAY_MS = 250;
export const COLLECTOR_SEARCH_MAX_RETRIES = 2;
export const COLLECTOR_SEARCH_DISPLAY = 20;
/** Soft cap for API search calls per collection run (blog+cafe+web counted separately). */
export const COLLECTOR_MAX_API_CALLS = 36;
/** Soft wall-clock budget for a collection run (ms). Leave headroom under Vercel maxDuration=120s. */
export const COLLECTOR_MAX_RUNTIME_MS = 115_000;
/** Cap expensive page validations so search coverage finishes within the runtime budget. */
export const COLLECTOR_MAX_PAGE_VALIDATES = 48;

// Re-export ops policy caps so callers can import from config or opsPolicy.
export {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_UNREACHABLE_BATCH_SIZE,
  COLLECTOR_REVALIDATE_CONCURRENCY,
  COLLECTOR_REVALIDATE_DELAY_MS,
  COLLECTOR_REVALIDATE_MAX_RETRIES,
  COLLECTOR_STALE_RUNNING_MS,
} from "@/lib/collector/opsPolicy";
