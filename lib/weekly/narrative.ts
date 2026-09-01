import { formatScore1, roundScore1, weeklyPrivacyGrade } from "@/lib/weekly/privacyIndex";
import type {
  WeeklyAnonymousCase,
  WeeklyEditorial,
  WeeklyReportSnapshot,
  WeeklyWeekOverWeek,
} from "@/lib/weekly/types";

function n(value: number): string {
  return value.toLocaleString("ko-KR");
}

function signedPoints(delta: number | null): string {
  const rounded = roundScore1(delta);
  if (rounded == null) return "";
  if (rounded === 0) return "변동 없음";
  return rounded > 0 ? `+${rounded.toFixed(1)}점` : `${rounded.toFixed(1)}점`;
}

export function evidencePeriodLabel(
  evidenceSurveyCount: number,
  analyzableCount: number,
): "이번 주" | "전체 누적" {
  if (analyzableCount > 0 && evidenceSurveyCount > analyzableCount) {
    return "전체 누적";
  }
  return "이번 주";
}

export type WeeklyNarrativeInput = {
  weekLabel: string;
  analyzable: number;
  personalInfoCount: number;
  personalInfoRate: number;
  attentionNeededCount: number;
  attentionNeededRate: number;
  sensitiveCount: number;
  sensitiveRate: number;
  avgScore: number | null;
  grade: string | null;
  scoreDelta: number | null;
  publicPersonalInfoCount: number;
  publicExternalToolCount: number;
  schoolCount: number;
  topIssue: string | null;
  previousTopIssue: string | null;
  previousPersonalInfoRate: number | null;
  previousAttentionRate: number | null;
  previousPublicExternalTool: number | null;
  platforms: Array<{
    label: string;
    surveyCount: number;
    attentionNeededRate: number;
    personalInfoRate: number;
  }>;
  orgs: Array<{
    label: string;
    surveyCount: number;
    personalInfoRate: number;
    attentionNeededRate: number;
  }>;
  questionTop: Array<{ label: string; count: number }>;
  retentionGap: number;
  destructionGap: number;
};

function gradeSentence(score: number | null, grade: string | null): string {
  const band = grade || weeklyPrivacyGrade(score);
  if (score == null || !band) {
    return "이번 주 지수를 산출할 분석 완료 설문이 충분하지 않습니다.";
  }
  if (band === "위험") return `지수는 ${formatScore1(score)}으로 위험 구간에 해당합니다.`;
  if (band === "주의") return `지수는 ${formatScore1(score)}으로 주의 구간에 머물렀습니다.`;
  if (band === "보통") return `지수는 ${formatScore1(score)}으로 보통 구간입니다.`;
  return `지수는 ${formatScore1(score)}으로 양호 구간입니다.`;
}

export function buildArticleLead(input: WeeklyNarrativeInput): string[] {
  const paragraphs: string[] = [];
  paragraphs.push(
    `SURE Check가 ${input.weekLabel} 공개 온라인 설문 자동진단 결과를 분석한 결과, 분석 완료 설문 ${n(input.analyzable)}건 중 ${n(input.personalInfoCount)}건에서 개인정보 수집 신호가 확인됐다. 이 중 ${n(input.attentionNeededCount)}건은 응답자가 개인정보 제공 여부를 판단하기 전에 수집 목적, 보유기간, 파기 기준, 담당자 연락처 등을 추가로 확인할 필요가 있는 설문으로 분류됐다.`,
  );

  const second: string[] = [];
  if (input.publicExternalToolCount > 0 || input.publicPersonalInfoCount > 0) {
    second.push(
      `특히 공공부문 개인정보 수집 설문에서는 외부 설문도구 사용과 개인정보 처리경로 안내에 대한 확인 필요 신호가 ${n(Math.max(input.publicExternalToolCount, input.publicPersonalInfoCount))}건 반복적으로 나타났다.`,
    );
  }
  if (input.scoreDelta != null) {
    const delta = roundScore1(input.scoreDelta) ?? 0;
    if (delta > 0) {
      second.push(
        `개인정보 보호 수준지수는 전주 대비 ${signedPoints(input.scoreDelta)} 상승했지만, ${gradeSentence(input.avgScore, input.grade)}`,
      );
    } else if (delta < 0) {
      second.push(
        `개인정보 보호 수준지수는 전주 대비 ${signedPoints(input.scoreDelta)} 하락했으며, ${gradeSentence(input.avgScore, input.grade)}`,
      );
    } else {
      second.push(gradeSentence(input.avgScore, input.grade));
    }
  } else {
    second.push(gradeSentence(input.avgScore, input.grade));
  }
  second.push(
    "이는 온라인 설문이 일상적인 개인정보 수집 창구가 된 반면, 설문 첫 화면의 고지 항목은 충분히 표준화되지 않았다는 점을 보여준다.",
  );
  paragraphs.push(second.join(" "));
  return paragraphs.slice(0, 3);
}

