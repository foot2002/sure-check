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

function cap(input: CaseInput, value: number): number {
  return Math.min(input.analyzableCount, Math.max(value, 0));
}

function gapList(input: CaseInput, extra: string[]): string[] {
  const base =
    input.noticeGaps.length > 0
      ? input.noticeGaps.slice(0, 4)
      : ["수집 목적 안내", "보유기간 안내", "파기 기준 안내", "담당자 연락처"];
  return [...new Set([...extra, ...base])].slice(0, 5);
}

function collected(
  input: CaseInput,
  items: Array<"이름" | "연락처" | "소속" | "이메일" | "건강 관련 정보">,
): string[] {
  return items.filter((item) => {
    if (item === "이름") return input.nameCount > 0;
    if (item === "연락처") return input.phoneCount > 0;
    if (item === "소속") return input.affiliationCount > 0;
    if (item === "이메일") return input.emailCount > 0;
    return true;
  });
}

export function enrichAnonymousCase(
  row: WeeklyAnonymousCase,
): WeeklyAnonymousCase {
  if (row.whyRisky && row.respondentBlindSpot && row.quickFixNotice) {
    return row;
  }
  const filled = CASE_BY_ID[row.id];
  if (!filled) {
    return {
      ...row,
      whyRisky:
        row.whyRisky ||
        "공개 화면에서 수집 목적과 보관·파기 기준을 확인하기 어려우면 응답자가 제공 여부를 판단하기 어렵습니다.",
      respondentBlindSpot:
        row.respondentBlindSpot ||
        row.respondentRisk ||
        "정보가 언제까지 보관되고 누구에게 문의해야 하는지 확인하기 어렵습니다.",
      operatorMissed: row.operatorMissed || row.noticeGaps,
      quickFixNotice:
        row.quickFixNotice ||
        "본 설문은 안내 목적에 필요한 범위에서만 개인정보를 수집하며, 목적 달성 후 정해진 기간 내 파기합니다. 문의는 담당부서로 안내합니다.",
      weakNoticeExample:
        row.weakNoticeExample || "이름, 연락처, 소속을 입력해 주세요.",
      improvedNoticeExample:
        row.improvedNoticeExample ||
        "본 설문은 안내 발송을 위해 이름, 연락처, 소속을 수집합니다. 수집된 정보는 목적 달성 후 30일 이내 파기하며, 문의는 담당부서로 연락해 주시기 바랍니다.",
    };
  }
  return {
    ...filled,
    ...row,
    whyRisky: row.whyRisky || filled.whyRisky,
    respondentBlindSpot: row.respondentBlindSpot || filled.respondentBlindSpot,
    operatorMissed:
      row.operatorMissed?.length ? row.operatorMissed : filled.operatorMissed,
    quickFixNotice: row.quickFixNotice || filled.quickFixNotice,
    weakNoticeExample: row.weakNoticeExample || filled.weakNoticeExample,
    improvedNoticeExample:
      row.improvedNoticeExample || filled.improvedNoticeExample,
  };
}

