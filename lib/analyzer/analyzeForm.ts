import type { AnalysisResult } from "@/lib/types/analyzer";
import type { ReportBuildContext } from "@/lib/types/debug";
import type { MockReportKey, NormalizedForm, ScanReport } from "@/lib/types/scan";
import { enrichScanReport } from "@/lib/debug/enrichScanReport";
import { applyGradeOverrideRules } from "@/lib/analyzer/applyGradeOverrideRules";
import { assessManagementRisk } from "@/lib/analyzer/assessManagementRisk";
import { calculateScore } from "@/lib/analyzer/calculateScore";
import { checkNoticeCompliance } from "@/lib/analyzer/checkNoticeCompliance";
import { classifyContext } from "@/lib/analyzer/classifyContext";
import { classifyDataRisk } from "@/lib/analyzer/classifyDataRisk";
import { classifyToolRisk } from "@/lib/analyzer/classifyToolRisk";
import { deriveRequiredObligations } from "@/lib/analyzer/deriveRequiredObligations";
import { generateReport } from "@/lib/analyzer/generateReport";
import { generateExtractionLimitedReport } from "@/lib/scan/limitedReport";
import {
  MOAFORM_FAILURE_MESSAGES,
  type MoaformFailureReason,
} from "@/lib/extractors/moaformTypes";

export function runAnalysis(form: NormalizedForm): AnalysisResult {
  const context = classifyContext(form);
  const dataRisk = classifyDataRisk(form);
  const toolRisk = classifyToolRisk(form, context, dataRisk);
  const obligations = deriveRequiredObligations(context, dataRisk, toolRisk, form);
  const complianceGaps = checkNoticeCompliance(form, obligations);
  const management = assessManagementRisk(form, context, dataRisk, toolRisk);
  const overrides = applyGradeOverrideRules({
    form,
    context,
    dataLevel: dataRisk.level,
    toolRisk,
    complianceGaps,
  });
  const score = calculateScore({
    dataRisk,
    toolRisk,
    complianceGaps,
    management,
    overrides,
    partialScan: form.partialScan,
    context,
  });

  if (
    form.partialScan &&
    form.platform === "generic" &&
    (score.finalGrade === "risk" || score.finalGrade === "high_risk")
  ) {
    score.finalGrade = "caution";
    score.finalScore = Math.max(score.finalScore, 60);
  }

  return {
    context,
    dataRisk,
    toolRisk,
    obligations,
    complianceGaps,
    management,
    overrides,
    score,
  };
}

export function analyzeForm(
  form: NormalizedForm,
  scanId: string,
  formUrl: string,
  mockKey: MockReportKey,
  buildContext?: ReportBuildContext,
): ScanReport {
  if (form.isLimited && form.questions.length === 0) {
    if (form.platform === "moaform") {
      const code = (form.metadata?.failureReason ??
        "MOAFORM_DYNAMIC_RENDERING") as MoaformFailureReason;
      const messages =
        MOAFORM_FAILURE_MESSAGES[code] ??
        MOAFORM_FAILURE_MESSAGES.MOAFORM_DYNAMIC_RENDERING;
      return generateExtractionLimitedReport(scanId, formUrl, form, {
        buildContext,
        limitedReason: form.limitedReason ?? messages.limitedReason,
        summary: messages.summary,
        guidance: messages.guidance,
        limitationReasons: [
          form.limitedReason ?? messages.limitedReason,
          messages.summary,
          messages.guidance,
        ],
      });
    }

    return generateExtractionLimitedReport(scanId, formUrl, form, {
      buildContext,
      limitedReason: form.limitedReason,
    });
  }

  const analysis = runAnalysis(form);
  return enrichScanReport(
    generateReport(form, analysis, scanId, formUrl, mockKey),
    analysis,
    buildContext,
  );
}
