import type {
  CollectedDataSummary,
  CsapExplanation,
  PublicSectorCsapAssessment,
} from "@/lib/reporting/reportMessages";
import {
  getToolCsapProfile,
  isCsapCertifiedTool,
  type ToolCsapProfile,
} from "@/lib/reporting/toolRegistry";
import type { ScanReport } from "@/lib/types/scan";

const CSAP_EXPLANATION: CsapExplanation = {
  title: "CSAP란?",
  body: "CSAP는 Cloud Security Assurance Program의 약자로, 국내 공공기관이 민간 클라우드 서비스를 안전하게 이용할 수 있도록 보안 기준 충족 여부를 평가하는 클라우드 보안인증 제도입니다.",
  bullets: [
    "공공기관 클라우드 서비스 이용 시 보안성을 확인하는 인증",
    "서비스의 접근통제, 저장, 백업, 운영관리 등 보안 기준 검토",
    "개인정보 수집·처리 도구의 공공부문 적합성 판단 기준으로 활용 가능",
    "설문도 개인정보 수집 도구이므로 공공부문에서는 보안 인증 여부 확인이 중요",
  ],
  disclaimer:
    "CSAP 인증은 도구의 보안성을 확인하는 중요한 기준이지만, 개인정보 수집 목적, 수집 항목, 보유기간, 파기 기준, 동의 거부권, 담당자 안내 등 개인정보 고지 의무는 별도로 충족해야 합니다.",
};

function hasEmployeeContext(report: ScanReport): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  const summary = report.debug?.contextSummary ?? "";
  return (
    Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    /직원|근로|조직진단|employee/i.test(`${labels} ${summary}`)
  );
}

export function hasEmployeeSensitiveCombination(report: ScanReport): boolean {
  if (!hasEmployeeContext(report)) return false;
  return report.form.questions.some((question) =>
    /고충|괴롭힘|상사평가|인사평가|부서|직급|근속/.test(question.label),
  );
}

export function hasSignificantPersonalDataForCsap(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  if (summary.directIdentifiers.length > 0) return true;
  if (summary.sensitiveItems.length > 0) return true;
  if (summary.highRiskItems.length > 0) return true;
  if (hasEmployeeSensitiveCombination(report)) return true;
  return false;
}

function isQuasiOnlyPersonalData(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  return (
    summary.quasiIdentifiers.length > 0 &&
    !hasSignificantPersonalDataForCsap(report, summary)
  );
}

function buildPlatformNote(profile: ToolCsapProfile): string | undefined {
  switch (profile.toolCategory) {
    case "overseas_saas":
      return "현재 설문은 Google Forms 기반으로 확인됩니다. Google Forms 사용 시 국외 보관·이전, 접근권한, 기관 계정 관리, 보유·파기 기준을 반드시 확인해야 합니다.";
    case "domestic_saas":
      return "현재 설문은 외부 설문 SaaS 기반으로 확인됩니다. 수탁자, 위탁업무, 접근권한, 보유·파기 기준, 공공부문 보안 기준 충족 여부를 확인해야 합니다.";
    case "generic":
      return "현재 설문 도구의 보안 인증 여부를 확인하기 어렵습니다. 공공기관 개인정보 설문이라면 CSAP 인증 등 공공부문 보안 기준 충족 여부를 확인해야 합니다.";
    default:
      return undefined;
  }
}

function buildStrongTitle(
  report: ScanReport,
  summary: CollectedDataSummary,
): string {
  const hasSensitive =
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0 ||
    hasEmployeeSensitiveCombination(report);

  if (hasSensitive) {
    return "공공기관은 개인정보·민감정보 수집 시 CSAP 인증 도구 사용을 우선 검토해야 합니다.";
  }

  return "공공기관 개인정보 설문은 CSAP 인증 도구 사용을 강력히 권고합니다.";
}

