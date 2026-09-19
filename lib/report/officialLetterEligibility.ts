import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  classifyLimitedOutcome,
  isReportableAdminOutcome,
} from "@/lib/report/limitedOutcomeBuckets";

export function canDownloadOfficialLetter(input: {
  overallRiskLevel?: string | null;
  diagnosisStatus?: string | null;
  userDecisionLabel?: string | null;
  limitedReason?: string | null;
  errorMessage?: string | null;
  summary?: string | null;
  scanStatus?: string | null;
}): boolean {
  const diagnosis = String(input.diagnosisStatus || "");
  if (diagnosis && diagnosis !== "completed") return false;
  return isReportableAdminOutcome(classifyLimitedOutcome(input));
}

export function canDownloadOfficialLetterFromDetail(
  detail: AdminCaseDetail,
): boolean {
  const report = detail.reportJson as {
    limitedReason?: unknown;
    summary?: unknown;
    diagnosisStatus?: unknown;
  } | null;
  return canDownloadOfficialLetter({
    overallRiskLevel: detail.summary.overallRiskLevel,
    diagnosisStatus:
      detail.summary.diagnosisStatus ||
      (typeof report?.diagnosisStatus === "string" ? report.diagnosisStatus : null),
    userDecisionLabel: detail.summary.userDecisionLabel,
    limitedReason:
      typeof report?.limitedReason === "string" ? report.limitedReason : null,
    summary: typeof report?.summary === "string" ? report.summary : null,
  });
}
