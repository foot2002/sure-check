import type { WeeklyInsight } from "@/lib/weekly/types";

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
  const rate = personalInfoCount / analyzable;
  if (rate >= 0.85) {
    const perTen =
      rate >= 1 ? 10 : Math.max(1, Math.min(9, Math.floor(rate * 10)));
    return `공개 온라인 설문 10건 중 ${perTen}건에서 개인정보 수집 신호 확인`;
  }
  return `공개 온라인 설문 ${analyzable}건 중 ${personalInfoCount}건에서 개인정보 수집 신호 확인`;
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
    `- 이번 주 분석 완료 설문 ${input.analyzable}건 중 ${input.personalInfoCount}건에서 개인정보 수집 신호가 확인되었습니다.`,
    `- ${input.attentionNeededCount}건은 응답자 관점에서 주의 또는 추가 확인이 필요한 설문으로 분류되었습니다.`,
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