function buildStrongBody(summary: CollectedDataSummary): string {
  const collectsSensitive =
    summary.sensitiveItems.length > 0 || summary.highRiskItems.length > 0;

  if (collectsSensitive) {
    return "이 설문은 공공부문 설문으로 보이며 민감정보 또는 민감한 맥락의 응답을 수집할 수 있습니다. 공공기관이 외부 설문도구로 개인정보를 수집하는 경우, 수집 도구의 보안성, 접근권한, 보유·파기, 위탁 또는 국외이전 관리가 함께 확인되어야 합니다.";
  }

  return "이 설문은 공공부문에서 운영되는 설문으로 보이며, 개인정보 또는 민감정보를 수집합니다. 공공기관이 외부 설문도구로 개인정보를 수집하는 경우, 수집 도구의 보안성, 접근권한, 보유·파기, 위탁 또는 국외이전 관리가 함께 확인되어야 합니다.";
}

function buildStrongAssessment(
  report: ScanReport,
  summary: CollectedDataSummary,
  profile: ToolCsapProfile,
): PublicSectorCsapAssessment {
  const hasSensitive =
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0 ||
    hasEmployeeSensitiveCombination(report);

  return {
    severity: "strong",
    showStrongWarning: true,
    showMildNotice: false,
    title: buildStrongTitle(report, summary),
    body: buildStrongBody(summary),
    strongRecommendation: hasSensitive
      ? "특히 개인정보·민감정보를 수집하는 공공 설문은 CSAP 인증 등 공공부문 보안 기준을 충족하는 도구 사용을 강력히 권고합니다."
      : "공공기관은 특히 개인정보와 민감정보 수집 시 CSAP 인증 도구 사용을 강력히 권고합니다.",
    platformNote: buildPlatformNote(profile),
    toolStatusLabel: profile.csapStatusLabel,
    csapExplanation: CSAP_EXPLANATION,
  };
}

function buildMildAssessment(profile: ToolCsapProfile): PublicSectorCsapAssessment {
  return {
    severity: "mild",
    showStrongWarning: false,
    showMildNotice: true,
    title: "공공부문 설문에서 외부 설문도구를 사용하고 있습니다",
    body: "공공부문 설문에서 외부 설문도구를 사용하고 있습니다. 보유기간, 파기 기준, 담당부서, 외부 도구 이용 안내를 보완하는 것이 좋습니다.",
    strongRecommendation:
      "준식별정보만 수집하더라도 외부 설문도구의 보유·파기, 담당부서, 위탁 또는 이용 안내를 확인하세요.",
    platformNote:
      profile.toolCategory === "domestic_saas"
        ? "네이버폼·모아폼 등 외부 SaaS 이용 시 수탁자와 보유·파기 기준을 안내하는 것이 좋습니다."
        : profile.toolCategory === "overseas_saas"
          ? "Google Forms 등 해외 SaaS 이용 시 국외 보관·이전과 보유·파기 기준을 안내하는 것이 좋습니다."
          : undefined,
    toolStatusLabel: profile.csapStatusLabel,
    csapExplanation: CSAP_EXPLANATION,
  };
}

export function buildPublicSectorCsapAssessment(
  report: ScanReport,
  summary: CollectedDataSummary,
): PublicSectorCsapAssessment | undefined {
  if (!report.debug?.publicSectorDetected) return undefined;
  if (isCsapCertifiedTool(report.platform, report.form.management)) return undefined;

  const profile = getToolCsapProfile(report.platform, report.form.management);
  if (!profile.isExternalSaaS) return undefined;

  if (hasSignificantPersonalDataForCsap(report, summary)) {
    return buildStrongAssessment(report, summary, profile);
  }

  if (isQuasiOnlyPersonalData(report, summary)) {
    return buildMildAssessment(profile);
  }

  return undefined;
}

export function buildCsapHeroReason(
  assessment: PublicSectorCsapAssessment,
  report: ScanReport,
  summary: CollectedDataSummary,
): string {
  if (!assessment.showStrongWarning) {
    return "외부 설문도구 사용에 따른 보유·파기·담당부서 안내를 확인하세요.";
  }

  const hasSensitive =
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0 ||
    hasEmployeeSensitiveCombination(report);

  if (hasSensitive) {
    return "민감정보 수집 공공 설문은 CSAP 인증 도구 사용을 강력히 권고합니다.";
  }

  return "공공기관 개인정보 설문으로 보안 인증 도구 사용 검토가 필요합니다.";
}

export function shouldElevateToolRiskForCsap(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  if (!report.debug?.publicSectorDetected) return false;
  if (isCsapCertifiedTool(report.platform, report.form.management)) return false;
  return hasSignificantPersonalDataForCsap(report, summary);
}