export function buildWeeklyNarrative(input: WeeklyNarrativeInput): string[] {
  const paragraphs: string[] = [];
  const personalClause =
    input.personalInfoRate >= 90
      ? "개인정보 수집 신호가 대부분의 설문에서 확인됐습니다."
      : `개인정보 수집 신호는 분석 완료 설문의 ${input.personalInfoRate}%에서 확인됐습니다.`;
  paragraphs.push(
    `이번 주 공개 온라인 설문에서는 ${personalClause} 분석 완료 설문 ${n(input.analyzable)}건 중 ${n(input.personalInfoCount)}건에서 이름, 연락처, 이메일, 소속 등 개인정보 입력 신호가 나타났고, 이는 온라인 설문이 단순 의견수렴 도구를 넘어 실질적인 개인정보 수집 창구로 활용되고 있음을 보여줍니다.`,
  );

  const cautionClause =
    input.attentionNeededRate >= 80
      ? "응답 전 추가 확인이 필요한 설문 비율이 높았습니다."
      : `응답 전 추가 확인이 필요한 설문은 ${n(input.attentionNeededCount)}건(${input.attentionNeededRate}%)이었습니다.`;
  if (input.scoreDelta != null) {
    const delta = roundScore1(input.scoreDelta) ?? 0;
    if (delta > 0) {
      paragraphs.push(
        `개인정보 보호 수준지수는 ${formatScore1(input.avgScore)}으로 전주보다 ${signedPoints(input.scoreDelta)} 상승했지만, 여전히 보완이 필요한 항목이 남아 있습니다. ${gradeSentence(input.avgScore, input.grade)} ${cautionClause} 이는 일부 항목의 개선 신호는 있으나 응답자가 개인정보 제공 여부를 판단하기에 충분한 안내가 여전히 부족하다는 의미로 해석됩니다.`,
      );
    } else if (delta < 0) {
      paragraphs.push(
        `이번 주 지수는 전주보다 하락했습니다. 고지 항목 점검이 필요합니다. ${gradeSentence(input.avgScore, input.grade)} ${cautionClause}`,
      );
    } else {
      paragraphs.push(
        `개인정보 보호 수준지수는 전주와 같은 수준이었습니다. ${gradeSentence(input.avgScore, input.grade)} ${cautionClause}`,
      );
    }
  } else {
    paragraphs.push(
      `전주 비교가 가능한 데이터가 충분하지 않아 이번 주는 단일 주차 기준으로 해석합니다. ${gradeSentence(input.avgScore, input.grade)} ${cautionClause}`,
    );
  }

  if (input.topIssue) {
    const noticeLead = /고지/.test(input.topIssue)
      ? "이번 주 가장 반복적으로 확인된 문제는 고지문 미흡이었습니다. "
      : `이번 주 가장 자주 확인된 미흡 항목은 ${input.topIssue}이었습니다. `;
    paragraphs.push(
      `${noticeLead}개인정보 수집 목적과 수집 항목, 보유기간, 파기 기준이 설문 첫 화면에서 명확히 확인되지 않으면 응답자는 자신의 정보가 왜 필요하고 언제 삭제되는지 알기 어렵습니다.`,
    );
  } else {
    paragraphs.push(
      "가장 자주 확인된 미흡 항목은 고지 항목 확인 필요였습니다. 공개 화면에서 수집 목적과 보유기간, 파기 기준을 찾기 어려우면 응답자는 제공 여부를 판단하기 어렵습니다.",
    );
  }

  if (input.publicExternalToolCount > 0 || input.publicPersonalInfoCount > 0) {
    paragraphs.push(
      `공공부문 설문에서는 외부 설문도구 사용 및 처리경로 확인 필요 신호가 나타났습니다. 공공부문 개인정보 수집 설문 ${n(Math.max(input.publicPersonalInfoCount, input.publicExternalToolCount))}건에서 외부 설문도구 사용과 공공부문 클라우드 보안 기준 확인 필요 신호가 반복적으로 나타났습니다. 공공기관 설문은 국민이 기관 신뢰를 전제로 응답하는 경우가 많기 때문에, 민간 설문보다 개인정보 처리경로와 보안 기준을 더 명확히 안내할 필요가 있습니다.`,
    );
  } else if (input.schoolCount > 0) {
    paragraphs.push(
      `이번 주 학교·교육기관 설문 ${n(input.schoolCount)}건에서는 학생·보호자 정보가 포함될 수 있는 수집 신호가 확인됐습니다. 학교 설문은 보호자 동의와 수집 목적 안내가 더 명확해야 합니다.`,
    );
  } else {
    paragraphs.push(
      "이번 주 확인된 설문은 민간·확인 불가 유형이 중심이었습니다. 운영 주체가 화면에서 분명히 보이지 않으면 응답자는 누구에게 개인정보 처리를 문의해야 하는지 알기 어렵습니다.",
    );
  }

  paragraphs.push(
    "응답자 관점에서 이번 주 결과는, 이름과 연락처를 입력하기 전에 정보가 왜 필요하고 언제까지 보관되는지를 확인하기 어려운 설문이 많았다는 점을 보여줍니다. 공개 화면에서 확인되지 않은 고지 항목은 응답자가 제공 여부를 판단하기 어렵게 만듭니다.",
  );

  paragraphs.push(
    "이번 주 결과는 온라인 설문 개인정보 보호의 핵심 문제가 기술적 수집 기능이 아니라, 표준 고지문과 사전 점검 체계의 부족에 있음을 보여줍니다. 설문 운영자는 설문 첫 화면에 수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처, 외부도구 사용 여부를 명확히 표시하는 것만으로도 상당수 위험 신호를 줄일 수 있습니다.",
  );

  return paragraphs.slice(0, 6);
}

