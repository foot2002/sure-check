import type { ScanReport } from "@/lib/types/scan";
import type {
  CollectedDataSummary,
  CopyableTemplate,
  OperatorFix,
  PrivacyDataType,
} from "@/lib/reporting/reportMessages";
import { classifyPrivacyDataType, missingNoticeLabels } from "@/lib/reporting/respondentDecision";
import {
  classifySurveySubject,
  type SurveySubjectType,
} from "@/lib/reporting/safetyType";
import { hasEmployeeSensitiveCombination } from "@/lib/reporting/publicSectorCsap";
import {
  buildCoreOperatorProblems,
  type CoreOperatorProblemsResult,
} from "@/lib/reporting/buildCoreOperatorProblems";
import {
  LEGAL_BASIS_REGISTRY,
  type LegalBasisEntry,
  type LegalBasisId,
} from "@/lib/reporting/legalBasisRegistry";

export interface OperatorImprovementItem {
  id: string;
  title: string;
  detail: string;
}

export interface CertificationExplainCard {
  id: "csap" | "isms_p" | "secure_collection_tool";
  title: string;
  description: string;
  note: string;
  disclaimer: string;
}

export interface OperatorToolImprovement {
  showStrongCertification: boolean;
  summary: string;
  platformNotes: string[];
  certificationCards: CertificationExplainCard[];
}

export interface OperatorImprovementReport {
  topFixes: OperatorFix[];
  tool: OperatorToolImprovement;
  noticeItems: OperatorImprovementItem[];
  questionItems: OperatorImprovementItem[];
  managementItems: OperatorImprovementItem[];
  templates: CopyableTemplate[];
  coreProblems: CoreOperatorProblemsResult;
  legalBasisDetails: LegalBasisEntry[];
}

const CSAP_CARD: CertificationExplainCard = {
  id: "csap",
  title: "CSAP 인증 도구",
  description:
    "CSAP는 Cloud Security Assurance Program의 약자로, 클라우드 서비스가 공공부문에서 요구하는 보안 기준을 충족하는지 평가하는 인증 제도입니다.",
  note: "공공기관의 개인정보 수집 도구 선택 시 중요한 기준이며, 민간기업도 개인정보 수집 도구의 보안성을 판단할 때 참고할 수 있습니다.",
  disclaimer:
    "CSAP 인증이 있더라도 개인정보 수집 목적, 항목, 보유기간, 파기 기준, 동의 거부권, 담당자 안내는 별도로 충족해야 합니다.",
};

const ISMS_P_CARD: CertificationExplainCard = {
  id: "isms_p",
  title: "ISMS-P 인증 수행기관",
  description:
    "ISMS-P는 정보보호 및 개인정보보호 관리체계 인증입니다. 기업이나 기관이 개인정보를 안전하게 관리하기 위한 조직적·기술적·관리적 보호체계를 갖추고 있는지 확인하는 인증입니다.",
  note: "민간기업이나 조사 수행사가 개인정보를 대신 수집·분석하는 경우, 원자료 접근, 보관, 파기, 내부통제 수준을 판단하는 기준이 될 수 있습니다.",
  disclaimer:
    "ISMS-P 인증이 있어도 해당 설문의 고지·동의·보유·파기 안내는 별도로 확인해야 합니다.",
};

const SECURE_TOOL_CARD: CertificationExplainCard = {
  id: "secure_collection_tool",
  title: "보안인증 수집도구",
  description:
    "보안인증 수집도구는 개인정보 수집, 저장, 접근통제, 다운로드 관리, 파기, 로그 관리 등 개인정보 처리 과정의 보안 기능이 검증된 설문·신청·접수 도구를 의미합니다.",
  note: "범용 설문도구는 빠르게 설문을 만들 수 있지만, 개인정보 수집·보관·파기·접근권한 관리가 충분하지 않으면 위험이 커질 수 있습니다.",
  disclaimer:
    "보안인증 도구 사용은 권고 기준이며, 문항 설계와 고지 의무를 대체하지 않습니다.",
};

function isPublicLike(subject: SurveySubjectType): boolean {
  return (
    subject === "public_agency" ||
    subject === "public_commissioned_private" ||
    subject === "school_local"
  );
}

function hasFreeOpinion(report: ScanReport): boolean {
  return report.form.questions.some((q) =>
    /자유\s*의견|기타\s*의견|건의|의견|개선\s*사항/.test(q.label),
  );
}

function hasMissing(report: ScanReport, pattern: RegExp): boolean {
  return missingNoticeLabels(report).some((label) => pattern.test(label));
}

