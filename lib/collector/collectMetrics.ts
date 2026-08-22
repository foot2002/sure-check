/**
 * Operator-facing collect metrics. Ratios stay in 0–100% and never mix
 * today counts with cumulative totals.
 */

export type RatioDisplay = {
  numerator: number;
  denominator: number;
  ratio: number | null;
  pctLabel: string;
  invalid: boolean;
};

export function clampUnitRatio(
  numerator: number,
  denominator: number,
): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  const ratio = numerator / denominator;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) return null;
  return ratio;
}

export function formatUnitPct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  if (ratio < 0 || ratio > 1) return "계산 불가";
  const pct = Math.round(ratio * 1000) / 10;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export function ratioDisplay(
  numerator: number,
  denominator: number,
): RatioDisplay {
  const ratio = clampUnitRatio(numerator, denominator);
  return {
    numerator: Math.max(0, numerator),
    denominator: Math.max(0, denominator),
    ratio,
    pctLabel: formatUnitPct(ratio),
    invalid: denominator > 0 && ratio == null,
  };
}

export function dateUnknownHoldRatios(input: {
  todayHold: number;
  todayFound: number;
  totalHold: number;
  totalFound: number;
}): {
  today: RatioDisplay;
  total: RatioDisplay;
} {
  return {
    today: ratioDisplay(input.todayHold, input.todayFound),
    total: ratioDisplay(input.totalHold, input.totalFound),
  };
}

export type OfficialSiteCrawlSplit = {
  cronInstitutions: number;
  manualInstitutions: number;
  totalExplored: number;
  plannedDaily: number;
  hasRunRecords: boolean;
  exceedsPlan: boolean;
};

export function officialSiteCrawlSplit(input: {
  cronInstitutions: number;
  manualInstitutions: number;
  totalExplored: number;
  plannedDaily: number;
  hasRunRecords: boolean;
}): OfficialSiteCrawlSplit {
  const cron = Math.max(0, input.cronInstitutions);
  const manual = Math.max(0, input.manualInstitutions);
  const total = Math.max(0, input.totalExplored);
  const planned = Math.max(0, input.plannedDaily);
  return {
    cronInstitutions: cron,
    manualInstitutions: manual,
    totalExplored: total,
    plannedDaily: planned,
    hasRunRecords: input.hasRunRecords,
    exceedsPlan: total > planned && planned > 0,
  };
}

export function qualityWarningFlags(input: {
  sourcePageUrlSaveRate: number | null;
  postedDateExtractRate: number | null;
  todayDateUnknownHoldRatio: number | null;
  timeoutToday: number;
  stuckRunning: number;
  sourcePageUrlTarget?: number;
  postedDateTarget?: number;
  dateUnknownHoldTarget?: number;
}): {
  sourcePageUrlLow: boolean;
  postedDateLow: boolean;
  dateUnknownHoldHigh: boolean;
  timeoutOrStuck: boolean;
} {
  const sourceTarget = input.sourcePageUrlTarget ?? 0.9;
  const postedTarget = input.postedDateTarget ?? 0.5;
  const unknownTarget = input.dateUnknownHoldTarget ?? 0.3;
  return {
    sourcePageUrlLow:
      input.sourcePageUrlSaveRate != null &&
      input.sourcePageUrlSaveRate < sourceTarget,
    postedDateLow:
      input.postedDateExtractRate != null &&
      input.postedDateExtractRate < postedTarget,
    dateUnknownHoldHigh:
      input.todayDateUnknownHoldRatio != null &&
      input.todayDateUnknownHoldRatio > unknownTarget,
    timeoutOrStuck: input.timeoutToday > 0 || input.stuckRunning > 0,
  };
}
