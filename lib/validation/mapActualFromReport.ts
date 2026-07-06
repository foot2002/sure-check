import type {
  ActualValidationValues,
  ExpectedContext,
  ExpectedDetectedCategory,
} from "@/lib/validation/types";
import type { ScanReport } from "@/lib/types/scan";

function collectDetectedCategories(
  report: ScanReport,
): ExpectedDetectedCategory[] {
  const set = new Set<ExpectedDetectedCategory>();
  for (const question of report.form.questions) {
    for (const category of question.detectedCategories ?? []) {
      set.add(category);
    }
  }
  return [...set];
}

function normalizeExtractorName(raw: string, report: ScanReport): string {
  const limited =
    Boolean(report.isLimited ?? report.form.isLimited) ||
    (report.form.questions.length === 0 &&
      (report.score == null || report.scanStatus === "failed"));

  if (limited && report.form.questions.length === 0) {
    return "Limited";
  }

  if (raw.startsWith("Fixture")) {
    return "Fixture";
  }

  return raw.replace(/\s*\(.*\)$/, "").trim();
}

export function deriveContextFromReport(report: ScanReport): ExpectedContext {
  const debug = report.debug;
  const labels = (debug?.contextLabels ?? []).join(" ").toLowerCase();
  const summary = (debug?.contextSummary ?? "").toLowerCase();

  if (debug?.publicSectorDetected || labels.includes("공공") || labels.includes("public")) {
    return "public_sector";
  }
  if (labels.includes("근로") || labels.includes("직원") || labels.includes("employee")) {
    return "employee";
  }
  if (labels.includes("이벤트") || labels.includes("경품") || labels.includes("event")) {
    return "event";
  }
  if (labels.includes("마케팅") || labels.includes("marketing")) {
    return "marketing";
  }
  if (
    labels.includes("민원") ||
    labels.includes("신고") ||
    labels.includes("고충") ||
    labels.includes("complaint")
  ) {
    return "complaint";
  }
  if (labels.includes("기업") || labels.includes("company") || summary.includes("일반")) {
    return "company";
  }
  return "unknown";
}

export function mapActualFromReport(report: ScanReport): ActualValidationValues {
  const debug = report.debug;
  const extractorRaw = debug?.extractorName ?? "Unknown";

  const actualIsLimited =
    Boolean(report.isLimited ?? report.form.isLimited) ||
    report.scanStatus === "limited" ||
    (report.scanStatus === "failed" && report.form.questions.length === 0) ||
    (report.form.questions.length === 0 && report.score == null);

  return {
    actualPlatform: report.platform,
    actualExtractor: normalizeExtractorName(extractorRaw, report),
    actualQuestionCount: report.form.questions.length,
    actualDetectedCategories: collectDetectedCategories(report),
    actualRiskGrade: report.grade,
    actualIsLimited,
    actualLimitedReason: report.limitedReason ?? report.form.limitedReason,
    actualContext: deriveContextFromReport(report),
    actualDataLevel: debug?.dataRiskLevel,
    actualScore: report.score,
    actualDiagnosisStatus: report.diagnosisStatus,
  };
}
