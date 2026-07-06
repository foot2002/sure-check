import type { ScanReport } from "@/lib/types/scan";
import type {
  CollectedDataSummary,
  CopyableTemplate,
  OperatorFix,
} from "@/lib/reporting/reportMessages";
import {
  hasEmployeeSensitiveCombination,
  hasSignificantPersonalDataForCsap,
} from "@/lib/reporting/publicSectorCsap";
import {
  TEMPLATE_BASIC_NOTICE,
  TEMPLATE_DOMESTIC_SAAS,
  TEMPLATE_EMPLOYEE_SURVEY,
  TEMPLATE_EVENT_REWARD,
  TEMPLATE_GOOGLE_FORMS,
  TEMPLATE_PUBLIC_SECTOR,
} from "@/lib/reporting/reportMessages";

function hasMissing(report: ScanReport, pattern: RegExp): boolean {
  return Boolean(
    report.debug?.missingNotices.some(
      (gap) => pattern.test(gap.key) || pattern.test(gap.label),
    ),
  );
}

function hasContext(report: ScanReport, pattern: RegExp): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  const summary = report.debug?.contextSummary ?? "";
  return pattern.test(`${labels} ${summary}`);
}

function hasFreeOpinionQuestion(report: ScanReport): boolean {
  return report.form.questions.some((question) =>
    /자유\s*의견|기타\s*의견|건의|의견|불편\s*사항|개선\s*사항/.test(
      question.label,
    ),
  );
}

function pushUnique(fixes: OperatorFix[], fix: OperatorFix): void {
  if (!fixes.some((item) => item.title === fix.title)) {
    fixes.push(fix);
  }
}

