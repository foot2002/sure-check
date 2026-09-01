import type { WeeklyInsight, WeeklyReportSnapshot } from "@/lib/weekly/types";
import { enrichAnonymousCase, selectWeeklyFeaturedCases } from "@/lib/weekly/anonymousCases";
import { composeWeeklyEditorial } from "@/lib/weekly/narrative";

export function formatWeeklyCount(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** Count / total as a one-decimal percent, matching dashboard rounding. */
export function weeklyRate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export type WeeklyKeyFinding = {
  order: number;
  title: string;
  detail: string;
};

export function buildWeeklyInsights(input: {
  personalInfoRate: number;
  attentionNeededRate: number;
  publicCount: number;
  publicExternalToolCount: number;
  schoolCount: number;
  retentionGapCount: number;
  destructionGapCount: number;
  topIssue?: string | null;
  grade?: string | null;
  scoreDelta?: number | null;
  sensitiveRate?: number;
}): WeeklyInsight[] {
  const out: WeeklyInsight[] = [];
  const topIssue = input.topIssue || "";

  if (/고지/.test(topIssue) || input.personalInfoRate >= 80) {
    out.push({
      order: out.length + 1,
      text: topIssue
        ? `이번 주 가장 많이 확인된 문제는 ${topIssue}이었습니다. 이는 개별 설문 운영자의 실수가 아니라, 온라인 설문을 만들 때 개인정보 고지문을 표준으로 삽입하는 체계가 부족하다는 신호로 볼 수 있습니다.`
        : "반복적으로 누락되는 항목은 기술 문제가 아니라 표준 고지문 부재의 문제입니다. 기관 차원의 표준 설문 양식과 사전 점검 체계가 필요합니다.",
    });
  } else {
    out.push({
      order: out.length + 1,
      text: "온라인 설문도구는 누구나 쉽게 개인정보 수집 창구를 만들 수 있게 했지만, 고지문 작성과 보관·파기 책임은 여전히 운영자에게 맡겨져 있는 경우가 많습니다.",
    });
  }

  if (input.publicCount > 0 || input.publicExternalToolCount > 0) {
    out.push({
      order: out.length + 1,
      text: "공공부문 설문에서 외부 설문도구 확인 필요 신호가 반복된 것은, 기관이 외부 도구를 사용하지 말아야 한다는 뜻이 아니라, 국민이 개인정보 처리경로와 보안 기준을 화면에서 확인할 수 있어야 한다는 의미입니다. 공공부문 설문은 국민이 기관 신뢰를 전제로 응답하는 만큼, 외부 설문도구 사용 여부와 개인정보 처리경로를 민간보다 더 명확히 안내해야 합니다.",
    });
  }

  if ((input.scoreDelta ?? 0) < 0) {
    out.push({
      order: out.length + 1,
      text: "이번 주 개인정보 보호 수준지수가 하락한 것은 고지 품질이 나빠졌거나 확인 필요 신호가 늘어났을 수 있으므로, 설문 첫 화면의 고지 항목을 다시 점검할 필요가 있습니다.",
    });
  } else if ((input.scoreDelta ?? 0) > 0 && (input.grade === "주의" || input.grade === "위험")) {
    out.push({
      order: out.length + 1,
      text: "이번 주 개인정보 보호 수준지수가 소폭 상승했지만 여전히 주의 구간에 머문 것은, 일부 항목의 개선 가능성에도 불구하고 보유기간·파기 기준 안내가 충분히 자리 잡지 못했음을 보여줍니다.",
    });
  }

  if (input.retentionGapCount > 0 || input.destructionGapCount > 0) {
    out.push({
      order: out.length + 1,
      text: "보유기간과 파기 기준 안내 미흡은 응답자가 자신의 정보가 언제 삭제되는지 판단하기 어렵게 만드는 반복 문제입니다.",
    });
  }

  if (input.schoolCount > 0) {
    out.push({
      order: out.length + 1,
      text: "학교·교육기관 설문은 학생·보호자 정보가 포함될 수 있어, 수집 목적과 보호자 동의 안내가 더욱 명확해야 합니다.",
    });
  }

  if ((input.sensitiveRate || 0) > 5) {
    out.push({
      order: out.length + 1,
      text: "민감정보 포함 신호가 확인된 설문은 꼭 필요한 항목만 받고, 동의 안내를 더 분명하게 표시해야 합니다.",
    });
  }

  if (out.length < 3) {
    out.push({
      order: out.length + 1,
      text: "기관·기업은 설문 첫 화면에 최소 고지 항목을 표준 문구로 제공하는 것만으로도 상당수 위험 신호를 줄일 수 있습니다.",
    });
  }

  return out.slice(0, 5).map((row, index) => ({ ...row, order: index + 1 }));
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

export const WEEKLY_TOP_DISCLAIMER =
  "본 리포트는 공개 설문 화면 기준 자동진단 결과를 바탕으로 한 참고 지표입니다. 개별 설문의 위법 여부를 확정하지 않으며, 기관명·설문 URL·문항 원문·캡처 원본은 공개하지 않습니다.";

export const WEEKLY_DISCLAIMER =
  "자동진단은 공개 설문 화면과 플랫폼 구조에 따라 일부 제한될 수 있습니다. 로그인, 비공개, 종료된 설문은 제한 처리되거나 제외될 수 있습니다. 본 리포트는 공개 설문 화면 기준의 참고 지표이며, 개별 설문의 위법 여부를 확정하지 않습니다.";

export const WEEKLY_PLATFORM_CAVEAT =
  "이 수치는 플랫폼 자체의 위법성을 의미하지 않습니다. 해당 플랫폼으로 운영된 공개 설문 화면에서 확인된 고지·안내 상태를 집계한 결과입니다.";

export const WEEKLY_PUBLIC_SECTOR_SUBTITLE =
  "공공부문 설문은 국민 신뢰를 바탕으로 응답이 이루어지는 만큼, 외부 설문도구 사용과 개인정보 처리경로 안내가 더 명확해야 합니다.";

export const WEEKLY_PUBLIC_SECTOR_POLICY =
  "공공부문 설문은 국민이 기관 신뢰를 전제로 응답하는 경우가 많기 때문에, 외부 설문도구 사용 여부와 개인정보 처리경로를 민간보다 더 명확히 안내할 필요가 있습니다.";

export const WEEKLY_NOTICE_EXAMPLE_NOTE =
  "아래 문구는 실제 설문 문구가 아니라 개선 방향을 설명하기 위한 재구성 예시입니다.";

export const WEEKLY_OPERATOR_QUOTE =
  "SURE Check 운영팀은 “온라인 설문은 가장 일상적인 개인정보 수집 창구가 되었지만, 응답자가 보유기간과 파기 기준을 확인하기 어려운 사례가 반복되고 있다”며 “공공기관과 기업은 설문 첫 화면에 최소 고지 항목을 표준화해 안내할 필요가 있다”고 설명했습니다.";

export const WEEKLY_RESPONDENT_TIPS = {
  title: "설문에 이름·연락처를 쓰기 전, 이것만은 확인하세요",
  items: [
    "내 정보가 왜 필요한지 설명이 있는가",
    "언제까지 보관하고 언제 파기하는지 적혀 있는가",
    "누가 관리하고 어디로 문의해야 하는지 보이는가",
    "외부 설문도구를 쓰는 경우 개인정보 처리경로가 안내되어 있는가",
    "건강, 민원, 피해 경험 등 민감한 내용은 꼭 필요한 경우인지 확인했는가",
  ],
};

export function buildHeadline(
  analyzable: number,
  personalInfoCount: number,
  attentionNeededCount = 0,
): string {
  if (analyzable <= 0) {
    return "이번 주 분석 가능한 공개 설문 진단이 충분하지 않습니다";
  }
  const personalRate = personalInfoCount / analyzable;
  const attentionRate = attentionNeededCount / analyzable;
  if (personalRate >= 0.8) {
    return `공개 온라인 설문 ${formatWeeklyCount(analyzable)}건 중 ${formatWeeklyCount(personalInfoCount)}건, 개인정보 수집 신호 확인`;
  }
  if (attentionNeededCount > 0 && attentionRate >= 0.7) {
    return `공개 온라인 설문 ${formatWeeklyCount(analyzable)}건 중 ${formatWeeklyCount(attentionNeededCount)}건, 응답 전 주의 필요`;
  }
  return `공개 온라인 설문 ${formatWeeklyCount(analyzable)}건 중 ${formatWeeklyCount(personalInfoCount)}건, 개인정보 수집 신호 확인`;
}

export function buildWeeklyOneLiner(
  weekLabel: string,
  analyzable: number,
  personalInfoCount: number,
  attentionNeededCount = 0,
): string {
  if (analyzable <= 0) {
    return `${weekLabel}에는 분석 가능한 진단 완료 설문이 충분하지 않습니다.`;
  }
  return `${weekLabel} 분석 완료 설문 ${formatWeeklyCount(analyzable)}건 중 ${formatWeeklyCount(personalInfoCount)}건에서 이름, 연락처, 이메일, 소속 등 개인정보 입력 신호가 확인됐습니다.${
    attentionNeededCount > 0
      ? ` ${formatWeeklyCount(attentionNeededCount)}건은 응답 전 추가 확인이 필요한 설문으로 분류됐습니다.`
      : ""
  }`;
}

export function buildWeeklyCountBullets(input: {
  analyzable: number;
  personalInfoCount: number;
  attentionNeededCount: number;
  thirdBullet: string;
}): [string, string, string] {
  return [
    `이번 주 분석 완료 설문 ${formatWeeklyCount(input.analyzable)}건 중 ${formatWeeklyCount(input.personalInfoCount)}건에서 개인정보 수집 신호가 확인됐습니다.`,
    `${formatWeeklyCount(input.attentionNeededCount)}건은 응답자가 개인정보 제공 여부를 판단하기 전 추가 확인이 필요한 설문으로 분류됐습니다.`,
    input.thirdBullet,
  ];
}

export function buildKeyFindings(input: {
  analyzable: number;
  personalInfoCount: number;
  attentionNeededCount: number;
  publicPersonalInfoCount: number;
  publicExternalToolCount: number;
  sensitiveCount?: number;
  highRiskCount?: number;
}): WeeklyKeyFinding[] {
  const n = formatWeeklyCount;
  const findings: WeeklyKeyFinding[] = [];
  if (input.analyzable > 0 && input.personalInfoCount > 0) {
    findings.push({
      order: findings.length + 1,
      title: "개인정보를 수집하는 설문이 대부분이었습니다.",
      detail: `분석 완료 설문 ${n(input.analyzable)}건 중 ${n(input.personalInfoCount)}건에서 개인정보 수집 신호가 확인됐습니다.`,
    });
  }
  if (input.attentionNeededCount > 0) {
    findings.push({
      order: findings.length + 1,
      title: "응답 전 추가 확인이 필요한 설문이 많았습니다.",
      detail: `${n(input.attentionNeededCount)}건은 수집 목적, 보유기간, 파기 기준, 담당자 연락처 등 고지 항목을 응답자가 확인하기 어려운 상태로 분류됐습니다.`,
    });
  }
  if (input.publicPersonalInfoCount > 0 || input.publicExternalToolCount > 0) {
    findings.push({
      order: findings.length + 1,
      title: "공공부문 외부 설문도구 사용 확인 신호가 반복됐습니다.",
      detail: `공공부문 개인정보 수집 설문 ${n(Math.max(input.publicPersonalInfoCount, input.publicExternalToolCount))}건에서 외부 설문도구 사용 및 공공부문 보안 기준 확인 필요 신호가 확인됐습니다.`,
    });
  } else if ((input.sensitiveCount || 0) > 0 || (input.highRiskCount || 0) > 0) {
    findings.push({
      order: findings.length + 1,
      title: "민감·고위험정보 확인 필요 신호가 나타났습니다.",
      detail: `민감정보 ${n(input.sensitiveCount || 0)}건, 고위험정보 ${n(input.highRiskCount || 0)}건에서 추가 확인이 필요한 문항 신호가 확인됐습니다.`,
    });
  } else if (findings.length < 3 && input.analyzable > 0) {
    findings.push({
      order: findings.length + 1,
      title: "고지 항목 보완이 필요한 설문이 확인됐습니다.",
      detail: "공개 화면에서 수집 목적·보유기간·담당자 연락처 안내를 확인하기 어려운 사례가 반복적으로 나타났습니다.",
    });
  }
  return findings.slice(0, 3).map((row, index) => ({ ...row, order: index + 1 }));
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
  const headline = buildHeadline(
    analyzable,
    m.personalInfoCount,
    m.attentionNeededCount,
  );
  const oneLiner = buildWeeklyOneLiner(
    snapshot.weekLabel,
    analyzable,
    m.personalInfoCount,
    m.attentionNeededCount,
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
  const schoolCount =
    snapshot.organizationStats.find((row) => row.typeLabel === "학교/교육기관")
      ?.surveyCount ?? 0;
  const insights = buildWeeklyInsights({
    personalInfoRate,
    attentionNeededRate,
    publicCount: snapshot.publicSector.publicPersonalInfoSurveyCount,
    publicExternalToolCount: m.publicExternalToolCount,
    schoolCount,
    retentionGapCount: snapshot.publicSector.retentionGapCount,
    destructionGapCount: snapshot.publicSector.destructionGapCount,
    topIssue: snapshot.issueTop5[0]?.label || null,
    grade: snapshot.summary.grade || m.grade,
    scoreDelta: snapshot.summary.scoreDelta,
    sensitiveRate: sensitiveInfoRate,
  });
  const enrichedCases = snapshot.anonymousCases.map(enrichAnonymousCase);
  const featuredCases = selectWeeklyFeaturedCases(enrichedCases, 3);
  const withCopy: WeeklyReportSnapshot = {
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
      evidenceSurveyCount:
        m.evidenceSurveyCount ?? snapshot.quality.evidenceSurveyCount ?? 0,
      evidenceImageCount:
        m.evidenceImageCount ??
        snapshot.quality.evidenceImageCount ??
        m.evidenceCaptureCount ??
        0,
    },
    quality: {
      ...snapshot.quality,
      evidenceSurveyCount:
        snapshot.quality.evidenceSurveyCount ?? m.evidenceSurveyCount ?? 0,
      evidenceImageCount:
        snapshot.quality.evidenceImageCount ??
        m.evidenceImageCount ??
        m.evidenceCaptureCount ??
        0,
    },
    insights,
    anonymousCases: featuredCases,
    pressSummary: "",
  };
  const editorial = composeWeeklyEditorial(withCopy);
  return {
    ...withCopy,
    editorial,
    pressSummary: buildPressSummary({
      weekLabel: snapshot.weekLabel,
      headline,
      analyzable,
      personalInfoCount: m.personalInfoCount,
      personalInfoRate,
      attentionNeededCount: m.attentionNeededCount,
      attentionNeededRate,
      publicExternalToolCount: m.publicExternalToolCount,
      publicNarrative: snapshot.publicSector.narrative || null,
      interpretation: editorial.pressInterpretation,
    }),
  };
}

export function buildPressSummary(input: {
  weekLabel: string;
  headline: string;
  analyzable: number;
  personalInfoCount: number;
  personalInfoRate?: number;
  attentionNeededCount: number;
  attentionNeededRate?: number;
  publicExternalToolCount?: number;
  publicNarrative: string | null;
  interpretation?: string;
}): string {
  const n = formatWeeklyCount;
  const personalRate =
    input.personalInfoRate ?? weeklyRate(input.personalInfoCount, input.analyzable);
  const attentionRate =
    input.attentionNeededRate ??
    weeklyRate(input.attentionNeededCount, input.analyzable);
  const lines = [
    `보도 제목 후보: ${input.headline}`,
    "",
    `리드문: SURE Check가 ${input.weekLabel} 공개 온라인 설문 자동진단 결과를 분석한 결과, 분석 완료 설문 ${n(input.analyzable)}건 중 ${n(input.personalInfoCount)}건에서 개인정보 수집 신호가 확인됐다. 이 가운데 ${n(input.attentionNeededCount)}건은 응답자가 개인정보 제공 여부를 판단하기 전 추가 확인이 필요한 설문으로 분류됐다.`,
    "",
    "핵심 통계:",
    `- 개인정보 수집 신호: ${n(input.personalInfoCount)}건, ${personalRate}%`,
    `- 응답 전 확인 필요: ${n(input.attentionNeededCount)}건, ${attentionRate}%`,
  ];
  if ((input.publicExternalToolCount || 0) > 0) {
    lines.push(
      `- 공공부문 외부도구 확인 필요: ${n(input.publicExternalToolCount || 0)}건`,
    );
  }
  lines.push("");
  lines.push(
    `주요 해석: ${
      input.interpretation ||
      "이번 주 결과에서 가장 두드러진 신호는 고지 항목 확인 필요였다. 온라인 설문이 일상적인 정보 수집 수단으로 자리 잡았지만, 보유기간과 파기 기준 등 기본 안내 항목은 여전히 충분히 확인되지 않는 경우가 많았다."
    }`,
  );
  if (input.publicNarrative) {
    lines.push("");
    lines.push(
      "공공부문: 공공부문 개인정보 수집 설문에서는 외부 설문도구 사용 및 보안 기준 확인 필요 신호가 반복적으로 나타났습니다.",
    );
  }
  lines.push("");
  lines.push(`운영팀 코멘트: ${WEEKLY_OPERATOR_QUOTE}`);
  lines.push("");
  lines.push(WEEKLY_TOP_DISCLAIMER);
  return lines.join("\n");
}
