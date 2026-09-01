import { formatWeeklyCount, weeklyRate } from "@/lib/weekly/copy";
import { countFromRate } from "@/lib/weekly/sampleSize";

export type WeeklyGroupRow = {
  label: string;
  surveyCount: number;
  personalInfoCount: number;
  personalInfoRate: number;
  sensitiveInfoCount: number;
  sensitiveInfoRate: number;
  highRiskInfoCount: number;
  highRiskInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  avgOverallScore: number | null;
};

export type WeeklyGroupCountInput = {
  surveyCount: number;
  personalInfoCount?: number;
  personalInfoRate: number;
  sensitiveInfoCount?: number;
  sensitiveInfoRate: number;
  highRiskInfoCount?: number;
  highRiskInfoRate: number;
  attentionNeededCount?: number;
  attentionNeededRate: number;
  avgOverallScore: number | null;
};

function hydrateCounts(row: WeeklyGroupCountInput): Omit<WeeklyGroupRow, "label"> {
  const total = row.surveyCount;
  const personalInfoCount =
    row.personalInfoCount ?? countFromRate(row.personalInfoRate, total);
  const sensitiveInfoCount =
    row.sensitiveInfoCount ?? countFromRate(row.sensitiveInfoRate, total);
  const highRiskInfoCount =
    row.highRiskInfoCount ?? countFromRate(row.highRiskInfoRate, total);
  const attentionNeededCount =
    row.attentionNeededCount ?? countFromRate(row.attentionNeededRate, total);
  return {
    surveyCount: total,
    personalInfoCount,
    personalInfoRate:
      row.personalInfoCount != null
        ? weeklyRate(personalInfoCount, total)
        : row.personalInfoRate,
    sensitiveInfoCount,
    sensitiveInfoRate:
      row.sensitiveInfoCount != null
        ? weeklyRate(sensitiveInfoCount, total)
        : row.sensitiveInfoRate,
    highRiskInfoCount,
    highRiskInfoRate:
      row.highRiskInfoCount != null
        ? weeklyRate(highRiskInfoCount, total)
        : row.highRiskInfoRate,
    attentionNeededCount,
    attentionNeededRate:
      row.attentionNeededCount != null
        ? weeklyRate(attentionNeededCount, total)
        : row.attentionNeededRate,
    avgOverallScore: row.avgOverallScore,
  };
}

/** Per-group caution rate: group caution count / group total. Never reuse a week-wide rate. */
export function groupCautionRate(
  attentionNeededCount: number,
  surveyCount: number,
): number {
  return weeklyRate(attentionNeededCount, surveyCount);
}

export function hydratePlatformRows(
  rows: Array<{ platform: string } & WeeklyGroupCountInput>,
): WeeklyGroupRow[] {
  return rows.map((row) => ({
    label: row.platform,
    ...hydrateCounts(row),
  }));
}

export function hydrateOrgRows(
  rows: Array<{ typeLabel: string } & WeeklyGroupCountInput>,
): WeeklyGroupRow[] {
  return rows.map((row) => ({
    label: row.typeLabel,
    ...hydrateCounts(row),
  }));
}

export function groupInsightCards(rows: WeeklyGroupRow[]): Array<{
  title: string;
  value: string;
}> {
  if (rows.length === 0) return [];
  const byCount = [...rows].sort((a, b) => b.surveyCount - a.surveyCount);
  const byCaution = [...rows]
    .filter((row) => row.surveyCount >= 5)
    .sort(
      (a, b) =>
        b.attentionNeededRate - a.attentionNeededRate ||
        b.surveyCount - a.surveyCount,
    );
  const byPii = [...rows]
    .filter((row) => row.surveyCount >= 5)
    .sort(
      (a, b) =>
        b.personalInfoRate - a.personalInfoRate || b.surveyCount - a.surveyCount,
    );
  const cards = [
    {
      title: "가장 많이 확인된 그룹",
      value: `${byCount[0].label} ${formatWeeklyCount(byCount[0].surveyCount)}건`,
    },
  ];
  if (byPii[0]) {
    cards.push({
      title: "개인정보 포함 비율이 높은 그룹",
      value: `${byPii[0].label} ${byPii[0].personalInfoRate}%`,
    });
  }
  if (byCaution[0]) {
    cards.push({
      title: "주의 필요 비율이 높은 그룹",
      value: `${byCaution[0].label} ${byCaution[0].attentionNeededRate}%`,
    });
  }
  return cards.slice(0, 3);
}

export function ratesLookCopied(
  rows: Array<{ surveyCount: number; attentionNeededRate: number }>,
  overallRate: number,
): boolean {
  const compared = rows.filter((row) => row.surveyCount > 0);
  if (compared.length < 2) return false;
  const distinctTotals = new Set(compared.map((row) => row.surveyCount));
  if (distinctTotals.size < 2) return false;
  return compared.every((row) => row.attentionNeededRate === overallRate);
}

export function recomputeGroupRate(count: number, total: number): number {
  return weeklyRate(count, total);
}