function buildToolImprovement(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType: PrivacyDataType,
  subject: SurveySubjectType,
): OperatorToolImprovement {
  const hasPii =
    privacyType === "direct_identifier" || privacyType === "sensitive_or_high_risk";
  const publicLike = isPublicLike(subject);
  const platformNotes: string[] = [];
  const cards: CertificationExplainCard[] = [];

  if (privacyType === "minimal" || privacyType === "limited") {
    return {
      showStrongCertification: false,
      summary:
        "현재 수집정보 수준에서는 도구 자체보다 자유의견 개인정보 입력 방지, 담당자, 보유·파기 안내가 더 중요합니다.",
      platformNotes: [],
      certificationCards: [],
    };
  }

  if (privacyType === "quasi_only") {
    const quasiLabel =
      summary.quasiIdentifiers.length > 0
        ? summary.quasiIdentifiers.slice(0, 3).join(", ")
        : "연령대, 거주지역";
    return {
      showStrongCertification: false,
      summary: `${quasiLabel} 등 준식별정보를 수집합니다. 외부 설문도구를 사용하는 경우 보유기간, 파기 기준, 담당부서, 외부도구 이용 안내를 보완하는 것이 좋습니다.`,
      platformNotes: [],
      certificationCards: [],
    };
  }

  if (publicLike && hasPii) {
    const summaryText =
      privacyType === "sensitive_or_high_risk"
        ? "공공기관이 민감정보 또는 고위험 개인정보를 수집하는 경우, CSAP 인증 도구 사용과 접근권한·보유·파기 관리 기준을 반드시 확인해야 합니다."
        : "공공기관은 개인정보·민감정보 수집 시 CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 강력히 권고합니다.";

    if (report.platform === "google_forms") {
      platformNotes.push(
        "Google Forms는 해외 외부 설문 SaaS로 확인됩니다. 국외 보관·이전, 접근권한, 기관 계정 관리, 보유·파기 기준을 반드시 확인해야 합니다.",
      );
    }
    if (report.platform === "naver_forms" || report.platform === "moaform") {
      platformNotes.push(
        "외부 설문 SaaS 사용 시 수탁자, 위탁업무, 접근권한, 보유·파기 기준과 CSAP 인증 여부를 확인해야 합니다.",
      );
    }
    cards.push(CSAP_CARD, SECURE_TOOL_CARD);

    return {
      showStrongCertification: true,
      summary: summaryText,
      platformNotes,
      certificationCards: cards,
    };
  }

  // private / unknown with PII
  const summaryText =
    "개인정보·민감정보를 수집하는 민간 설문은 CSAP 인증 도구, ISMS-P 인증 수행기관, 보안인증 수집도구 사용을 강력히 권고합니다.";
  if (report.platform === "google_forms") {
    platformNotes.push(
      "Google Forms 사용 시 국외 보관·이전 가능성, 접근권한, 관리자 계정, 보유·파기 기준을 확인해야 합니다.",
    );
  }
  if (report.platform === "naver_forms" || report.platform === "moaform") {
    platformNotes.push(
      "외부 설문도구 이용, 수탁자 또는 처리위탁 여부, 접근권한, 보유·파기 기준을 확인해야 합니다.",
    );
  }
  platformNotes.push(
    "민간기업에 CSAP가 항상 법적 의무는 아니지만, 개인정보 수집 도구의 보안성을 판단할 때 공공 수준의 보안 기준으로 참고할 수 있습니다. ISMS-P는 개인정보보호 관리체계를 확인하는 중요한 기준입니다.",
  );
  cards.push(CSAP_CARD, ISMS_P_CARD, SECURE_TOOL_CARD);

  return {
    showStrongCertification: true,
    summary: summaryText,
    platformNotes,
    certificationCards: cards,
  };
}

