import type { WeeklyInsight, WeeklyReportSnapshot } from "@/lib/weekly/types";

export function formatWeeklyCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** Count / total as a one-decimal percent, matching dashboard rounding. */
export function weeklyRate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function buildWeeklyInsights(input: {
  personalInfoRate: number;
  attentionNeededRate: number;
  publicCount: number;
  publicExternalToolCount: number;
  schoolCount: number;
  retentionGapCount: number;
  destructionGapCount: number;
}): WeeklyInsight[] {
  const out: WeeklyInsight[] = [];

  out.push({
    order: out.length + 1,
    text: "온라인 설문은 개인정보 수집의 진입장벽을 낮췄지만, 고지 항목의 표준화는 따라가지 못하고 있습니다.",
  });

  if (input.publicCount > 0 || input.publicExternalToolCount > 0) {
    out.push({
      order: out.length + 1,
      text: "공공부문 설문은 국민 신뢰를 기반으로 응답이 이루어지는 만큼, 외부 설문도구 사용 시 보안 기준과 처리경로를 명확히 안내할 필요가 있습니다.",
    });
  }

  if (input.retentionGapCount > 0 || input.destructionGapCount > 0) {
    out.push({
      order: out.length + 1,
      text: "보유기간과 파기 기준 안내 미흡은 반복적으로 확인되는 핵심 문제입니다. 이는 응답자가 자신의 정보가 언제 삭제되는지 판단하기 어렵게 만듭니다.",
    });
  }

  if (input.schoolCount > 0) {
    out.push({
      order: out.length + 1,
      text: "학교·교육기관 설문은 학생·보호자 정보가 포함될 수 있어, 수집 목적과 보호자 동의 안내가 더욱 명확해야 합니다.",
    });
  }

  out.push({
    order: out.length + 1,
    text: "기관·기업은 설문 첫 화면에 최소 고지 항목을 표준 문구로 제공하는 방식만으로도 상당수 위험 신호를 줄일 수 있습니다.",
  });

  return out.slice(0, 5);
}

export const WEEKLY_CHECKLIST = [
  "수집 목적을 명확히 안내했는가",
  "수집 항목을 구체적으로 표시했는가",
  "보유기간을 안내했는가",
  "파기 기준을 안내했는가",
  "담당자 연락처를 표시했는가",
  "동의 거부권과 불이익 여부를 안내했는가",
  "외부 설문도구 사용 및 처리경로를 안내했는가",
  "국외이전 가능성이 있는 경우 관련 안내를 확인했는가",
  "공공부문인 경우 클라우드 보안 기준을 확인했는가",
];

export const WEEKLY_DISCLAIMER =
  "자동진단은 공개 설문 화면과 플랫폼 구조에 따라 일부 제한될 수 있습니다. 로그인, 비공개, 종료된 설문은 제한 처리되거나 제외될 수 있습니다. 본 리포트는 공개 설문 화면 기준의 참고 지표이며, 개별 설문의 위법 여부를 확정하지 않습니다.";

export function buildHeadline(analyzable: number, personalInfoCount: number): string {
  if (analyzable <= 0) {
    return "이번 주 분석 가능한 공개 설문 진단이 충분하지 않습니다";
  }
  return `공개 온라인 설문 ${formatWeeklyCount(analyzable)}건 중 ${formatWeeklyCount(personalInfoCount)}건에서 개인정보 수집 신호 확인`;
}

export function buildWeeklyOneLiner(
  weekLabel: string,
  analyzable: number,
  personalInfoCount: number,
): string {
  if (analyzable <= 0) {
    return `${weekLabel}에는 분석 가능한 진단 완료 설문이 충분하지 않습니다.`;
  }
  return `${weekLabel} 분석 완료 설문 ${formatWeeklyCount(analyzable)}건 중 ${formatWeeklyCount(personalInfoCount)}건에서 개인정보 수집 신호가 확인되었습니다.`;
}

export function buildWeeklyCountBullets(input: {
  analyzable: number;
  personalInfoCount: number;
  attentionNeededCount: number;
  thirdBullet: string;
}): [string, string, string] {
  return [
    `이번 주 분석 완료 설문 ${formatWeeklyCount(input.analyzable)}건 중 ${formatWeeklyCount(input.personalInfoCount)}건에서 개인정보 수집 신호가 확인되었습니다.`,
    `${formatWeeklyCount(input.attentionNeededCount)}건은 응답자 관점에서 주의 또는 추가 확인이 필요한 설문으로 분류되었습니다.`,
    input.thirdBullet,
  ];
}

/** Rebuild title/copy from stored diagnosis counts so old 10-건 비율 제목도 즉시 교정됩니다. */
export function normalizeWeeklySnapshotCopy(
  snapshot: WeeklyReportSnapshot,
): WeeklyReportSnapshot {
  const m = snapshot.metrics;
  const analyzable = m.analyzableCount;
  const personalInfoRate = weeklyRate(m.personalInfoCount, analyzable);
  const attentionNeededRate = weeklyRate(m.attentionNeededCount, analyzable);
  const sensitiveInfoRate = weeklyRate(m.sensitiveInfoCount, analyzable);
  const highRiskInfoRate = weeklyRate(m.highRiskInfoCount, analyzable);
  const headline = buildHeadline(analyzable, m.personalInfoCount);
  const oneLiner = buildWeeklyOneLiner(
    snapshot.weekLabel,
    analyzable,
    m.personalInfoCount,
  );
  const thirdBullet =
    snapshot.summary.bullets[2] ||
    "고지 항목 미흡과 확인 필요 신호가 반복적으로 나타났습니다.";
  const bullets = buildWeeklyCountBullets({
    analyzable,
    personalInfoCount: m.personalInfoCount,
    attentionNeededCount: m.attentionNeededCount,
    thirdBullet,
  });
  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      headline,
      oneLiner,
      bullets,
      analyzableCount: analyzable,
      personalInfoCount: m.personalInfoCount,
      personalInfoRate,
      attentionNeededCount: m.attentionNeededCount,
      attentionNeededRate,
    },
    metrics: {
      ...m,
      personalInfoRate,
      attentionNeededRate,
      sensitiveInfoRate,
      highRiskInfoRate,
    },
    pressSummary: buildPressSummary({
      weekLabel: snapshot.weekLabel,
      headline,
      analyzable,
      personalInfoCount: m.personalInfoCount,
      attentionNeededCount: m.attentionNeededCount,
      publicNarrative: snapshot.publicSector.narrative || null,
    }),
  };
}

export function buildPressSummary(input: {
  weekLabel: string;
  headline: string;
  analyzable: number;
  personalInfoCount: number;
  attentionNeededCount: number;
  publicNarrative: string | null;
}): string {
  const lines = [
    input.headline,
    "",
    `- 이번 주 분석 완료 설문 ${formatWeeklyCount(input.analyzable)}건 중 ${formatWeeklyCount(input.personalInfoCount)}건에서 개인정보 수집 신호가 확인되었습니다.`,
    `- ${formatWeeklyCount(input.attentionNeededCount)}건은 응답자 관점에서 주의 또는 추가 확인이 필요한 설문으로 분류되었습니다.`,
  ];
  if (input.publicNarrative) {
    lines.push(`- ${input.publicNarrative}`);
  }
  lines.push("");
  lines.push(
    "본 통계는 공개 설문 화면 기준 자동진단 결과이며, 개별 설문의 위법 여부를 확정하는 자료는 아닙니다.",
  );
  return lines.join("\n");
}
