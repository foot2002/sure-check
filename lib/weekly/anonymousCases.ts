import type { WeeklyAnonymousCase } from "@/lib/weekly/types";

type CaseInput = {
  schoolCount: number;
  publicCount: number;
  medicalCount: number;
  personalInfoCount: number;
  sensitiveCount: number;
  highRiskCount: number;
  publicExternalToolCount: number;
  nameCount: number;
  phoneCount: number;
  emailCount: number;
  affiliationCount: number;
  analyzableCount: number;
  noticeGaps: string[];
  topTool: string;
};

function gapList(input: CaseInput, extra: string[]): string[] {
  const base =
    input.noticeGaps.length > 0
      ? input.noticeGaps.slice(0, 4)
      : ["수집 목적 안내", "보유기간 안내", "파기 기준 안내", "담당자 연락처"];
  return [...new Set([...extra, ...base])].slice(0, 5);
}

export function buildAnonymousCases(input: CaseInput): WeeklyAnonymousCase[] {
  const cases: WeeklyAnonymousCase[] = [];
  const tool = input.topTool || "외부 설문도구";

  if (input.personalInfoCount > 0 && (input.nameCount > 0 || input.phoneCount > 0)) {
    cases.push({
      id: "event-application",
      title: "행사·프로그램 참가신청서형",
      orgType: "공공·민간 혼재",
      surveyPattern: "참가신청·접수",
      tool,
      collectedInfo: ["이름", "연락처", "소속", "이메일"].filter((item) => {
        if (item === "이름") return input.nameCount > 0;
        if (item === "연락처") return input.phoneCount > 0;
        if (item === "소속") return input.affiliationCount > 0;
        if (item === "이메일") return input.emailCount > 0;
        return true;
      }),
      noticeGaps: gapList(input, ["수집 목적 안내", "보유기간 안내"]),
      respondentRisk:
        "내 정보가 언제까지 보관되고 누가 관리하는지 알기 어렵습니다.",
      operatorFix:
        "설문 첫 화면에 개인정보 수집·이용 안내문을 명확히 표시해야 합니다.",
      similarCount: Math.max(input.personalInfoCount, 1),
    });
  }

  if (input.schoolCount > 0) {
    cases.push({
      id: "school-program",
      title: "학교·교육프로그램 신청형",
      orgType: "학교/교육기관",
      surveyPattern: "교육·프로그램 신청",
      tool,
      collectedInfo: ["이름", "연락처", "소속"].slice(
        0,
        input.affiliationCount > 0 ? 3 : 2,
      ),
      noticeGaps: gapList(input, ["수집 목적 안내", "동의 안내"]),
      respondentRisk:
        "학생·보호자 정보가 포함될 수 있는데, 수집 목적과 동의 안내가 불분명할 수 있습니다.",
      operatorFix:
        "수집 목적과 보호자 동의 안내를 설문 첫 화면에 구체적으로 적어야 합니다.",
      similarCount: input.schoolCount,
    });
  }

  if (input.personalInfoCount > 0) {
    cases.push({
      id: "satisfaction",
      title: "만족도 조사형",
      orgType: "확인 불가 포함",
      surveyPattern: "만족도·의견 조사",
      tool,
      collectedInfo: ["연락처", "이메일", "소속"].filter((_, i) => i < 2),
      noticeGaps: gapList(input, ["보유기간 안내", "파기 기준 안내"]),
      respondentRisk:
        "의견 조사처럼 보여도 연락처가 함께 수집되면 보관·파기 기준을 알기 어렵습니다.",
      operatorFix:
        "만족도 조사라도 개인정보를 받으면 보유기간과 파기 기준을 안내해야 합니다.",
      similarCount: Math.max(1, Math.round(input.personalInfoCount * 0.4)),
    });
  }

  if (input.nameCount > 0 && input.phoneCount > 0 && input.emailCount > 0) {
    cases.push({
      id: "event-prize",
      title: "경품·이벤트 응모형",
      orgType: "민간기업·단체",
      surveyPattern: "이벤트·응모",
      tool,
      collectedInfo: ["이름", "연락처", "이메일"],
      noticeGaps: gapList(input, ["수집 목적 안내", "담당자 연락처"]),
      respondentRisk:
        "당첨 안내에 필요하다는 이유로 연락처가 수집되지만, 이후 이용 범위를 알기 어렵습니다.",
      operatorFix:
        "경품 안내 목적과 보유기간, 담당자 연락처를 응모 화면에 함께 표시해야 합니다.",
      similarCount: Math.max(1, Math.round(input.personalInfoCount * 0.25)),
    });
  }

  if (input.sensitiveCount > 0 || input.highRiskCount > 0 || input.medicalCount > 0) {
    cases.push({
      id: "counseling-health",
      title: "상담·민원·건강정보 수집형",
      orgType: input.medicalCount > 0 ? "의료기관" : "공공·민간",
      surveyPattern: "상담·민원·건강 관련 조사",
      tool,
      collectedInfo: ["이름", "연락처", "건강 관련 정보"],
      noticeGaps: gapList(input, ["수집 목적 안내", "동의 안내"]),
      respondentRisk:
        "건강·민원 정보가 포함될 수 있어, 목적과 동의 안내가 없으면 제공 여부를 판단하기 어렵습니다.",
      operatorFix:
        "민감정보가 포함될 수 있으면 수집 목적과 동의 안내를 더 구체적으로 적어야 합니다.",
      similarCount: Math.max(input.sensitiveCount + input.highRiskCount, input.medicalCount, 1),
    });
  }

  if (input.publicExternalToolCount > 0 || input.publicCount > 0) {
    cases.push({
      id: "public-external-tool",
      title: "공공기관 외부 설문도구 사용형",
      orgType: "공공기관",
      surveyPattern: "신청·조사·의견수렴",
      tool,
      collectedInfo: ["이름", "연락처", "소속"],
      noticeGaps: gapList(input, [
        "외부 설문도구·처리경로",
        "공공부문 클라우드 보안 기준",
      ]),
      respondentRisk:
        "공공 서비스로 보이지만 외부 도구로 정보가 처리될 수 있는지 화면에서 알기 어렵습니다.",
      operatorFix:
        "외부 설문도구 사용 여부와 처리경로, 보안 기준 확인 사항을 안내해야 합니다.",
      similarCount: Math.max(input.publicExternalToolCount, input.publicCount, 1),
    });
  }

  const ranked = cases
    .filter((row) => row.similarCount > 0 && row.collectedInfo.length > 0)
    .sort((a, b) => b.similarCount - a.similarCount)
    .slice(0, 5);

  return ranked;
}