function buildNoticeItems(
  report: ScanReport,
  privacyType: PrivacyDataType,
): OperatorImprovementItem[] {
  if (privacyType === "minimal" || privacyType === "limited") {
    const items: OperatorImprovementItem[] = [];
    if (hasMissing(report, /담당|처리자|문의/)) {
      items.push({
        id: "contact",
        title: "담당부서 또는 문의처 표시",
        detail: "설문 안내문에 담당부서·연락처를 적어 주세요.",
      });
    }
    if (hasMissing(report, /보유|파기/)) {
      items.push({
        id: "retention",
        title: "보유기간과 파기 기준 간단 안내",
        detail: "보유기간과 파기 기준을 간단히 안내하세요.",
      });
    }
    return items;
  }

  const items: OperatorImprovementItem[] = [];
  if (hasMissing(report, /목적/)) {
    items.push({
      id: "purpose",
      title: "수집·이용 목적",
      detail: "개인정보 수집 목적과 항목을 설문 첫 화면에 명시하세요.",
    });
  }
  if (hasMissing(report, /항목/)) {
    items.push({
      id: "items",
      title: "수집 항목",
      detail: "수집하는 항목을 안내문에 한 줄로 정리하세요.",
    });
  }
  if (hasMissing(report, /보유|파기/)) {
    items.push({
      id: "retention",
      title: "보유·이용 기간 / 파기 기준",
      detail: "보유기간과 파기 기준이 보이지 않습니다.",
    });
  }
  if (hasMissing(report, /거부|불이익/)) {
    items.push({
      id: "refusal",
      title: "동의 거부권 및 불이익",
      detail: "동의하지 않을 권리와 제한사항을 안내하세요.",
    });
  }
  if (hasMissing(report, /담당|처리자|문의/)) {
    items.push({
      id: "processor",
      title: "개인정보처리자 또는 담당자",
      detail: "담당부서 또는 문의처를 표시하세요.",
    });
  }
  if (
    (report.platform === "naver_forms" || report.platform === "moaform") &&
    (privacyType === "direct_identifier" || privacyType === "sensitive_or_high_risk")
  ) {
    items.push({
      id: "trustee",
      title: "위탁/수탁자 안내",
      detail: "네이버폼/모아폼 등 외부도구 사용 시 수탁자와 위탁업무 안내를 검토하세요.",
    });
  }
  if (report.platform === "google_forms" && privacyType !== "quasi_only") {
    items.push({
      id: "overseas",
      title: "국외 보관·이전 안내",
      detail: "Google Forms 사용 시 국외 보관·이전 안내를 추가하세요.",
    });
  }
  if (privacyType === "sensitive_or_high_risk") {
    items.push({
      id: "sensitive_consent",
      title: "민감정보 별도 동의",
      detail: "민감정보 별도 동의와 수집 필요성을 명시하세요.",
    });
    items.push({
      id: "raw_access",
      title: "원자료 접근권한",
      detail: "원자료 열람·다운로드 권한 기준을 안내하세요.",
    });
  }
  return items.slice(0, 8);
}

function buildQuestionItems(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType: PrivacyDataType,
): OperatorImprovementItem[] {
  const items: OperatorImprovementItem[] = [];
  const isEvent = Boolean(report.form.contextHints?.isEvent);
  const isEmployee =
    Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    hasEmployeeSensitiveCombination(report);

  if (hasFreeOpinion(report)) {
    items.push({
      id: "free_opinion",
      title: "자유의견 개인정보 입력 금지 안내",
      detail: "자유의견에 개인정보를 쓰지 말라는 안내를 추가하세요.",
    });
  }

  if (privacyType === "quasi_only") {
    items.push({
      id: "quasi_minimize",
      title: "준식별정보 최소화",
      detail:
        "연령대, 거주지역 등 준식별정보는 조사 목적에 필요한 경우만 유지하세요.",
    });
    items.push({
      id: "small_group",
      title: "소수집단 식별 가능성",
      detail: "소수집단 식별 가능성이 큰 조합은 결과 공개 시 비공개 기준을 검토하세요.",
    });
  }

  if (privacyType === "direct_identifier") {
    items.push({
      id: "need_check",
      title: "직접식별정보 필요성 검토",
      detail: "이름, 연락처, 이메일이 꼭 필요한지 검토하고 최소 항목만 수집하세요.",
    });
    if (isEvent) {
      items.push({
        id: "prize_separate",
        title: "경품 연락처 분리",
        detail: "경품 연락처는 설문 응답과 분리하세요.",
      });
    }
    items.push({
      id: "optional_mark",
      title: "연락처 필수/선택 표시",
      detail: "연락처 수집은 선택/필수 여부를 명확히 표시하세요.",
    });
  }

  if (privacyType === "sensitive_or_high_risk") {
    items.push({
      id: "sensitive_minimize",
      title: "민감정보 문항 최소화",
      detail: "민감정보 문항을 삭제하거나 최소화하고 별도 동의·수집 필요성을 명시하세요.",
    });
    if (summary.highRiskItems.length > 0) {
      items.push({
        id: "high_risk_avoid",
        title: "고위험정보 범용도구 수집 지양",
        detail: "주민등록번호, 계좌번호, 신분증 등은 범용 설문도구 수집을 지양하세요.",
      });
    }
    if (isEmployee) {
      items.push({
        id: "employee_anonymity",
        title: "직원 고충/인사평가 익명성",
        detail: "익명성, 원자료 접근권한, 불이익 방지 기준을 명시하세요.",
      });
    }
  }

  if (privacyType === "minimal" && items.length === 0) {
    items.push({
      id: "optional_check",
      title: "불필요한 선택문항 점검",
      detail: "조사 목적에 필요 없는 선택문항이 없는지 확인하세요.",
    });
  }

  return items.slice(0, 6);
}

