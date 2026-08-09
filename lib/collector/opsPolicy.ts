/**
 * Ops backlog revalidation policy + batch caps for Cron readiness.
 * Collection and backlog revalidation are separate so one Vercel run
 * does not try to verify the entire backlog.
 */

/** Bounded concurrency for discovered/C-archive survey_links persist. */
export const COLLECTOR_DB_PERSIST_CONCURRENCY = 6;

/** After search (org_v1.1), only this many new candidates get full page validate. */
export const COLLECTOR_INLINE_PAGE_VALIDATE_BUDGET = 48;

/** org_v1.1: stricter inline page budget so search finishes ≤~70% of maxDuration. */
export const COLLECTOR_INLINE_PAGE_VALIDATE_ORG = 40;

/**
 * Discovered backlog batch per dedicated revalidate job.
 * Empirically ~0.5–1.2s per URL with concurrency 3 → ~70 URLs ≈ 50–90s
 * (within maxDuration=120s headroom). 4 waves ≈ ~280/day discovered revalidate;
 * plus A/B inline partition validates ≈ ~300/day target without raising Naver Search volume.
 */
export const COLLECTOR_DISCOVERED_BATCH_SIZE = 70;

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
 * Production schedule (Vercel Cron in vercel.json, UTC) — org_v1.2 auto ops:
 * - Collect A: 0 17 * * * → 02:00 KST  /api/internal/collector/run/a
 * - Collect B: 0 19 * * * → 04:00 KST  /api/internal/collector/run/b
 * - Revalidate ×4: 0 23 / 0 3 / 0 7 / 0 13 UTC → 08:00 / 12:00 / 16:00 / 22:00 KST
 * Legacy single /api/internal/collector/run Cron removed (endpoint kept for manual).
 * Diagnosis daily max stays 100 (unchanged); Diagnosis Cron schedules unchanged.
 */
export const COLLECTOR_OPS_SCHEDULE_NOTES = {
  dailyCollectA: "매일 02:00 KST (17:00 UTC) → /api/internal/collector/run/a",
  dailyCollectB: "매일 04:00 KST (19:00 UTC) → /api/internal/collector/run/b",
  discoveredBacklog:
    "매일 08:00 / 12:00 / 16:00 / 22:00 KST × batch~70 → /api/internal/collector/revalidate (~280/일 discovered) + inline A/B ≈ ~300/일",
  unreachableRetry: "discovered 우선 후 unreachable 15건 (동일 revalidate job)",
} as const;

/** Target collect wall time ≤ 70% of Vercel maxDuration (120s → 84s). */
export const COLLECTOR_ORG_RUNTIME_TARGET_MS = 84_000;

/**
 * Soft daily cap for A+B validation backlog (org_v1.2, non-canary).
 * Fast-track canary overrides via COLLECTOR_CANARY=1 → A≤100, B≤20, AB≤120
 * shared across partitions via getRemainingDailyAbCaps().
 */
export const COLLECTOR_DAILY_BACKLOG_CAP = 180;

/**
 * Fast-track canary backlog + org_v1.2 Production Cron (registered in vercel.json):
 * - Collect A: 02:00 KST / Collect B: 04:00 KST
 * - Revalidate: 08/12/16 × 70 ≈ 210/day discovered (+ inline A/B → ~230–250 toward 300)
 * - Diagnosis daily max remains 100 (separate pipeline)
 */
export const COLLECTOR_CANARY_BACKLOG_NOTES = {
  maxAPerDay: 100,
  maxBPerDay: 20,
  maxAbPerDay: 120,
  validateCArchive: false,
  manualRevalidateBatches: 4,
  batchSize: 70,
  /** ~280 discovered revalidate/day (4×70); inline A/B pushes total toward ~300. */
  dailyCapacity: 280,
  proposedCollectPartitions: {
    a: { kst: "02:00", utcCron: "0 17 * * *", path: "/api/internal/collector/run/a" },
    b: { kst: "04:00", utcCron: "0 19 * * *", path: "/api/internal/collector/run/b" },
  },
} as const;
