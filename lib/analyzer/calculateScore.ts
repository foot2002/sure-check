import type {
  ComplianceGap,
  DataRiskResult,
  FormContext,
  GradeOverride,
  ManagementRiskResult,
  ScoreBreakdown,
  ToolRiskResult,
} from "@/lib/types/analyzer";
import {
  DATA_RISK_DEDUCTIONS,
  hasDirectIdentifier,
  isQuasiIdentifierOnly,
} from "@/lib/rules/dataRiskRules";
import {
  countWeightedNoticeGaps,
} from "@/lib/rules/noticeComplianceRules";
import { TOOL_RISK_DEDUCTIONS } from "@/lib/rules/toolRouteRules";
import {
  resolveFinalGrade,
  scoreToGrade,
} from "@/lib/analyzer/applyGradeOverrideRules";

const NOTICE_MAX_D3 = 30;
const NOTICE_MAX_D2 = 18;
const MANAGEMENT_MAX = 15;
const MANAGEMENT_MAX_D2 = 8;

export function calculateScore(input: {
  dataRisk: DataRiskResult;
  toolRisk: ToolRiskResult;
  complianceGaps: ComplianceGap[];
  management: ManagementRiskResult;
  overrides: GradeOverride[];
  partialScan?: boolean;
  context?: FormContext;
}): ScoreBreakdown {
  const { dataRisk, toolRisk, complianceGaps, management, overrides, partialScan, context } =
    input;

  const dataDeduction = DATA_RISK_DEDUCTIONS[dataRisk.level];
  let toolDeduction = TOOL_RISK_DEDUCTIONS[toolRisk.level];
  if (toolRisk.mitigated) {
    toolDeduction = Math.max(0, toolDeduction - 8);
  }

  const noticeMax = isQuasiIdentifierOnly(dataRisk.level)
    ? NOTICE_MAX_D2
    : hasDirectIdentifier(dataRisk.level)
      ? NOTICE_MAX_D3
      : NOTICE_MAX_D2;
  const weightedGaps = countWeightedNoticeGaps(complianceGaps, dataRisk.level);
  const obligationWeightBase = Math.max(
    complianceGaps.filter((gap) => gap.status !== "present").length,
    weightedGaps,
    1,
  );
  const noticeDeduction = Math.min(
    noticeMax,
    Math.round((weightedGaps / obligationWeightBase) * noticeMax),
  );

  const managementCap = isQuasiIdentifierOnly(dataRisk.level)
    ? MANAGEMENT_MAX_D2
    : MANAGEMENT_MAX;
  const managementDeduction = Math.min(managementCap, management.deduction);

  const rawScore =
    100 - dataDeduction - toolDeduction - noticeDeduction - managementDeduction;
  let finalScore = Math.max(0, Math.min(100, rawScore));

  if (
    partialScan &&
    isQuasiIdentifierOnly(dataRisk.level) &&
    !context?.publicSectorDetected
  ) {
    finalScore = Math.max(finalScore, 60);
  }

  if (
    isQuasiIdentifierOnly(dataRisk.level) &&
    !hasDirectIdentifier(dataRisk.level) &&
    context?.publicSectorDetected
  ) {
    if (finalScore > 80) {
      finalScore = 80;
    }
    if (finalScore < 70) {
      finalScore = 70;
    }
  } else if (
    isQuasiIdentifierOnly(dataRisk.level) &&
    !hasDirectIdentifier(dataRisk.level) &&
    !context?.publicSectorDetected &&
    finalScore > 75
  ) {
    finalScore = 75;
  }

  const scoreGrade = scoreToGrade(finalScore);
  const finalGrade = resolveFinalGrade(scoreGrade, overrides);

  return {
    baseScore: 100,
    dataDeduction,
    toolDeduction,
    noticeDeduction,
    managementDeduction,
    rawScore,
    finalScore,
    scoreGrade,
    finalGrade,
    overrides,
  };
}