const CASE_BY_ID: Record<string, WeeklyAnonymousCase> = {
  "event-application": {
    id: "event-application",
    title: "행사·프로그램 참가신청서형",
    orgType: "공공·민간 혼재",
    surveyPattern: "참가신청·접수",
    tool: "외부 설문도구",
    collectedInfo: [],
    noticeGaps: [],
    similarCount: 0,
    respondentRisk:
      "이름과 연락처가 행사 종료 후에도 보관되는지, 삭제 요청은 어디에 해야 하는지 확인하기 어렵습니다.",
    operatorFix:
      "수집 목적, 보유기간, 파기 기준, 담당자 연락처, 외부도구 처리경로를 첫 화면에 안내해야 합니다.",
    whyRisky:
      "참가 안내를 위해 연락처가 필요할 수 있지만, 설문 화면에서 정보가 언제까지 보관되고 누가 관리하는지 확인하기 어려우면 응답자가 제공 여부를 판단하기 어렵습니다.",
    respondentBlindSpot:
      "이름과 연락처가 행사 종료 후에도 보관되는지, 삭제 요청은 어디에 해야 하는지 확인하기 어렵습니다.",
    operatorMissed: [
      "수집 목적",
      "보유기간",
      "파기 기준",
      "담당자 연락처",
      "외부도구 처리경로",
    ],
    quickFixNotice:
      "본 설문은 행사 참가자 확인과 안내 발송을 위해 이름, 연락처, 소속을 수집합니다. 수집된 정보는 행사 종료 후 30일 이내 파기하며, 문의는 담당부서 연락처로 안내합니다.",
    weakNoticeExample: "행사 신청을 위해 이름, 연락처, 소속을 입력해 주세요.",
    improvedNoticeExample:
      "본 설문은 행사 참가자 확인 및 안내 발송을 위해 이름, 연락처, 소속을 수집합니다. 수집된 정보는 행사 종료 후 30일 이내 파기하며, 문의는 담당부서로 연락해 주시기 바랍니다.",
  },
  "school-program": {
    id: "school-program",
    title: "학교·교육프로그램 신청형",
    orgType: "학교/교육기관",
    surveyPattern: "교육·프로그램 신청",
    tool: "외부 설문도구",
    collectedInfo: [],
    noticeGaps: [],
    similarCount: 0,
    respondentRisk:
      "학생·보호자 정보가 포함될 수 있는데, 수집 목적과 동의 안내가 불분명할 수 있습니다.",
    operatorFix:
      "수집 목적과 보호자 동의 안내를 설문 첫 화면에 구체적으로 적어야 합니다.",
    whyRisky:
      "학생·보호자 연락처가 교육 안내에 쓰일 수 있지만, 목적과 동의 안내가 없으면 제공 범위를 확인하기 어렵습니다.",
    respondentBlindSpot:
      "보호자 동의가 필요한지, 정보가 교육 목적 외에 쓰이는지 화면에서 확인하기 어렵습니다.",
    operatorMissed: ["수집 목적", "동의 안내", "보유기간", "담당자 연락처"],
    quickFixNotice:
      "본 설문은 교육프로그램 안내를 위해 이름과 연락처를 수집합니다. 보호자 정보가 포함될 수 있으며, 목적 달성 후 학기 종료 시 파기합니다. 문의는 담당 교무·행정 창구로 안내합니다.",
    weakNoticeExample: "프로그램 신청을 위해 이름과 연락처를 적어 주세요.",
    improvedNoticeExample:
      "본 설문은 교육프로그램 참가자 확인과 안내를 위해 이름, 연락처, 소속을 수집합니다. 수집된 정보는 해당 프로그램 종료 후 파기하며, 문의는 담당 부서로 연락해 주시기 바랍니다.",
  },
  satisfaction: {
    id: "satisfaction",
    title: "만족도 조사형",
    orgType: "확인 불가 포함",
    surveyPattern: "만족도·의견 조사",
    tool: "외부 설문도구",
    collectedInfo: [],
    noticeGaps: [],
    similarCount: 0,
    respondentRisk:
      "의견 조사처럼 보여도 연락처가 함께 수집되면 보관·파기 기준을 알기 어렵습니다.",
    operatorFix:
      "만족도 조사라도 개인정보를 받으면 보유기간과 파기 기준을 안내해야 합니다.",
    whyRisky:
      "의견 조사처럼 보여도 연락처가 함께 수집되면, 응답자는 의견만 남기는 것인지 개인정보가 계속 보관되는 것인지 구분하기 어렵습니다.",
    respondentBlindSpot:
      "연락처가 통계 목적에만 쓰이는지, 추후 연락·홍보에 쓰이는지 화면에서 확인하기 어렵습니다.",
    operatorMissed: ["보유기간", "파기 기준", "수집 목적", "담당자 연락처"],
    quickFixNotice:
      "본 설문은 서비스 개선을 위한 의견 수렴 목적이며, 연락처는 추가 확인이 필요한 경우에만 사용합니다. 수집된 정보는 조사 종료 후 90일 이내 파기합니다.",
    weakNoticeExample: "의견을 남겨 주세요. 연락처를 함께 적어 주시면 됩니다.",
    improvedNoticeExample:
      "본 설문은 만족도 조사 목적이며, 선택적으로 연락처를 받을 수 있습니다. 연락처는 추가 확인이 필요한 경우에만 사용하고 조사 종료 후 90일 이내 파기합니다. 문의는 담당부서로 안내합니다.",
  },
  "event-prize": {
    id: "event-prize",
    title: "경품·이벤트 응모형",
    orgType: "민간기업·단체",
    surveyPattern: "이벤트·응모",
    tool: "외부 설문도구",
    collectedInfo: [],
    noticeGaps: [],
    similarCount: 0,
    respondentRisk:
      "당첨 안내에 필요하다는 이유로 연락처가 수집되지만, 이후 이용 범위를 알기 어렵습니다.",
    operatorFix:
      "경품 안내 목적과 보유기간, 담당자 연락처를 응모 화면에 함께 표시해야 합니다.",
    whyRisky:
      "당첨 안내에 필요하다는 이유로 연락처가 수집되지만, 이후 마케팅 등에 쓰이는지 화면에서 확인하기 어려우면 제공 범위를 판단하기 어렵습니다.",
    respondentBlindSpot:
      "당첨자 발표 이후 연락처가 얼마나 보관되고, 경품 안내 외에 쓰이는지 알기 어렵습니다.",
    operatorMissed: ["수집 목적", "보유기간", "담당자 연락처", "이용 범위"],
    quickFixNotice:
      "본 설문은 경품 당첨자 확인과 안내 발송을 위해 이름, 연락처, 이메일을 수집합니다. 수집된 정보는 발표 후 30일 이내 파기하며, 문의는 담당부서로 안내합니다.",
    weakNoticeExample: "당첨 안내를 위해 이름, 연락처, 이메일을 입력해 주세요.",
    improvedNoticeExample:
      "본 설문은 경품 당첨자 확인 및 안내 발송을 위해 이름, 연락처, 이메일을 수집합니다. 수집된 정보는 발표 후 30일 이내 파기하며, 문의는 담당부서로 연락해 주시기 바랍니다.",
  },
  "counseling-health": {
    id: "counseling-health",
    title: "상담·민원·건강정보 수집형",
    orgType: "공공·민간",
    surveyPattern: "상담·민원·건강 관련 조사",
    tool: "외부 설문도구",
    collectedInfo: [],
    noticeGaps: [],
    similarCount: 0,
    respondentRisk:
      "건강·민원 정보가 포함될 수 있어, 목적과 동의 안내가 없으면 제공 여부를 판단하기 어렵습니다.",
    operatorFix:
      "민감정보가 포함될 수 있으면 수집 목적과 동의 안내를 더 구체적으로 적어야 합니다.",
    whyRisky:
      "건강·민원 정보가 포함될 수 있어, 목적과 동의 안내가 없으면 꼭 필요한 정보인지 판단하기 어렵습니다.",
    respondentBlindSpot:
      "건강 관련 문항이 왜 필요한지, 누가 열람하고 언제까지 보관하는지 확인하기 어렵습니다.",
    operatorMissed: ["수집 목적", "동의 안내", "보유기간", "담당자 연락처"],
    quickFixNotice:
      "본 설문은 상담·민원 처리에 필요한 범위에서만 정보를 수집합니다. 건강 관련 문항이 포함될 수 있으며, 목적 달성 후 정해진 기간 내 파기합니다. 문의는 담당부서로 안내합니다.",
    weakNoticeExample: "상담을 위해 증상과 연락처를 적어 주세요.",
    improvedNoticeExample:
      "본 설문은 상담 접수에 필요한 범위에서 연락처와 관련 정보를 수집합니다. 건강 관련 문항이 포함될 수 있으며, 목적 달성 후 파기합니다. 문의는 담당부서로 연락해 주시기 바랍니다.",
  },
  "public-external-tool": {
    id: "public-external-tool",
    title: "공공기관 외부 설문도구 사용형",
    orgType: "공공기관",
    surveyPattern: "신청·조사·의견수렴",
    tool: "외부 설문도구",
    collectedInfo: [],
    noticeGaps: [],
    similarCount: 0,
    respondentRisk:
      "공공 서비스로 보이지만 외부 도구로 정보가 처리될 수 있는지 화면에서 알기 어렵습니다.",
    operatorFix:
      "외부 설문도구 사용 여부와 처리경로, 보안 기준 확인 사항을 안내해야 합니다.",
    whyRisky:
      "공공기관 설문은 국민이 기관 신뢰를 전제로 응답하는 경우가 많습니다. 외부 설문도구를 사용할 때 개인정보가 어떤 처리경로로 관리되는지 안내가 부족하면 응답자는 보안과 관리 책임을 확인하기 어렵습니다.",
    respondentBlindSpot:
      "정보가 공공기관 내부에서만 처리되는지, 외부 도구를 거치는지, 보안 기준은 무엇인지 화면에서 확인하기 어렵습니다.",
    operatorMissed: [
      "외부 설문도구 사용",
      "처리경로",
      "공공부문 클라우드 보안 기준",
      "담당자 연락처",
    ],
    quickFixNotice:
      "본 설문은 외부 설문도구를 이용해 운영되며, 수집된 개인정보는 설문 목적 달성 후 정해진 기간 내 파기됩니다. 개인정보 처리 및 보안 기준 관련 문의는 담당부서로 연락해 주시기 바랍니다.",
    weakNoticeExample: "신청을 위해 이름, 연락처, 소속을 입력해 주세요.",
    improvedNoticeExample:
      "본 설문은 외부 설문도구를 이용해 운영됩니다. 이름, 연락처, 소속은 신청 처리 목적으로만 수집하며, 목적 달성 후 파기합니다. 처리경로와 보안 기준 문의는 담당부서로 안내합니다.",
  },
};