export function buildWeekOverWeek(input: WeeklyNarrativeInput): WeeklyWeekOverWeek {
  const hasPrior =
    input.scoreDelta != null ||
    input.previousPersonalInfoRate != null ||
    input.previousAttentionRate != null;
  const personalInfoRateDelta =
    input.previousPersonalInfoRate != null
      ? Math.round((input.personalInfoRate - input.previousPersonalInfoRate) * 10) / 10
      : null;
  const attentionNeededRateDelta =
    input.previousAttentionRate != null
      ? Math.round((input.attentionNeededRate - input.previousAttentionRate) * 10) / 10
      : null;
  const publicExternalToolDelta =
    input.previousPublicExternalTool != null
      ? input.publicExternalToolCount - input.previousPublicExternalTool
      : null;

  let interpretation =
    "전주 비교가 가능한 데이터가 충분하지 않아 이번 주는 단일 주차 기준으로 해석합니다.";
  if (hasPrior) {
    const delta = roundScore1(input.scoreDelta);
    if (delta != null && delta > 0) {
      interpretation = `이번 주 개인정보 보호 수준지수는 전주 대비 ${signedPoints(input.scoreDelta)} 상승했지만, 여전히 ${input.grade || "주의"} 구간에 머물렀습니다. 이는 일부 설문에서 고지 항목이 개선된 신호가 있었지만, 응답자가 보유기간과 파기 기준을 확인하기 어려운 사례가 여전히 많다는 의미입니다.`;
    } else if (delta != null && delta < 0) {
      interpretation = `이번 주 지수는 전주보다 하락했습니다. 특히 고지문 미흡과 보유기간 안내 부족이 늘어나면서 응답자가 개인정보 제공 여부를 판단하기 어려운 설문 비율이 높아졌습니다.`;
    } else {
      interpretation = `전주 대비 지수는 크게 달라지지 않았습니다. ${gradeSentence(input.avgScore, input.grade)} 응답 전 확인 필요 비율은 ${input.attentionNeededRate}%입니다.`;
    }
    if (input.previousTopIssue && input.topIssue && input.previousTopIssue !== input.topIssue) {
      interpretation += ` TOP 이슈는 전주 ‘${input.previousTopIssue}’에서 이번 주 ‘${input.topIssue}’로 바뀌었습니다.`;
    } else if (input.topIssue) {
      interpretation += ` 이번 주 TOP 이슈는 ${input.topIssue}이었습니다.`;
    }
  }

  return {
    hasPrior,
    scoreDelta: input.scoreDelta,
    personalInfoRateDelta,
    attentionNeededRateDelta,
    publicExternalToolDelta,
    previousTopIssue: input.previousTopIssue,
    currentTopIssue: input.topIssue,
    interpretation,
  };
}

