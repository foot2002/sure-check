import type { AnalysisResult } from "@/lib/types/analyzer";
import type { ScanDebugInfo } from "@/lib/types/debug";
import type { ScanReport } from "@/lib/types/scan";
import { getExtractorName } from "@/lib/debug/extractorNames";
import { textLooksEndedSurvey } from "@/lib/scan/nonActionableForm";

function detectClosedForm(report: ScanReport): boolean {
  const { form } = report;
  if ((form.questions?.length || 0) > 0) return false;
  const text = [
    form.limitedReason || "",
    ...(form.metadata?.extractionWarnings ?? []),
    form.metadata?.failureReason || "",
  ].join(" ");
  return textLooksEndedSurvey(text);
}

export function buildScanDebug(
  report: ScanReport,
  analysis: AnalysisResult | null,
  options: {
    inputUrl: string;
    normalizedUrl: string;
    finalUrl?: string;
  },
): ScanDebugInfo {
  const { form } = report;
  const missingNotices = analysis
    ? analysis.complianceGaps
        .filter((gap) => gap.status !== "present")
        .map((gap) => ({
          key: gap.key,
          label: gap.label,
          status: gap.status,
          detail: gap.detail,
        }))
    : [];

  return {
    inputUrl: options.inputUrl,
    normalizedUrl: options.normalizedUrl,
    platform: report.platform,
    diagnosisStatus: report.diagnosisStatus,
    finalUrl: options.finalUrl ?? form.url,
    extractorName: getExtractorName(report.platform, form.fixtureKey),
    questionCount: form.questions.length,
    partialScan: Boolean(form.partialScan),
    isLimited: Boolean(report.isLimited ?? form.isLimited),
    limitedReason: report.limitedReason ?? form.limitedReason,
    confidence: report.confidence ?? form.confidence,
    branchDetected: form.branchDetected,
    loginRequired: form.loginRequired,
    closedForm: detectClosedForm(report),
    contextLabels: analysis?.context.labels ?? [],
    contextSummary: analysis?.context.summary,
    publicSectorDetected: analysis?.context.publicSectorDetected ?? false,
    publicSectorConfidence: analysis?.context.publicSectorConfidence,
    publicSectorEvidence: analysis?.context.publicSectorEvidence ?? [],
    publicInstitutionEvidence: analysis?.context.publicInstitutionEvidence,
    dataRiskLevel: analysis?.dataRisk.level,
    dataRiskLabel: analysis?.dataRisk.levelLabel,
    toolRiskLevel: analysis?.toolRisk.level,
    toolRiskLabel: analysis?.toolRisk.levelLabel,
    obligations: analysis?.obligations ?? [],
    missingNotices,
    managementItems: analysis?.management.items ?? [],
    overrideRules: analysis?.overrides ?? [],
    finalScore: report.score,
    finalGrade: report.grade,
    scoreBreakdown: analysis?.score,
  };
}