export function buildOperatorActions(
  report: ScanReport,
  summary: CollectedDataSummary,
): {
  operatorSummary: string;
  operatorTopFixes: OperatorFix[];
  requiredFixes: OperatorFix[];
  recommendedFixes: OperatorFix[];
  copyableTemplates: CopyableTemplate[];
} {
  if (report.isLimited || report.form.questions.length === 0) {
    return {
      operatorSummary:
        "문항을 확인하지 못해 운영자 보완사항을 산출하지 않았습니다. 설문 원문 또는 공개 접근 가능한 URL로 다시 진단하세요.",
      operatorTopFixes: [],
      requiredFixes: [],
      recommendedFixes: [],
      copyableTemplates: [],
    };
  }

  const requiredFixes: OperatorFix[] = [];
  const recommendedFixes: OperatorFix[] = [];
  const templates: CopyableTemplate[] = [];
  const hasDirect = summary.directIdentifiers.length > 0;
  const hasSensitive = summary.sensitiveItems.length > 0;
  const hasSignificantPersonalData = hasSignificantPersonalDataForCsap(
    report,
    summary,
  );
  const isPublicSector = Boolean(report.debug?.publicSectorDetected);
  const isEmployee = Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    hasContext(report, /직원|근로|조직진단|employee/i);
  const isEvent = Boolean(report.form.contextHints?.isEvent) ||
    hasContext(report, /경품|이벤트|event/i);
  const isMarketing = Boolean(report.form.contextHints?.isMarketing) ||
    hasContext(report, /마케팅|marketing/i);

  if (hasMissing(report, /collection_purpose|수집.*목적/)) {
    templates.push(TEMPLATE_BASIC_NOTICE);
    pushUnique(requiredFixes, {
      priority: "required",
      category: "basic_notice",
      title: "조사 목적을 개인정보 고지문 형식으로 정리",
      reason: "서비스 개선·통계 분석 목적은 안내되어도 개인정보 고지 형식으로는 보완이 필요할 수 있습니다.",
      action: "조사 목적, 이용 범위, 담당 부서를 설문 첫 화면에 짧게 정리하세요.",
    });
  }

  if (hasMissing(report, /collection_items|수집.*항목/)) {
    templates.push(TEMPLATE_BASIC_NOTICE);
    pushUnique(requiredFixes, {
      priority: "required",
      category: "basic_notice",
      title: "수집 항목을 안내문에 간단히 정리",
      reason: "수집 항목은 문항에서 확인되지만, 안내문에 한 번 더 정리하면 응답자가 이해하기 쉽습니다.",
      action: "예: 이용 횟수, 자녀 연령대, 거주권역, 만족도, 자유의견.",
    });
  }

  if (hasMissing(report, /retention|보유|파기|destruction/)) {
    templates.push(TEMPLATE_BASIC_NOTICE);
    pushUnique(requiredFixes, {
      priority: "required",
      category: "retention_deletion",
      title: "보유기간과 파기 시점을 명시",
      reason: "응답 후 개인정보가 언제까지 보관되는지 확인되지 않습니다.",
      action: "예: 조사 종료 후 3개월 보관 후 지체 없이 파기.",
    });
  }

  if (hasMissing(report, /refusal|거부|불이익/)) {
    templates.push(TEMPLATE_BASIC_NOTICE);
    pushUnique(requiredFixes, {
      priority: "required",
      category: "basic_notice",
      title: "동의 거부권과 불이익 여부 안내",
      reason: "응답자가 동의하지 않을 권리와 제한사항을 알아야 합니다.",
      action: "동의 거부 시 설문 참여 또는 경품 제공 제한 여부를 명확히 쓰세요.",
    });
  }

  if (hasMissing(report, /processor|contact|담당|처리자|문의/)) {
    pushUnique(requiredFixes, {
      priority: "required",
      category: "basic_notice",
      title: "개인정보처리자 또는 담당자 표시",
      reason: "문의할 기관·부서·연락처가 확인되지 않습니다.",
      action: "담당부서, 이메일 또는 전화번호를 설문 안내문에 추가하세요.",
    });
  }

  if (report.platform === "google_forms" && hasDirect) {
    templates.push(TEMPLATE_GOOGLE_FORMS);
    pushUnique(requiredFixes, {
      priority: "required",
      category: "overseas_transfer",
      title: "Google Forms 사용에 따른 국외이전/국외보관 안내",
      reason: "해외 SaaS에서 직접식별정보를 수집하므로 처리 위치와 이전 관련 안내 확인이 필요합니다.",
      action: "국외 이전 국가, 수탁자, 목적, 보유기간, 거부권 안내를 추가하세요.",
    });
  }

  if (report.platform === "naver_forms" || report.platform === "moaform") {
    templates.push(TEMPLATE_DOMESTIC_SAAS);
    pushUnique(recommendedFixes, {
      priority: "recommended",
      category: "outsourcing",
      title: "외부 설문 SaaS 위탁 안내",
      reason: "네이버폼/모아폼 등 외부 도구로 개인정보가 처리될 수 있습니다.",
      action: "수탁자와 위탁업무(설문 시스템 제공·응답 저장)를 안내하세요.",
    });
  }

  if (hasSensitive || summary.highRiskItems.length > 0) {
    pushUnique(requiredFixes, {
      priority: "required",
      category: "sensitive_data",
      title: "민감정보 문항 삭제 또는 별도 동의·접근권한 기준 명시",
      reason: "건강정보, 고충, 괴롭힘 등은 응답자 부담이 큰 정보입니다.",
      action: "민감정보 문항을 삭제하거나 별도 동의·접근권한·보관기간을 명확히 하세요.",
    });
    pushUnique(requiredFixes, {
      priority: "required",
      category: "sensitive_data",
      title: "보안 검증된 수집 도구 사용 검토",
      reason:
        "민감정보 또는 고위험 개인정보를 수집하는 설문은 보안이 검증된 도구와 관리체계가 필요합니다.",
      action:
        "CSAP 인증 도구 또는 보안 검증된 수집 도구 사용 가능성을 검토하세요.",
    });
  }

  if (isPublicSector) {
    templates.push(TEMPLATE_PUBLIC_SECTOR);
    if (hasSignificantPersonalData) {
      pushUnique(requiredFixes, {
        priority: "required",
        category: "public_sector",
        title: "CSAP 인증 등 공공부문 보안 기준 도구 사용 검토",
        reason:
          "공공기관 또는 공공부문 설문에서 개인정보를 수집하는 경우, 보안이 검증된 설문 도구 사용을 우선 검토해야 합니다.",
        action:
          "CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용 가능성을 검토하고 안내하세요.",
      });
    }
    pushUnique(recommendedFixes, {
      priority: "recommended",
      category: "public_sector",
      title: "공공기관 외부 설문 도구 관리통제 확인",
      reason: "공공기관 또는 출자·출연기관이 외부 SaaS를 쓰는 경우 위탁, 기관 계정, 보유·파기, 보안검증 확인이 필요합니다.",
      action: "기관 공식 계정 사용, 접근권한, CSAP 또는 공공 보안검증 도구 사용 가능성을 검토하세요.",
    });
  }

  if ((hasDirect || hasSensitive || summary.highRiskItems.length > 0) && !isPublicSector) {
    pushUnique(requiredFixes, {
      priority: "required",
      category: "outsourcing",
      title: "보안 인증 수집도구 또는 관리체계가 확인된 수행기관 이용 검토",
      reason:
        "민간 기업 또는 조사 수행기관이 개인정보를 처리하는 경우, 범용 설문도구보다 보안성과 관리체계가 확인된 방식을 우선 검토하는 것이 안전합니다.",
      action:
        "보안 인증 수집도구, CSAP 인증 도구, ISMS-P 인증 수행기관 이용 가능성을 검토하고 안내하세요.",
    });
    pushUnique(requiredFixes, {
      priority: "required",
      category: "outsourcing",
      title: "ISMS-P 등 개인정보보호 관리체계 인증 여부 안내",
      reason:
        "민간 기업 또는 조사 수행기관이 개인정보를 처리하는 경우, 관리체계 인증 여부 확인이 중요합니다.",
      action:
        "개인정보보호 관리체계(ISMS-P 등) 인증 여부와 수행기관 정보를 안내하세요.",
    });
  }

  if (
    !isPublicSector &&
    (hasSensitive || summary.highRiskItems.length > 0 || hasEmployeeSensitiveCombination(report))
  ) {
    pushUnique(requiredFixes, {
      priority: "required",
      category: "sensitive_data",
      title: "CSAP 인증 도구, ISMS-P 인증 수행기관, 보안 인증 수집도구 사용 우선 검토",
      reason:
        "민감정보와 고위험 개인정보는 범용 설문도구보다 검증된 보안 환경에서 수집하는 것이 안전합니다.",
      action:
        "CSAP 인증 도구, ISMS-P 인증 수행기관, 보안 인증 수집도구 사용을 우선 검토하세요.",
    });
    pushUnique(requiredFixes, {
      priority: "required",
      category: "sensitive_data",
      title: "원자료 관리 기준 명시",
      reason:
        "민감정보 설문은 다운로드, 열람권한, 보관기간, 파기담당자, 내부 공유 제한 기준 안내가 필요합니다.",
      action:
        "다운로드, 열람권한, 보관기간, 파기담당자, 내부 공유 제한 기준을 안내하세요.",
    });
  }

  if (isEmployee) {
    templates.push(TEMPLATE_EMPLOYEE_SURVEY);
    pushUnique(requiredFixes, {
      priority: "required",
      category: "employee_survey",
      title: "직원 설문 익명성·원자료 제공 범위 명시",
      reason: "조직진단·고충 설문은 응답자가 인사상 불이익을 우려할 수 있습니다.",
      action: "개인별 원자료 제공 금지, 통계 집계 기준, 소수집단 비공개 기준, 불이익 없음 안내를 추가하세요.",
    });
  }

  if (isEvent) {
    templates.push(TEMPLATE_EVENT_REWARD);
    pushUnique(recommendedFixes, {
      priority: "recommended",
      category: "event_reward",
      title: "경품 정보와 설문 응답 분리",
      reason: "경품 발송 연락처와 설문 응답을 함께 관리하면 식별 가능성이 커집니다.",
      action: "당첨자 연락처는 별도 폼 또는 별도 시트로 분리하고 발송 후 파기하세요.",
    });
  }

  if (isMarketing) {
    pushUnique(recommendedFixes, {
      priority: "recommended",
      category: "marketing",
      title: "마케팅 활용은 선택 동의로 분리",
      reason: "조사 목적과 홍보 목적은 응답자가 구분해서 선택할 수 있어야 합니다.",
      action: "마케팅 수신 동의와 철회 방법을 별도 항목으로 표시하세요.",
    });
  }

  if (hasFreeOpinionQuestion(report)) {
    pushUnique(recommendedFixes, {
      priority: "recommended",
      category: "basic_notice",
      title: "자유의견 개인정보 입력 주의문 추가",
      reason: "자유응답에는 응답자가 의도치 않게 이름, 연락처, 주소, 민감한 개인 사정 등을 쓸 수 있습니다.",
      action: "자유의견 문항 앞에 개인정보를 입력하지 말라는 안내를 추가하세요.",
    });
  }

  if (report.form.contextHints?.claimsAnonymous && hasDirect) {
    pushUnique(requiredFixes, {
      priority: "required",
      category: "anonymity",
      title: "익명 설문 문구와 식별 문항 정합성 보완",
      reason: "익명이라고 안내하면서 이름·연락처를 받으면 응답자가 오해할 수 있습니다.",
      action: "식별 문항을 삭제하거나 익명이 아님을 명확히 고지하세요.",
    });
  }

  if (requiredFixes.length === 0) {
    pushUnique(recommendedFixes, {
      priority: "recommended",
      category: "basic_notice",
      title: "기본 고지문 가독성 점검",
      reason: "필수 항목이 대체로 확인되더라도 응답자가 쉽게 이해할 수 있어야 합니다.",
      action: "목적, 항목, 보유기간, 담당자를 설문 시작 부분에 짧게 요약하세요.",
    });
  }

  const operatorSummary =
    requiredFixes.length > 0
      ? `필수 보완 ${requiredFixes.length}건, 권장 보완 ${recommendedFixes.length}건이 있습니다.`
      : `필수 보완은 크지 않으며, 권장 보완 ${recommendedFixes.length}건을 확인하세요.`;

  return {
    operatorSummary,
    operatorTopFixes: buildOperatorTopFixes(report, summary, requiredFixes, recommendedFixes),
    requiredFixes,
    recommendedFixes,
    copyableTemplates: [
      ...new Map(templates.map((template) => [template.title, template])).values(),
    ],
  };
}