export function buildPlatformNarrative(input: WeeklyNarrativeInput): string {
  const sorted = [...input.platforms].sort((a, b) => b.surveyCount - a.surveyCount);
  const top = sorted[0];
  if (!top) {
    return "이번 주 플랫폼별 분석 대상이 충분하지 않습니다.";
  }
  const names = sorted
    .slice(0, 2)
    .map((row) => row.label)
    .join("와 ");
  const caution = [...sorted]
    .filter((row) => row.surveyCount >= 5)
    .sort((a, b) => b.attentionNeededRate - a.attentionNeededRate)[0];
  return `이번 주에는 ${names} 기반 설문이 대부분을 차지했습니다. ${top.label}는 건수가 ${n(top.surveyCount)}건으로 가장 많고${
    caution ? ` 주의 필요 비율은 ${caution.label} ${caution.attentionNeededRate}%로 높게 나타났습니다` : ""
  }. 다만 이 수치는 플랫폼 자체의 위법성을 의미하는 것이 아니라, 해당 플랫폼으로 운영된 공개 설문 화면에서 확인된 고지·안내 상태를 집계한 결과입니다.`;
}

export function buildOrganizationNarrative(input: WeeklyNarrativeInput): string {
  const sorted = [...input.orgs].sort((a, b) => b.surveyCount - a.surveyCount);
  const publicOrg = input.orgs.find((row) => row.label === "공공기관");
  const school = input.orgs.find((row) => row.label === "학교/교육기관");
  const medical = input.orgs.find((row) => row.label === "의료기관");
  const top = sorted[0];
  if (!top) {
    return "이번 주 기관유형별 분석 대상이 충분하지 않습니다.";
  }
  const bits = [`${top.label} 설문이 ${n(top.surveyCount)}건으로 가장 많이 확인됐습니다.`];
  if (publicOrg && publicOrg.surveyCount > 0) {
    bits.push(
      `공공기관은 주의 필요 ${publicOrg.attentionNeededRate}%로, 국민이 기관 신뢰를 전제로 응답하는 설문일수록 처리경로 안내가 더 분명해야 합니다.`,
    );
  }
  if (school && school.surveyCount > 0) {
    bits.push(
      `학교·교육기관은 표본 ${n(school.surveyCount)}건이지만 개인정보 포함 비율이 ${school.personalInfoRate}%로 높게 나타났습니다.`,
    );
  }
  if (medical && medical.surveyCount > 0 && medical.surveyCount < 5) {
    bits.push(
      `의료기관은 ${n(medical.surveyCount)}건으로 표본이 적어 과도한 일반화보다 개별 설문 운영 방식 점검이 필요합니다.`,
    );
  }
  bits.push("표본이 적은 유형은 과도한 일반화보다 개별 설문 운영 방식 점검이 필요합니다.");
  return bits.join(" ");
}

export function buildQuestionNarrative(input: WeeklyNarrativeInput): string {
  const top = input.questionTop[0];
  const second = input.questionTop[1];
  if (!top) {
    return "문항 원문은 공개하지 않으며, 이번 주 카테고리 집계가 충분하지 않습니다.";
  }
  const labels = [top.label, second?.label].filter(Boolean).join("·");
  return `문항 기준으로는 ${labels}가 가장 자주 확인됐습니다. 이는 온라인 설문이 단순 의견수렴뿐 아니라 신청·접수·연락 목적의 개인정보 수집 창구로 사용되고 있음을 보여줍니다. 문항 원문은 공개하지 않으며, 카테고리 집계만 표시합니다.`;
}

