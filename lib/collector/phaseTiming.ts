/**
 * Phase timing for org_v1.2 collection (Production bottleneck diagnosis).
 *
 * - phaseWallMs: wall-clock time spent in a phase (mapPool outer span)
 * - aggregateWorkerMs: sum of per-worker durations (can exceed wall under concurrency)
 * Bottleneck / topPhase uses phaseWallMs only.
 */

export type CollectorPhaseKey =
  | "load_known"
  | "naver_search"
  | "parse_extract"
  | "triage"
  | "db_upsert"
  | "inline_page_validate"
  | "query_stats"
  | "other";

const PHASE_KEYS: CollectorPhaseKey[] = [
  "load_known",
  "naver_search",
  "parse_extract",
  "triage",
  "db_upsert",
  "inline_page_validate",
  "query_stats",
  "other",
];

function zeroPhases(): Record<CollectorPhaseKey, number> {
  return {
    load_known: 0,
    naver_search: 0,
    parse_extract: 0,
    triage: 0,
    db_upsert: 0,
    inline_page_validate: 0,
    query_stats: 0,
    other: 0,
  };
}

export type PhaseTiming = {
  phaseWallMs: Record<CollectorPhaseKey, number>;
  aggregateWorkerMs: Record<CollectorPhaseKey, number>;
  totalMs: number;
  startedAt: number;
};

export function createPhaseTiming(): PhaseTiming {
  return {
    phaseWallMs: zeroPhases(),
    aggregateWorkerMs: zeroPhases(),
    totalMs: 0,
    startedAt: Date.now(),
  };
}

/** Measure wall-clock for a sequential or outer concurrent block. */
export async function timePhase<T>(
  timing: PhaseTiming,
  key: CollectorPhaseKey,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    timing.phaseWallMs[key] += Date.now() - t0;
  }
}

/** Accumulate per-worker duration (may exceed wall under concurrency). */
export function addAggregateWorkerMs(
  timing: PhaseTiming,
  key: CollectorPhaseKey,
  ms: number,
): void {
  if (ms > 0) timing.aggregateWorkerMs[key] += ms;
}

export async function timeAggregateWorker<T>(
  timing: PhaseTiming,
  key: CollectorPhaseKey,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    addAggregateWorkerMs(timing, key, Date.now() - t0);
  }
}

export function finalizePhaseTiming(timing: PhaseTiming): PhaseTiming {
  timing.totalMs = Date.now() - timing.startedAt;
  return timing;
}

export function topPhase(timing: PhaseTiming): CollectorPhaseKey {
  let best: CollectorPhaseKey = "other";
  let bestMs = -1;
  for (const k of PHASE_KEYS) {
    const ms = timing.phaseWallMs[k];
    if (ms > bestMs) {
      bestMs = ms;
      best = k;
    }
  }
  return best;
}

export function formatPhaseTiming(timing: PhaseTiming): string {
  const w = timing.phaseWallMs;
  const parts = [
    `search=${w.naver_search}`,
    `extract=${w.parse_extract}`,
    `known+db=${w.load_known + w.db_upsert}`,
    `triage=${w.triage}`,
    `inline=${w.inline_page_validate}`,
    `qstats=${w.query_stats}`,
    `total=${timing.totalMs}`,
    `top=${topPhase(timing)}`,
  ];
  const aggDb = timing.aggregateWorkerMs.db_upsert;
  if (aggDb > 0) parts.push(`dbWorkers=${aggDb}`);
  return parts.join(" ");
}