function buildManagementItems(
  report: ScanReport,
  privacyType: PrivacyDataType,
): OperatorImprovementItem[] {
  const items: OperatorImprovementItem[] = [];
  const mgmt = report.form.management;
  const isEmployee = Boolean(report.form.contextHints?.isEmployeeSurvey);
  const isEvent = Boolean(report.form.contextHints?.isEvent);
  const isMarketing = Boolean(report.form.contextHints?.isMarketing);
  const hasPii =
    privacyType === "direct_identifier" || privacyType === "sensitive_or_high_risk";

  if (hasPii) {
    if (mgmt?.accessControl !== true) {
      items.push({
        id: "access",
        title: "원자료 접근권한",
        detail: "원자료 열람·접근권한 기준을 확인·명시하세요.",
      });
    }
    if (mgmt?.rawDataDownloadControl !== true) {
      items.push({
        id: "download",
        title: "다운로드 파일 관리",
        detail: "응답 원자료 다운로드·보관 관리 기준을 확인하세요.",
      });
    }
    if (mgmt?.retentionManagement !== true || hasMissing(report, /보유|파기/)) {
      items.push({
        id: "retention_mgmt",
        title: "보유기간 경과 후 파기",
        detail: "보유기간 경과 후 파기 절차를 운영 기준으로 정리하세요.",
      });
    }
  }

  if (isPublicLike(classifySurveySubject(report)) && hasPii) {
    if (mgmt?.officialAccount !== true) {
      items.push({
        id: "official_account",
        title: "기관 공식 계정 사용 여부",
        detail: "개인 계정이 아닌 기관 공식 계정 사용 여부를 확인하세요.",
      });
    }
  }

  if (hasMissing(report, /담당|처리자|문의/)) {
    items.push({
      id: "contact_dept",
      title: "담당부서 또는 문의처",
      detail: "담당부서 또는 문의처를 표시하세요.",
    });
  }

  if (isEmployee) {
    items.push({
      id: "anonymity",
      title: "직원설문 익명성 기준",
      detail: "익명성 기준과 소수집단 통계 비공개 기준을 명시하세요.",
    });
  }

  if (isEvent && hasPii) {
    items.push({
      id: "prize_split",
      title: "경품 연락처와 설문응답 분리",
      detail: "경품 연락처와 설문 응답을 분리 관리하세요.",
    });
  }

  if (isMarketing) {
    items.push({
      id: "marketing",
      title: "마케팅 활용 별도 동의",
      detail: "마케팅 활용은 별도 선택 동의로 분리하세요.",
    });
  }

  if (hasPii && mgmt?.resultDisclosurePrevention !== true) {
    items.push({
      id: "result_disclosure",
      title: "응답 결과 공개 설정",
      detail: "개인이 식별될 수 있는 결과 공개 설정을 점검하세요.",
    });
  }

  return items.slice(0, 8);
}

export function buildOperatorImprovementReport(
  report: ScanReport,
  summary: CollectedDataSummary,
  topFixes: OperatorFix[],
  templates: CopyableTemplate[],
): OperatorImprovementReport {
  const privacyType = classifyPrivacyDataType(report, summary);
  const subject = classifySurveySubject(report);
  const coreProblems = buildCoreOperatorProblems(report, summary);

  const basisIds = new Set<LegalBasisId>();
  for (const problem of coreProblems.problems) {
    for (const id of problem.basisIds) basisIds.add(id);
  }
  const legalBasisDetails = [...basisIds].map((id) => LEGAL_BASIS_REGISTRY[id]);

  return {
    topFixes: topFixes.slice(0, 3),
    tool: buildToolImprovement(report, summary, privacyType, subject),
    noticeItems: buildNoticeItems(report, privacyType),
    questionItems: buildQuestionItems(report, summary, privacyType),
    managementItems: buildManagementItems(report, privacyType),
    templates,
    coreProblems,
    legalBasisDetails,
  };
}