export function buildNextWeekWatch(input: WeeklyNarrativeInput): string[] {
  const points: string[] = [];
  if (input.publicExternalToolCount > 0) {
    points.push("공공부문 외부 설문도구 사용 설문의 처리경로·보안 기준 안내가 보완되는지 관찰합니다.");
  }
  if (input.topIssue) {
    points.push(`이번 주 TOP 이슈인 ${input.topIssue} 비율이 다음 주에도 반복되는지 확인합니다.`);
  }
  if (input.attentionNeededRate >= 70) {
    points.push("응답 전 확인 필요 비율이 낮아지는지, 보유기간·파기 기준 안내가 늘어나는지 봅니다.");
  }
  if (input.schoolCount > 0) {
    points.push("학교·교육기관 설문의 보호자 동의·수집 목적 안내 신호가 개선되는지 관찰합니다.");
  }
  if (input.sensitiveRate > 0) {
    points.push("민감정보 포함 설문의 최소수집·동의 안내가 확인되는지 살펴봅니다.");
  }
  if (points.length < 3) {
    points.push("개인정보 보호 수준지수가 주의 구간을 벗어나 보통 구간으로 이동하는지 확인합니다.");
  }
  return points.slice(0, 4);
}

export function buildKeywords(input: WeeklyNarrativeInput): string[] {
  const keys: string[] = [];
  if (input.topIssue) keys.push(input.topIssue);
  if (input.publicExternalToolCount > 0) keys.push("공공부문 외부도구");
  if (input.retentionGap > 0 || input.destructionGap > 0) keys.push("보유기간 안내 부족");
  if (input.schoolCount > 0) keys.push("학교·교육기관");
  if (input.sensitiveCount > 0) keys.push("민감정보 확인 필요");
  if (keys.length < 3) keys.push("응답 전 확인 필요");
  return [...new Set(keys)].slice(0, 3);
}

export function buildCardLead(input: WeeklyNarrativeInput): string {
  const deltaBit =
    input.scoreDelta != null && (roundScore1(input.scoreDelta) || 0) !== 0
      ? `개인정보 보호 수준지수는 ${formatScore1(input.avgScore)}으로 전주보다 ${(roundScore1(input.scoreDelta) || 0) > 0 ? "올랐지만" : "내렸고"} 여전히 ${input.grade || "주의"} 구간에 머물렀습니다.`
      : `개인정보 보호 수준지수는 ${formatScore1(input.avgScore)}으로 ${input.grade || "참고"} 구간입니다.`;
  const publicBit =
    input.publicExternalToolCount > 0
      ? "이번 주 분석에서는 개인정보 수집 신호와 공공부문 외부도구 확인 필요가 반복적으로 나타났습니다."
      : "이번 주 분석에서는 개인정보 수집 신호와 고지 항목 확인 필요가 반복적으로 나타났습니다.";
  return `${publicBit} ${deltaBit}`;
}

export function buildPressInterpretation(input: WeeklyNarrativeInput): string {
  const issue = input.topIssue || "고지 항목 확인 필요";
  const publicBit =
    input.publicExternalToolCount > 0
      ? "고지문 미흡과 공공부문 외부 설문도구 사용 확인 필요"
      : issue;
  return `이번 주 결과에서 가장 두드러진 신호는 ${publicBit}였다. 온라인 설문이 기관·기업의 일상적인 정보 수집 수단으로 자리 잡았지만, 보유기간과 파기 기준, 담당자 연락처 등 기본 안내 항목은 여전히 충분히 확인되지 않는 경우가 많았다.`;
}

