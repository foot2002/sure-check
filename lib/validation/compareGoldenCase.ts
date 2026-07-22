import type { RiskGrade, ScanReport } from "@/lib/types/scan";
import type { AudienceReport, VerdictType } from "@/lib/reporting/reportMessages";
import { RESPONDENT_DECISION_LABELS } from "@/lib/reporting/reportMessages";
import type { GoldenCase, GoldenExpectedDataItems } from "@/lib/validation/goldenCases";
import { deriveContextFromReport } from "@/lib/validation/mapActualFromReport";
import type { ValidationResultStatus } from "@/lib/validation/types";

export interface GoldenActualValues {
  decision: VerdictType;
  decisionLabel: string;
  score: number | null;
  grade?: RiskGrade;
  isLimited: boolean;
  context: string;
  dataItems: GoldenExpectedDataItems;
  operatorFixes: string[];
  reportText: string;
}

export interface GoldenCaseResult extends GoldenActualValues {
  caseId: string;
  caseName: string;
  scenarioType: GoldenCase["scenarioType"];
  startedAt: string;
  completedAt: string;
  status: ValidationResultStatus;
  success: boolean;
  matched: string[];
  mismatches: string[];
  warnings: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function includesOneOf<T extends string>(actual: T, expected?: T | T[]): boolean {
  if (!expected) return true;
  const expectedList = Array.isArray(expected) ? expected : [expected];
  return expectedList.includes(actual);
}

function formatExpected<T extends string>(expected?: T | T[]): string {
  if (!expected) return "";
  return (Array.isArray(expected) ? expected : [expected]).join(", ");
}

function allDataItems(items: GoldenExpectedDataItems): string[] {
  return [
    ...(items.directIdentifiers ?? []),
    ...(items.quasiIdentifiers ?? []),
    ...(items.generalOpinions ?? []),
    ...(items.sensitiveItems ?? []),
    ...(items.highRiskItems ?? []),
  ];
}

function hasText(haystack: string[], needle: string): boolean {
  return haystack.some((item) => item.includes(needle));
}

function matchExpectedItems(
  label: string,
  expected: string[] | undefined,
  actual: string[] | undefined,
  matched: string[],
  mismatches: string[],
): void {
  if (!expected || expected.length === 0) return;
  const actualList = actual ?? [];

  for (const item of expected) {
    if (hasText(actualList, item)) {
      matched.push(`${label}: ${item}`);
    } else {
      mismatches.push(`${label} 누락: ${item}`);
    }
  }
}

function buildReportText(report: ScanReport, audience: AudienceReport): string {
  return [
    report.summary,
    report.debug?.contextSummary,
    ...(report.debug?.publicSectorEvidence ?? []),
    ...(report.sections.detectedPersonalData ?? []),
    ...(report.sections.respondentGuidance ?? []),
    ...(report.sections.operatorRecommendations ?? []),
    ...(report.findings.flatMap((finding) => [
      finding.title,
      finding.description,
      finding.recommendation,
      ...(finding.evidence ?? []),
    ])),
    audience.respondentDecisionTitle,
    audience.respondentDecisionSummary,
    audience.privacyAssessment.conclusion,
    audience.privacyAssessment.inclusionSummary,
    audience.privacyAssessment.respondentAdvice,
    audience.privacyAssessment.statusBadge,
    audience.privacyAssessment.scoreEvaluation,
    audience.privacyAssessment.highRiskNote,
    audience.decisionSummary.headline,
    audience.decisionSummary.actionLabel,
    audience.decisionSummary.reportRecommendation,
    audience.decisionSummary.statusBadge,
    ...audience.decisionSummary.primaryReasons,
    audience.safetyType.displayName,
    audience.safetyType.typeName,
    audience.safetyType.headline,
    audience.safetyType.description,
    audience.safetyType.action,
    audience.safetyType.subjectLabel,
    audience.safetyType.dataBadge,
    audience.safetyType.toolBadge,
    audience.safetyType.toolJudgmentBadge,
    audience.safetyType.reportOrInquireLabel,
    audience.operatorImprovement.tool.summary,
    ...audience.operatorImprovement.tool.platformNotes,
    ...audience.operatorImprovement.tool.certificationCards.flatMap((card) => [
      card.title,
      card.description,
      card.note,
      card.disclaimer,
    ]),
    ...audience.operatorImprovement.noticeItems.flatMap((item) => [
      item.title,
      item.detail,
    ]),
    ...audience.operatorImprovement.questionItems.flatMap((item) => [
      item.title,
      item.detail,
    ]),
    ...audience.operatorImprovement.managementItems.flatMap((item) => [
      item.title,
      item.detail,
    ]),
    ...audience.operatorImprovement.topFixes.flatMap((fix) => [
      fix.title,
      fix.reason,
      fix.action,
    ]),
    audience.operatorImprovement.coreProblems.summaryLine,
    ...audience.operatorImprovement.coreProblems.problems.flatMap((problem) => [
      problem.title,
      problem.why,
      problem.action,
      problem.severityLabel,
      ...problem.basisLabels,
    ]),
    ...audience.operatorImprovement.legalBasisDetails.flatMap((basis) => [
      basis.label,
      basis.description,
    ]),
    ...audience.legalCheckSummary.severeViolationSuspicions.map((item) => item.label),
    ...audience.legalCheckSummary.checkRequiredItems.map((item) => item.label),
    ...audience.legalCheckSummary.improvementRecommendations.map((item) => item.label),
    ...audience.legalCheckSummary.passedItems.map((item) => item.label),
    audience.toolGovernanceSummary.title,
    audience.toolGovernanceSummary.body,
    audience.toolGovernanceSummary.certificationRecommendation,
    audience.toolGovernanceSummary.certificationReason,
    ...audience.toolGovernanceSummary.bullets,
    audience.privacyAssessment.certificationNotice?.title,
    audience.privacyAssessment.certificationNotice?.body,
    audience.privacyAssessment.certificationNotice?.contextNote,
    audience.publicSectorCsapWarning?.title,
    audience.publicSectorCsapWarning?.body,
    audience.publicSectorCsapWarning?.strongRecommendation,
    audience.publicSectorCsapWarning?.platformNote,
    audience.publicSectorCsapWarning?.toolStatusLabel,
    audience.publicSectorCsapWarning?.csapExplanation.title,
    audience.publicSectorCsapWarning?.csapExplanation.body,
    audience.publicSectorCsapWarning?.csapExplanation.disclaimer,
    ...(audience.publicSectorCsapWarning?.csapExplanation.bullets ?? []),
    audience.privateSectorSecurityCertWarning?.title,
    audience.privateSectorSecurityCertWarning?.body,
    audience.privateSectorSecurityCertWarning?.strongRecommendation,
    audience.privateSectorSecurityCertWarning?.sensitiveDataNote,
    audience.privateSectorSecurityCertWarning?.certificationDisclaimer,
    audience.privateSectorSecurityCertWarning?.platformNote,
    audience.privateSectorSecurityCertWarning?.toolStatusLabel,
    audience.privateSectorSecurityCertWarning?.explanationSectionTitle,
    ...(audience.privateSectorSecurityCertWarning?.certificationCards.flatMap(
      (card) => [card.title, card.description, card.privateSectorNote, card.disclaimer, ...card.bullets],
    ) ?? []),
    ...audience.privacyAssessment.quickActions,
    ...audience.respondentReasons,
    ...audience.operatorTopFixes.flatMap((fix) => [fix.title, fix.reason, fix.action]),
    ...allDataItems(audience.collectedDataSummary),
    ...audience.respondentDoList,
    ...audience.respondentDontList,
    audience.operatorSummary,
    ...audience.requiredFixes.flatMap((fix) => [fix.title, fix.reason, fix.action]),
    ...audience.recommendedFixes.flatMap((fix) => [fix.title, fix.reason, fix.action]),
    ...audience.riskDimensions.flatMap((dimension) => [
      dimension.title,
      dimension.label,
      dimension.description,
    ]),
    ...audience.keyReasons.flatMap((reason) => [
      reason.title,
      reason.description,
      ...reason.evidence,
    ]),
    audience.noticeSummary,
    audience.detailsSummary,
    report.score == null ? "점수 산정 불가" : `${report.score}점`,
    report.isLimited ? "진단 제한" : "",
    report.grade ? report.grade : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildGoldenActualValues(
  report: ScanReport,
  audience: AudienceReport,
): GoldenActualValues {
  return {
    decision: audience.respondentDecision,
    decisionLabel: RESPONDENT_DECISION_LABELS[audience.respondentDecision],
    score: report.score ?? null,
    grade: report.grade,
    isLimited: Boolean(report.isLimited ?? report.form.isLimited),
    context: deriveContextFromReport(report),
    dataItems: audience.collectedDataSummary,
    operatorFixes: unique([
      ...audience.requiredFixes.flatMap((fix) => [fix.title, fix.action]),
      ...audience.recommendedFixes.flatMap((fix) => [fix.title, fix.action]),
    ]),
    reportText: buildReportText(report, audience),
  };
}

export function compareGoldenCase(
  goldenCase: GoldenCase,
  report: ScanReport,
  audience: AudienceReport,
  startedAt: string,
): GoldenCaseResult {
  const actual = buildGoldenActualValues(report, audience);
  const matched: string[] = [];
  const mismatches: string[] = [];
  const warnings: string[] = [];

  if (goldenCase.expectedDecision) {
    if (includesOneOf(actual.decision, goldenCase.expectedDecision)) {
      matched.push(`응답 판단: ${actual.decisionLabel}`);
    } else {
      mismatches.push(
        `응답 판단 불일치: expected ${formatExpected(goldenCase.expectedDecision)}, actual ${actual.decision}`,
      );
    }
  }

  if (goldenCase.expectedIsLimited !== undefined) {
    if (actual.isLimited === goldenCase.expectedIsLimited) {
      matched.push(`진단 제한 여부: ${actual.isLimited}`);
    } else {
      mismatches.push(
        `진단 제한 여부 불일치: expected ${goldenCase.expectedIsLimited}, actual ${actual.isLimited}`,
      );
    }
  }

  const gradeRange = goldenCase.expectedGradeRange;
  if (gradeRange) {
    if (gradeRange.minScore !== undefined || gradeRange.maxScore !== undefined) {
      if (actual.score == null) {
        mismatches.push("점수 없음");
      } else if (
        (gradeRange.minScore !== undefined && actual.score < gradeRange.minScore) ||
        (gradeRange.maxScore !== undefined && actual.score > gradeRange.maxScore)
      ) {
        mismatches.push(
          `점수 범위 불일치: expected ${gradeRange.minScore ?? "-∞"}~${gradeRange.maxScore ?? "∞"}, actual ${actual.score}`,
        );
      } else {
        matched.push(`점수 범위: ${actual.score}`);
      }
    }

    if (gradeRange.allowedGrades && gradeRange.allowedGrades.length > 0) {
      if (actual.grade && gradeRange.allowedGrades.includes(actual.grade)) {
        matched.push(`등급: ${actual.grade}`);
      } else {
        mismatches.push(
          `등급 불일치: expected ${gradeRange.allowedGrades.join(", ")}, actual ${actual.grade ?? "none"}`,
        );
      }
    } else if (actual.isLimited && !actual.grade) {
      matched.push("제한 리포트 위험등급 없음");
    }
  }

  matchExpectedItems(
    "직접식별정보",
    goldenCase.expectedDataItems?.directIdentifiers,
    actual.dataItems.directIdentifiers,
    matched,
    mismatches,
  );
  matchExpectedItems(
    "준식별정보",
    goldenCase.expectedDataItems?.quasiIdentifiers,
    actual.dataItems.quasiIdentifiers,
    matched,
    mismatches,
  );
  matchExpectedItems(
    "일반 의견/선호도",
    goldenCase.expectedDataItems?.generalOpinions,
    actual.dataItems.generalOpinions,
    matched,
    mismatches,
  );
  matchExpectedItems(
    "민감정보",
    goldenCase.expectedDataItems?.sensitiveItems,
    actual.dataItems.sensitiveItems,
    matched,
    mismatches,
  );
  matchExpectedItems(
    "고위험정보",
    goldenCase.expectedDataItems?.highRiskItems,
    actual.dataItems.highRiskItems,
    matched,
    mismatches,
  );

  const actualDataItems = allDataItems(actual.dataItems);
  for (const item of goldenCase.expectedNotDataItems ?? []) {
    if (hasText(actualDataItems, item)) {
      mismatches.push(`표시 금지 데이터 항목 포함: ${item}`);
    } else {
      matched.push(`표시 금지 데이터 항목 없음: ${item}`);
    }
  }

  if (goldenCase.expectedContext) {
    if (includesOneOf(actual.context, goldenCase.expectedContext)) {
      matched.push(`context: ${actual.context}`);
    } else {
      mismatches.push(
        `context 불일치: expected ${formatExpected(goldenCase.expectedContext)}, actual ${actual.context}`,
      );
    }
  }

  for (const fix of goldenCase.expectedOperatorFixes?.required ?? []) {
    if (hasText(actual.operatorFixes, fix)) matched.push(`필수 보완: ${fix}`);
    else mismatches.push(`필수 보완 누락: ${fix}`);
  }
  for (const fix of goldenCase.expectedOperatorFixes?.recommended ?? []) {
    if (hasText(actual.operatorFixes, fix)) matched.push(`권장 보완: ${fix}`);
    else mismatches.push(`권장 보완 누락: ${fix}`);
  }
  for (const fix of goldenCase.expectedOperatorFixes?.any ?? []) {
    if (hasText(actual.operatorFixes, fix)) matched.push(`운영자 보완: ${fix}`);
    else mismatches.push(`운영자 보완 누락: ${fix}`);
  }

  for (const phrase of goldenCase.requiredPhrases ?? []) {
    if (actual.reportText.includes(phrase)) matched.push(`필수 문구: ${phrase}`);
    else mismatches.push(`필수 문구 누락: ${phrase}`);
  }

  for (const phrase of goldenCase.forbiddenPhrases ?? []) {
    if (actual.reportText.includes(phrase)) {
      mismatches.push(`금지 문구 포함: ${phrase}`);
    } else {
      matched.push(`금지 문구 없음: ${phrase}`);
    }
  }

  const status: ValidationResultStatus =
    mismatches.length > 0 ? "fail" : warnings.length > 0 ? "partial" : "pass";

  return {
    caseId: goldenCase.id,
    caseName: goldenCase.name,
    scenarioType: goldenCase.scenarioType,
    startedAt,
    completedAt: new Date().toISOString(),
    status,
    success: status === "pass" || status === "partial",
    matched,
    mismatches,
    warnings,
    ...actual,
  };
}
