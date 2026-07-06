import type { ScanReport } from "@/lib/types/scan";
import type {
  CollectedDataSummary,
  RespondentDecision,
} from "@/lib/reporting/reportMessages";

function hasAny(items: string[]): boolean {
  return items.length > 0;
}

function missingNoticeLabels(report: ScanReport): string[] {
  return report.debug?.missingNotices.map((gap) => gap.label) ?? [];
}

function isEmployeeContext(report: ScanReport): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  const summary = report.debug?.contextSummary ?? "";
  return (
    Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    /직원|근로|조직진단|employee/i.test(`${labels} ${summary}`)
  );
}

function hasAnonymousContradiction(report: ScanReport): boolean {
  if (!report.form.contextHints?.claimsAnonymous) return false;
  return report.form.questions.some(
    (question) =>
      question.dataRiskLevel === "D3" ||
      question.detectedCategories?.some((category) =>
        ["name", "phone", "email", "address"].includes(category),
      ),
  );
}

function hasGoogleDirectIdentifierWithoutOverseasNotice(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  if (report.platform !== "google_forms") return false;
  if (!hasAny(summary.directIdentifiers)) return false;
  return missingNoticeLabels(report).some((label) => /국외|해외/.test(label));
}

function hasEmployeeSensitiveCombination(
  report: ScanReport,
  summary: CollectedDataSummary,
): boolean {
  if (!isEmployeeContext(report)) return false;
  return (
    hasAny(summary.sensitiveItems) ||
    report.form.questions.some((question) =>
      /고충|괴롭힘|상사평가|인사평가|부서|직급|근속/.test(question.label),
    )
  );
}

export function decideRespondentDecision(
  report: ScanReport,
  summary: CollectedDataSummary,
): RespondentDecision {
  if (report.isLimited || report.diagnosisStatus === "limited") {
    return "check_before_responding";
  }

  const dataLevel = report.debug?.dataRiskLevel;
  const missingLabels = missingNoticeLabels(report);
  const hasSensitiveOrHighRisk =
    dataLevel === "D4" ||
    dataLevel === "D5" ||
    hasAny(summary.sensitiveItems) ||
    hasAny(summary.highRiskItems);
  const hasDirect = hasAny(summary.directIdentifiers);
  const hasQuasiOnly =
    hasAny(summary.quasiIdentifiers) &&
    !hasDirect &&
    !hasAny(summary.sensitiveItems) &&
    !hasAny(summary.highRiskItems);

  if (
    hasSensitiveOrHighRisk ||
    hasAnonymousContradiction(report) ||
    hasGoogleDirectIdentifierWithoutOverseasNotice(report, summary) ||
    (report.debug?.publicSectorDetected && hasSensitiveOrHighRisk) ||
    hasEmployeeSensitiveCombination(report, summary)
  ) {
    return "hold_response";
  }

  if (hasDirect) {
    return "check_before_responding";
  }

  if (hasQuasiOnly || missingLabels.length > 0) {
    return "respond_with_caution";
  }

  return "can_respond";
}

export function buildRespondentDecisionText(
  decision: RespondentDecision,
): { title: string; summary: string } {
  switch (decision) {
    case "can_respond":
      return {
        title: "이 설문은 응답해도 비교적 안전합니다.",
        summary:
          "화면에서 확인되는 범위에서는 개인을 알아볼 수 있는 정보가 거의 포함되어 있지 않습니다.",
      };
    case "respond_with_caution":
      return {
        title: "이 설문은 개인정보·민감정보는 없으나, 주의가 필요합니다.",
        summary:
          "이름·연락처는 요구하지 않지만, 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.",
      };
    case "check_before_responding":
      return {
        title: "이 설문은 개인정보가 포함되어 있어 확인 후 응답해야 합니다.",
        summary:
          "이름, 연락처, 이메일 등은 개인을 직접 알아볼 수 있는 정보입니다. 수집 목적, 보유기간, 파기 기준, 담당자를 확인하세요.",
      };
    case "hold_response":
      return {
        title: "이 설문은 민감정보가 포함될 수 있어 응답하지 않는 것이 좋습니다.",
        summary:
          "민감정보나 고위험 개인정보는 별도 동의, 수집 필요성, 접근권한, 보유기간, 파기 기준이 명확해야 합니다.",
      };
  }
}
