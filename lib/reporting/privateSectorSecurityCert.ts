import type {
  CollectedDataSummary,
  CertificationStandardCard,
  PrivateSectorSecurityCertAssessment,
} from "@/lib/reporting/reportMessages";
import {
  hasEmployeeSensitiveCombination,
  hasSignificantPersonalDataForCsap,
} from "@/lib/reporting/publicSectorCsap";
import {
  getToolCsapProfile,
  isCsapCertifiedTool,
  type ToolCsapProfile,
} from "@/lib/reporting/toolRegistry";
import type { ScanReport } from "@/lib/types/scan";

const CERTIFICATION_CARDS: CertificationStandardCard[] = [
  {
    id: "csap",
    title: "CSAP 인증 도구",
    description:
      "CSAP는 Cloud Security Assurance Program의 약자로, 클라우드 서비스가 공공부문에서 요구하는 보안 기준을 충족하는지 평가하는 인증 제도입니다.",
    privateSectorNote:
      "민간기업에 CSAP가 항상 법적 의무는 아니지만, 개인정보·민감정보 수집 도구의 보안성을 판단할 때 공공 수준의 보안 기준을 참고할 수 있는 중요한 지표입니다.",
    bullets: [
      "클라우드 서비스 보안성 검증 기준",
      "공공부문에서 중요하게 보는 보안 인증",
      "접근통제, 저장, 운영, 백업, 파기 등 보안관리 확인",
      "민간기업도 개인정보 수집 도구 선택 시 참고 가능",
    ],
    disclaimer:
      "CSAP 인증 도구를 사용하더라도 개인정보 수집 고지, 동의, 보유기간, 파기 기준은 별도로 충족해야 합니다.",
  },
  {
    id: "isms_p",
    title: "ISMS-P 인증 수행기관",
    description:
      "ISMS-P는 정보보호 및 개인정보보호 관리체계 인증으로, 기업이나 기관이 개인정보를 안전하게 관리하기 위한 조직적·기술적·관리적 보호체계를 갖추고 있는지 확인하는 인증입니다.",
    privateSectorNote:
      "민간기업이나 조사 수행사가 개인정보를 대신 수집·분석하는 경우, ISMS-P 등 관리체계 인증 여부는 원자료 접근, 보관, 파기, 내부통제 수준을 판단하는 중요한 기준이 될 수 있습니다.",
    bullets: [
      "개인정보보호 관리체계 확인",
      "내부 접근권한과 원자료 관리체계 확인",
      "보관·파기·위탁관리 절차 확인",
      "조사 수행기관 신뢰성 판단 기준",
    ],
    disclaimer:
      "ISMS-P 인증이 있더라도 개별 설문에서 필요한 고지와 동의 항목은 별도로 안내해야 합니다.",
  },
  {
    id: "secure_collection_tool",
    title: "보안 인증 수집도구",
    description:
      "보안 인증 수집도구란 개인정보 수집, 저장, 접근통제, 다운로드 관리, 파기, 로그 관리 등 개인정보 처리 과정의 보안 기능이 검증된 설문·신청·접수 도구를 의미합니다.",
    bullets: [
      "개인정보 수집 전용 도구",
      "접근권한과 다운로드 관리 가능",
      "보유기간과 파기 관리 가능",
      "기관 계정과 관리자 권한 통제 가능",
      "조사 목적에 맞는 고지문과 동의 관리 가능",
    ],
    disclaimer:
      "범용 설문도구는 빠르게 설문을 만들 수 있다는 장점이 있지만, 개인정보 수집·보관·파기·접근권한 관리가 충분히 안내되지 않으면 위험이 커질 수 있습니다.",
  },
];

const CERTIFICATION_DISCLAIMER =
  "CSAP 또는 ISMS-P 인증은 개인정보보호법상 고지 의무를 대체하지 않습니다. 수집 목적, 수집 항목, 보유기간, 파기 기준, 동의 거부권, 담당자 안내는 별도로 명확히 제공해야 합니다.";

function isQuasiOnlyPersonalData(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  return (
    summary.quasiIdentifiers.length > 0 &&
    !hasSignificantPersonalDataForCsap(report, summary)
  );
}

function hasSensitiveOrHighRisk(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  return (
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0 ||
    hasEmployeeSensitiveCombination(report)
  );
}

function buildPrivatePlatformNote(
  profile: ToolCsapProfile,
  summary: CollectedDataSummary,
  report: ScanReport,
): string | undefined {
  const sensitive = hasSensitiveOrHighRisk(report, summary);

  switch (profile.toolCategory) {
    case "overseas_saas":
      return sensitive
        ? "현재 설문은 Google Forms 기반으로 확인됩니다. 개인정보를 수집하는 경우 국외 보관·이전 가능성, 접근권한, 관리자 계정, 보유·파기 기준을 확인해야 합니다. 민감정보 또는 고위험 개인정보가 포함된다면 범용폼보다 인증된 보안 도구 사용을 권고합니다."
        : "현재 설문은 Google Forms 기반으로 확인됩니다. 개인정보를 수집하는 경우 국외 보관·이전 가능성, 접근권한, 관리자 계정, 보유·파기 기준을 확인해야 합니다.";
    case "domestic_saas": {
      const platformName =
        report.platform === "moaform" ? "Moaform" : "Naver Form";
      return sensitive
        ? `현재 설문은 ${platformName} 기반으로 확인됩니다. 개인정보를 수집하는 경우 외부 도구 이용, 수탁자 또는 처리위탁 여부, 접근권한, 보유·파기 기준을 확인해야 합니다. 민감정보 또는 고위험 개인정보가 포함된다면 보안 인증 도구 또는 ISMS-P 인증 수행기관 이용을 권고합니다.`
        : `현재 설문은 ${platformName} 기반으로 확인됩니다. 개인정보를 수집하는 경우 외부 도구 이용, 수탁자 또는 처리위탁 여부, 접근권한, 보유·파기 기준을 확인해야 합니다.`;
    }
    case "generic":
      return "현재 설문 도구의 보안 인증 여부를 확인하기 어렵습니다. 개인정보 또는 민감정보가 포함된 설문이라면 CSAP, ISMS-P, 보안 인증 수집도구 등 보안성과 관리체계가 확인된 방식을 검토해야 합니다.";
    default:
      return undefined;
  }
}