function buildOperatorTopFixes(
  report: ScanReport,
  summary: CollectedDataSummary,
  requiredFixes: OperatorFix[],
  recommendedFixes: OperatorFix[],
): OperatorFix[] {
  const all = [...requiredFixes, ...recommendedFixes];
  const hasDirect = summary.directIdentifiers.length > 0;
  const hasSignificantPersonalData = hasSignificantPersonalDataForCsap(
    report,
    summary,
  );
  const hasSensitiveOrHighRisk =
    summary.sensitiveItems.length > 0 || summary.highRiskItems.length > 0;
  const isPublicSector = Boolean(report.debug?.publicSectorDetected);
  const isEmployee = Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    hasContext(report, /직원|근로|조직진단|employee/i);

  const priorities: RegExp[] = [];

  if (hasSensitiveOrHighRisk) {
    priorities.push(/민감정보 문항|별도 동의·접근권한/);
    priorities.push(/보안 검증된 수집 도구|CSAP 인증 도구/);
    priorities.push(/ISMS-P|관리체계 인증/);
  }

  if (isPublicSector && hasSignificantPersonalData) {
    priorities.push(/CSAP 인증|공공부문 보안 기준/);
  }
  if (!isPublicSector && hasSignificantPersonalData) {
    priorities.push(/보안 인증 수집도구|관리체계가 확인된 수행기관/);
    priorities.push(/CSAP 인증 도구, ISMS-P|보안 인증 수집도구 사용 우선/);
    priorities.push(/ISMS-P|관리체계 인증/);
  }
  if (isEmployee) {
    priorities.push(/원자료|익명성|직원 설문/);
  }
  if (report.platform === "google_forms" && hasDirect) {
    priorities.push(/Google Forms|국외이전|국외보관/);
  }
  if (report.platform === "naver_forms" || report.platform === "moaform") {
    priorities.push(/외부 설문 SaaS|위탁 안내/);
  }

  priorities.push(
    /보유기간|파기/,
    /개인정보처리자|담당자|문의/,
    /수집 항목/,
    /민감정보/,
    /자유의견/,
    /경품 정보와 설문 응답 분리/,
  );

  const selected: OperatorFix[] = [];
  for (const pattern of priorities) {
    const hit = all.find(
      (fix) =>
        !selected.some((item) => item.title === fix.title) &&
        pattern.test(`${fix.title} ${fix.reason} ${fix.action}`),
    );
    if (hit) selected.push(hit);
    if (selected.length >= 3) return selected;
  }

  for (const fix of all) {
    if (!selected.some((item) => item.title === fix.title)) {
      selected.push(fix);
    }
    if (selected.length >= 3) break;
  }

  return selected;
}
