/**
 * Production fast-track canary for org_v1.2 — same-day validate & decide.
 * Enable with COLLECTOR_CANARY=1 (or true/yes).
 *
 * Does NOT flip COLLECTOR_SEARCH_STRATEGY by itself.
 * Strategy env must be set separately (see resolveCollectorSearchStrategy).
 */

export const COLLECTOR_CANARY = {
  /** Fast-track: same-day collect → revalidate → quality spot check → decide */
  mode: "fast_track" as const,
  /** Max A_PRIORITY page-validates per day during canary */
  maxAPerDay: 100,
  /** Max B_PRIORITY page-validates per day during canary */
  maxBPerDay: 20,
  /** Total A+B daily validation inflow cap */
  maxAbPerDay: 120,
  /** C_ARCHIVE is never auto-validated in canary */
  validateCArchive: false,
  /**
   * Manual same-day backlog drain (Cron unchanged until ops decision):
   * revalidate discovered × up to 3 runs × ~50
   */
  proposedBacklogBatches: [
    { kst: "manual_1", batchSize: 50 },
    { kst: "manual_2", batchSize: 50 },
    { kst: "manual_3", batchSize: 50 },
  ],
  dailyBacklogCapacity: 120,
  notes: [
    "Search: COLLECTOR_SEARCH_STRATEGY=org_v1.2 (aliases: org_v1, org_v1_2, …)",
    "Canary caps: COLLECTOR_CANARY=1 → A≤100, B≤20, A+B≤120 shared across partitions",
    "Partition quotas: A→70/10/80, B→30/10/40 (B reserved; A must not invade)",
    "Cron: A 02:00KST / B 04:00KST / revalidate 08·12·16KST (same path ×3 schedules OK)",
    "Endpoints: /api/internal/collector/run/a and /run/b (sequential; reject if strategy=legacy)",
    "Rollback: COLLECTOR_SEARCH_STRATEGY=legacy (or unset) + COLLECTOR_CANARY unset/0",
    "C_ARCHIVE stored; promote to A/B when rediscovered from official source",
    "Do not connect SURE-Check diagnosis until explicitly approved",
  ],
} as const;

export function getCanaryDailyCaps(enabled: boolean): {
  maxA: number;
  maxB: number;
  maxAb: number;
} {
  if (!enabled) {
    // Non-canary org_v1.2 soft cap (opsPolicy COLLECTOR_DAILY_BACKLOG_CAP=180)
    return { maxA: 180, maxB: 180, maxAb: 180 };
  }
  return {
    maxA: COLLECTOR_CANARY.maxAPerDay,
    maxB: COLLECTOR_CANARY.maxBPerDay,
    maxAb: COLLECTOR_CANARY.maxAbPerDay,
  };
}

export function isCollectorCanaryEnabled(): boolean {
  const v = process.env.COLLECTOR_CANARY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
