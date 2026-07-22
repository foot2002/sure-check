import type { ScanReport } from "@/lib/types/scan";
import type { CollectedDataSummary, PrivacyDataType } from "@/lib/reporting/reportMessages";
import { classifyPrivacyDataType } from "@/lib/reporting/respondentDecision";
import { isCsapCertifiedTool } from "@/lib/reporting/toolRegistry";
import type { ToolGovernanceSummary } from "@/lib/reporting/verdictTypes";

function isGenericExternalTool(report: ScanReport): boolean {
  return (
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic"
  );
}

/**
 * 도구/관리체계 판단 — 개인정보 유무에 따라 중요도 분기
 */
export function buildToolGovernanceSummary(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType?: PrivacyDataType,
): ToolGovernanceSummary {
  const type = privacyType ?? classifyPrivacyDataType(report, summary);
  const isPublic = Boolean(report.debug?.publicSectorDetected);
  const hasPii =
    type === "direct_identifier" || type === "sensitive_or_high_risk";
  const hasSensitive =
    type === "sensitive_or_high_risk" ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;
  const certified = isCsapCertifiedTool(report.platform);
  const external = isGenericExternalTool(report);

  // A. 개인정보 거의 없음 — 도구는 참고 수준, 섹션 숨김
  if (type === "minimal" || type === "limited") {
    return {
      toolImportanceLevel: type === "limited" ? "none" : "reference",
      showSection: false,
      title: "외부 설문도구 참고",
      body: "개인정보가 거의 없어 도구 위험을 강하게 표시하지 않습니다.",
      certificationRecommendation: "",
      certificationReason: "",
      isCsapStronglyRecommended: false,
      isIsmsPRecommended: false,
      isCertifiedToolRecommended: false,
      bullets: [],
    };
  }

  // B. 준식별정보만 — 보조, CSAP/ISMS-P 강력 권고 없음
  if (type === "quasi_only") {
    return {
      toolImportanceLevel: "secondary",
      showSection: false,
      title: "도구·관리 보조 확인",
      body: "보유기간, 파기 기준, 담당자, 외부도구 안내를 보완하면 좋습니다.",
      certificationRecommendation:
        "준식별정보만 있는 경우 CSAP·ISMS-P를 강하게 권고하지 않습니다.",
      certificationReason: "직접식별정보·민감정보가 확인되지 않습니다.",
      isCsapStronglyRecommended: false,
      isIsmsPRecommended: false,
      isCertifiedToolRecommended: false,
      bullets: [
        "보유기간과 파기 기준을 확인하세요.",
        "외부 설문도구 사용 여부를 안내문에 적어 두면 좋습니다.",
      ],
    };
  }

  // C/D. 직접식별 또는 민감/고위험
  const isCsapStronglyRecommended =
    isPublic && hasPii && external && !certified;
  const isIsmsPRecommended = !isPublic && hasPii;
  const isCertifiedToolRecommended = hasPii && external;

  if (hasSensitive) {
    const bullets: string[] = [];
    if (isPublic) {
      bullets.push("공공기관: CSAP 인증 등 공공부문 보안 기준 도구 사용을 강력히 권고합니다.");
    } else {
      bullets.push(
        "민간기업: CSAP 인증 도구, ISMS-P 인증 수행기관, 보안인증 수집도구 사용을 강력히 권고합니다.",
      );
    }
    if (isEmployeeSurvey(report)) {
      bullets.push("직원설문: 원자료 접근권한, 익명성 기준, 소수집단 비공개 기준을 확인하세요.");
    }
    bullets.push("범용 설문도구로 민감·고위험정보를 수집하는 경우 강한 주의가 필요합니다.");

    return {
      toolImportanceLevel: "critical",
      showSection: true,
      title: "인증 도구·관리체계 강력 권고",
      body: "민감정보 또는 고위험 개인정보가 포함되어 도구와 관리체계 확인이 매우 중요합니다.",
      certificationRecommendation: isPublic
        ? "CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 강력히 권고합니다."
        : "CSAP 인증 도구, ISMS-P 인증 수행기관, 보안 인증 수집도구 사용을 강력히 권고합니다.",
      certificationReason:
        "민감·고위험정보는 범용 설문도구보다 검증된 보안 환경에서 수집하는 것이 안전합니다.",
      isCsapStronglyRecommended: isPublic || isCsapStronglyRecommended,
      isIsmsPRecommended: !isPublic,
      isCertifiedToolRecommended: true,
      bullets,
    };
  }

  // direct_identifier
  const bullets: string[] = [];
  if (report.platform === "google_forms") {
    bullets.push("Google Forms: 국외 보관·이전 안내 확인이 필요합니다.");
  }
  if (report.platform === "naver_forms" || report.platform === "moaform") {
    bullets.push("네이버폼/모아폼: 위탁·수탁자, 접근권한, 보유·파기 안내 확인이 필요합니다.");
  }
  if (isPublic) {
    bullets.push("공공기관: CSAP 인증 등 공공부문 보안 기준 도구 사용을 강력히 권고합니다.");
  } else {
    bullets.push("민간기업: CSAP, ISMS-P, 보안인증도구 사용을 권고합니다.");
  }

  return {
    toolImportanceLevel: "important",
    showSection: true,
    title: "인증 도구·관리체계 권고",
    body: "개인정보를 수집하므로 설문 도구와 관리체계를 중요하게 확인해야 합니다.",
    certificationRecommendation: isPublic
      ? "CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 강력히 권고합니다."
      : "CSAP 인증 도구, ISMS-P 인증 수행기관, 보안 인증 수집도구 사용을 권고합니다.",
    certificationReason:
      "직접식별정보가 포함되어 외부 도구의 보안·위탁·국외이전 안내가 필요합니다.",
    isCsapStronglyRecommended,
    isIsmsPRecommended,
    isCertifiedToolRecommended,
    bullets,
  };
}

function isEmployeeSurvey(report: ScanReport): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  return (
    Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    /직원|근로|조직진단|employee/i.test(labels)
  );
}
