/**
 * Phase timing for org_v1.2 collection (Production bottleneck diagnosis).
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

export type PhaseTiming = Record<CollectorPhaseKey, number> & {
  totalMs: number;
  startedAt: number;
};

export function createPhaseTiming(): PhaseTiming {
  return {
    load_known: 0,
    naver_search: 0,
    parse_extract: 0,
    triage: 0,
    db_upsert: 0,
    inline_page_validate: 0,
    query_stats: 0,
    other: 0,
    totalMs: 0,
    startedAt: Date.now(),
  };
}

export async function timePhase<T>(
  timing: PhaseTiming,
  key: CollectorPhaseKey,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    timing[key] += Date.now() - t0;
  }
}

export function finalizePhaseTiming(timing: PhaseTiming): PhaseTiming {
  timing.totalMs = Date.now() - timing.startedAt;
  return timing;
}

export function topPhase(timing: PhaseTiming): CollectorPhaseKey {
  const keys: CollectorPhaseKey[] = [
    "load_known",
    "naver_search",
    "parse_extract",
    "triage",
    "db_upsert",
    "inline_page_validate",
    "query_stats",
    "other",
  ];
  let best: CollectorPhaseKey = "other";
  let bestMs = -1;
  for (const k of keys) {
    if (timing[k] > bestMs) {
      bestMs = timing[k];
      best = k;
    }
  }
  return best;
}

export function formatPhaseTiming(timing: PhaseTiming): string {
  const parts = [
    `search=${timing.naver_search}`,
    `extract=${timing.parse_extract}`,
    `known+db=${timing.load_known + timing.db_upsert}`,
    `triage=${timing.triage}`,
    `inline=${timing.inline_page_validate}`,
    `qstats=${timing.query_stats}`,
    `total=${timing.totalMs}`,
    `top=${topPhase(timing)}`,
  ];
  return parts.join(" ");
}