export function buildAnonymousCases(input: CaseInput): WeeklyAnonymousCase[] {
  const cases: WeeklyAnonymousCase[] = [];
  const tool = input.topTool || "외부 설문도구";

  if (input.personalInfoCount > 0 && (input.nameCount > 0 || input.phoneCount > 0)) {
    const gaps = gapList(input, ["수집 목적 안내", "보유기간 안내"]);
    cases.push(
      enrichAnonymousCase({
        ...CASE_BY_ID["event-application"],
        tool,
        collectedInfo: collected(input, ["이름", "연락처", "소속", "이메일"]),
        noticeGaps: gaps,
        similarCount: cap(input, Math.max(input.personalInfoCount, 1)),
      }),
    );
  }

  if (input.schoolCount > 0) {
    cases.push(
      enrichAnonymousCase({
        ...CASE_BY_ID["school-program"],
        tool,
        collectedInfo: collected(input, ["이름", "연락처", "소속"]).slice(
          0,
          input.affiliationCount > 0 ? 3 : 2,
        ),
        noticeGaps: gapList(input, ["수집 목적 안내", "동의 안내"]),
        similarCount: cap(input, input.schoolCount),
      }),
    );
  }

  if (input.personalInfoCount > 0) {
    cases.push(
      enrichAnonymousCase({
        ...CASE_BY_ID.satisfaction,
        tool,
        collectedInfo: collected(input, ["연락처", "이메일", "소속"]).slice(0, 2),
        noticeGaps: gapList(input, ["보유기간 안내", "파기 기준 안내"]),
        similarCount: cap(input, Math.max(1, input.emailCount)),
      }),
    );
  }

  if (input.nameCount > 0 && input.phoneCount > 0 && input.emailCount > 0) {
    cases.push(
      enrichAnonymousCase({
        ...CASE_BY_ID["event-prize"],
        tool,
        collectedInfo: ["이름", "연락처", "이메일"],
        noticeGaps: gapList(input, ["수집 목적 안내", "담당자 연락처"]),
        similarCount: cap(
          input,
          Math.min(input.nameCount, input.phoneCount, input.emailCount),
        ),
      }),
    );
  }

  if (input.sensitiveCount > 0 || input.highRiskCount > 0 || input.medicalCount > 0) {
    cases.push(
      enrichAnonymousCase({
        ...CASE_BY_ID["counseling-health"],
        orgType: input.medicalCount > 0 ? "의료기관" : "공공·민간",
        tool,
        collectedInfo: ["이름", "연락처", "건강 관련 정보"],
        noticeGaps: gapList(input, ["수집 목적 안내", "동의 안내"]),
        similarCount: cap(
          input,
          Math.max(input.sensitiveCount, input.highRiskCount, input.medicalCount, 1),
        ),
      }),
    );
  }

  if (input.publicExternalToolCount > 0 || input.publicCount > 0) {
    cases.push(
      enrichAnonymousCase({
        ...CASE_BY_ID["public-external-tool"],
        tool,
        collectedInfo: collected(input, ["이름", "연락처", "소속"]),
        noticeGaps: gapList(input, [
          "외부 설문도구·처리경로",
          "공공부문 클라우드 보안 기준",
        ]),
        similarCount: cap(
          input,
          Math.max(input.publicExternalToolCount, input.publicCount, 1),
        ),
      }),
    );
  }

  return cases
    .filter((row) => row.similarCount > 0 && row.collectedInfo.length > 0)
    .sort((a, b) => b.similarCount - a.similarCount)
    .slice(0, 5);
}