export function narrativeInputFromSnapshot(
  snapshot: WeeklyReportSnapshot,
): WeeklyNarrativeInput {
  const m = snapshot.metrics;
  const sortedTrends = [...snapshot.trends].sort((a, b) =>
    a.weekId.localeCompare(b.weekId),
  );
  const idx = sortedTrends.findIndex((row) => row.weekId === snapshot.weekId);
  const prev = idx > 0 ? sortedTrends[idx - 1] : null;
  const schoolCount =
    snapshot.organizationStats.find((row) => row.typeLabel === "학교/교육기관")
      ?.surveyCount ?? 0;
  return {
    weekLabel: snapshot.weekLabel,
    analyzable: m.analyzableCount,
    personalInfoCount: m.personalInfoCount,
    personalInfoRate: m.personalInfoRate,
    attentionNeededCount: m.attentionNeededCount,
    attentionNeededRate: m.attentionNeededRate,
    sensitiveCount: m.sensitiveInfoCount,
    sensitiveRate: m.sensitiveInfoRate,
    avgScore: m.avgScore,
    grade: m.grade,
    scoreDelta: snapshot.summary.scoreDelta,
    publicPersonalInfoCount: snapshot.publicSector.publicPersonalInfoSurveyCount,
    publicExternalToolCount: m.publicExternalToolCount,
    schoolCount,
    topIssue: snapshot.issueTop5[0]?.label || null,
    previousTopIssue: snapshot.editorial?.weekOverWeek.previousTopIssue || null,
    previousPersonalInfoRate: prev?.personalInfoRate ?? null,
    previousAttentionRate: prev?.attentionNeededRate ?? null,
    previousPublicExternalTool:
      prev?.publicExternalToolCount ??
      (snapshot.editorial?.weekOverWeek.publicExternalToolDelta != null
        ? snapshot.metrics.publicExternalToolCount -
          snapshot.editorial.weekOverWeek.publicExternalToolDelta
        : null),
    platforms: snapshot.platformStats.map((row) => ({
      label: row.platform,
      surveyCount: row.surveyCount,
      attentionNeededRate: row.attentionNeededRate,
      personalInfoRate: row.personalInfoRate,
    })),
    orgs: snapshot.organizationStats.map((row) => ({
      label: row.typeLabel,
      surveyCount: row.surveyCount,
      personalInfoRate: row.personalInfoRate,
      attentionNeededRate: row.attentionNeededRate,
    })),
    questionTop: snapshot.questionStats.frequentCategories.slice(0, 3).map((row) => ({
      label: row.label,
      count: row.count,
    })),
    retentionGap: snapshot.publicSector.retentionGapCount,
    destructionGap: snapshot.publicSector.destructionGapCount,
  };
}

export function composeWeeklyEditorial(
  snapshot: WeeklyReportSnapshot,
  previous?: WeeklyReportSnapshot | null,
): WeeklyEditorial {
  const input = narrativeInputFromSnapshot(snapshot);
  if (previous) {
    input.previousTopIssue = previous.issueTop5[0]?.label || null;
    input.previousPersonalInfoRate = previous.metrics.personalInfoRate;
    input.previousAttentionRate = previous.metrics.attentionNeededRate;
    input.previousPublicExternalTool = previous.metrics.publicExternalToolCount;
    if (input.scoreDelta == null && snapshot.metrics.avgScore != null && previous.metrics.avgScore != null) {
      input.scoreDelta = roundScore1(
        snapshot.metrics.avgScore - previous.metrics.avgScore,
      );
    }
  }
  return {
    leadParagraphs: buildArticleLead(input),
    bodyParagraphs: buildWeeklyNarrative(input),
    weekOverWeek: buildWeekOverWeek(input),
    platformNarrative: buildPlatformNarrative(input),
    organizationNarrative: buildOrganizationNarrative(input),
    questionNarrative: buildQuestionNarrative(input),
    nextWeekWatch: buildNextWeekWatch(input),
    keywords: buildKeywords(input),
    cardLead: buildCardLead(input),
    pressInterpretation: buildPressInterpretation(input),
  };
}

export function caseSignalLabel(item: WeeklyAnonymousCase): string {
  if (item.signalKind === "related") {
    return `관련 주요 신호: ${item.signalLabel || "개인정보 수집 신호"} ${n(item.similarCount)}건`;
  }
  return `이번 주 유사 신호 ${n(item.similarCount)}건`;
}
