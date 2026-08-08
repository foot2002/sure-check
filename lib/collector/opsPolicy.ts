/**
 * Ops backlog revalidation policy + batch caps for Cron readiness.
 * Collection and backlog revalidation are separate so one Vercel run
 * (maxDuration≈120s) does not try to verify the entire backlog.
 */

/** After search, only this many brand-new candidates get full page validate. */
export const COLLECTOR_INLINE_PAGE_VALIDATE_BUDGET = 48;

/**
 * Discovered backlog batch per dedicated revalidate job.
 * Empirically ~0.3–1.5s per URL with concurrency 3 → ~40 URLs ≈ 30–60s.
 */
export const COLLECTOR_DISCOVERED_BATCH_SIZE = 40;

/**
 * Unreachable retry batch (oldest first). Keep smaller — more likely to
 * burn retries/backoff on transient failures.
 */
export const COLLECTOR_UNREACHABLE_BATCH_SIZE = 15;

export const COLLECTOR_REVALIDATE_CONCURRENCY = 3;
export const COLLECTOR_REVALIDATE_DELAY_MS = 300;
/** Max extra attempts after the first try (total tries = 1 + maxRetries). */
export const COLLECTOR_REVALIDATE_MAX_RETRIES = 2;

/** Clear collection_runs stuck in running longer than this (ms). */
export const COLLECTOR_STALE_RUNNING_MS = 15 * 60 * 1000;

/**
 * Production schedule (Vercel Cron in vercel.json, UTC):
 * - Collect: 0 21 * * * → 06:00 KST → GET /api/internal/collector/run
 * - Revalidate both: 0 3 * * * → 12:00 KST → GET /api/internal/collector/revalidate
 * Jobs are 6h apart so they do not overlap under normal maxDuration.
 */
export const COLLECTOR_OPS_SCHEDULE_NOTES = {
  dailyCollect: "매일 06:00 KST (21:00 UTC) Vercel Cron → /api/internal/collector/run",
  discoveredBacklog:
    "매일 12:00 KST (03:00 UTC) revalidate mode=both, discovered batch 40",
  unreachableRetry: "동일 재검증 job에서 오래된 순 15건",
} as const;