function buildStrongPrivateAssessment(
  report: ScanReport,
  summary: CollectedDataSummary,
  profile: ToolCsapProfile,
): PrivateSectorSecurityCertAssessment {
  const sensitive = hasSensitiveOrHighRisk(report, summary);

  return {
    severity: "strong",
    showStrongWarning: true,
    showMildNotice: false,
    title: sensitive
      ? "민감정보 설문은 범용 설문도구보다 인증된 보안 도구 사용을 강력히 권고합니다."
      : "개인정보 설문은 인증된 도구와 수행기관 이용을 강력히 권고합니다.",
    body: "이 설문은 민간기업 또는 민간 수행기관이 운영하는 설문으로 보이며, 개인정보 또는 민감정보를 수집합니다. 개인정보가 포함된 조사는 단순히 설문 링크를 만드는 것보다 수집 도구의 보안성, 접근권한, 보유·파기, 위탁관리, 원자료 관리체계가 중요합니다.",
    strongRecommendation:
      "Google Forms, Naver Form, Moaform 등 범용 설문도구로 개인정보를 수집하는 경우, 보안 인증 도구, CSAP 인증 도구, ISMS-P 인증 수행기관 이용을 강력히 권고합니다.",
    sensitiveDataNote: sensitive
      ? "특히 건강정보, 고충, 피해경험, 직원평가, 주민등록번호, 계좌번호 등 민감정보 또는 고위험 개인정보가 포함되는 조사는 범용 설문도구 사용보다 보안성과 관리체계가 검증된 방식으로 운영해야 합니다."
      : undefined,
    certificationDisclaimer: CERTIFICATION_DISCLAIMER,
    platformNote: buildPrivatePlatformNote(profile, summary, report),
    toolStatusLabel:
      profile.csapStatus === "unknown"
        ? "보안 인증 여부 확인 필요"
        : "현재 확인된 범위에서 인증 도구로 분류되지 않은 외부 설문도구",
    explanationSectionTitle: "인증 기준 알아보기",
    certificationCards: CERTIFICATION_CARDS,
  };
}

function buildMildPrivateAssessment(
  profile: ToolCsapProfile,
): PrivateSectorSecurityCertAssessment {
  return {
    severity: "mild",
    showStrongWarning: false,
    showMildNotice: true,
    title: "민간 설문에서 외부 설문도구를 사용하고 있습니다",
    body: "민간 설문에서 외부 설문도구를 사용하고 있습니다. 보유기간, 파기 기준, 담당부서, 외부 도구 이용 안내를 보완하는 것이 좋습니다.",
    strongRecommendation:
      "준식별정보만 수집하더라도 외부 설문도구의 보유·파기, 담당부서, 위탁 또는 이용 안내를 확인하세요.",
    certificationDisclaimer: CERTIFICATION_DISCLAIMER,
    platformNote:
      profile.toolCategory === "overseas_saas"
        ? "Google Forms 등 해외 SaaS 이용 시 국외 보관·이전과 보유·파기 기준을 안내하는 것이 좋습니다."
        : profile.toolCategory === "domestic_saas"
          ? "네이버폼·모아폼 등 외부 SaaS 이용 시 수탁자와 보유·파기 기준을 안내하는 것이 좋습니다."
          : undefined,
    toolStatusLabel: "범용 외부 설문도구로 확인됨",
    explanationSectionTitle: "인증 기준이 왜 중요한가요?",
    certificationCards: CERTIFICATION_CARDS,
  };
}

export function buildPrivateSectorSecurityCertAssessment(
  report: ScanReport,
  summary: CollectedDataSummary,
): PrivateSectorSecurityCertAssessment | undefined {
  if (report.debug?.publicSectorDetected) return undefined;
  if (isCsapCertifiedTool(report.platform, report.form.management)) return undefined;

  const profile = getToolCsapProfile(report.platform, report.form.management);
  if (!profile.isExternalSaaS) return undefined;

  if (hasSignificantPersonalDataForCsap(report, summary)) {
    return buildStrongPrivateAssessment(report, summary, profile);
  }

  if (isQuasiOnlyPersonalData(report, summary)) {
    return buildMildPrivateAssessment(profile);
  }

  return undefined;
}

export function buildPrivateSectorHeroReason(
  assessment: PrivateSectorSecurityCertAssessment,
  report: ScanReport,
  summary: CollectedDataSummary,
): string {
  if (!assessment.showStrongWarning) {
    return "외부 설문도구 이용, 보유·파기 기준, 담당자 표시를 확인하세요.";
  }

  if (hasSensitiveOrHighRisk(report, summary)) {
    return "민감정보 수집 설문은 보안 인증 도구 또는 ISMS-P 인증 수행기관 이용을 권고합니다.";
  }

  return "개인정보를 수집하므로 인증된 수집도구 또는 관리체계 확인이 필요합니다.";
}

export function shouldElevateToolRiskForPrivateCert(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  if (report.debug?.publicSectorDetected) return false;
  if (isCsapCertifiedTool(report.platform, report.form.management)) return false;
  return hasSignificantPersonalDataForCsap(report, summary);
}
