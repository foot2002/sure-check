/**
 * Ops backlog revalidation policy + batch caps for Cron readiness.
 * Collection and backlog revalidation are separate so one Vercel run
 * (maxDuration≈120s) does not try to verify the entire backlog.
 */

/** After search (org_v1.1), only this many new candidates get full page validate. */
export const COLLECTOR_INLINE_PAGE_VALIDATE_BUDGET = 48;

/** org_v1.1: stricter inline page budget so search finishes ≤~70% of maxDuration. */
export const COLLECTOR_INLINE_PAGE_VALIDATE_ORG = 40;

/**
 * Discovered backlog batch per dedicated revalidate job.
 * Empirically ~0.5–1.2s per URL with concurrency 3 → ~50 URLs ≈ 40–70s.
 * Raised from 40 → 50 for org_v1.1 inflow; measure before enabling multi-cron.
 */
export const COLLECTOR_DISCOVERED_BATCH_SIZE = 50;

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
 * Production schedule (Vercel Cron in vercel.json, UTC) — DO NOT change until approved:
 * - Collect: 0 21 * * * → 06:00 KST
 * - Revalidate: 0 3 * * * → 12:00 KST
 *
 * Proposed org_v1.1 backlog drain (not registered yet):
 * - Discovered-only: 12:00 / 16:00 / 20:00 KST (batch 50 each ≈ 150/day)
 * - Unreachable: keep with noon job or separate small batch
 */
export const COLLECTOR_OPS_SCHEDULE_NOTES = {
  dailyCollect: "매일 06:00 KST (21:00 UTC) Vercel Cron → /api/internal/collector/run",
  discoveredBacklog:
    "현재 등록: 매일 12:00 KST batch~50. 제안(미등록): 12/16/20시 KST ×50 = ~150/일",
  unreachableRetry: "discovered 우선 후 unreachable 15건 (동일 또는 별도 job)",
} as const;

/** Target collect wall time ≤ 70% of Vercel maxDuration (120s → 84s). */
export const COLLECTOR_ORG_RUNTIME_TARGET_MS = 84_000;

/**
 * Soft daily cap for A+B validation backlog (org_v1.2, non-canary).
 * Fast-track canary overrides via COLLECTOR_CANARY=1 → A≤100, B≤20, AB≤120.
 */
export const COLLECTOR_DAILY_BACKLOG_CAP = 180;

/**
 * Fast-track canary backlog (manual same-day; Cron schedule unchanged until ops decision).
 */
export const COLLECTOR_CANARY_BACKLOG_NOTES = {
  maxAPerDay: 100,
  maxBPerDay: 20,
  maxAbPerDay: 120,
  validateCArchive: false,
  manualRevalidateBatches: 3,
  batchSize: 50,
  dailyCapacity: 120,
} as const;
