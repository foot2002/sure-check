import type { AnalysisResult } from "@/lib/types/analyzer";
import type { AnalyzerTrace, AnalyzerTraceStep } from "@/lib/types/debug";
import type { ScanReport } from "@/lib/types/scan";
import { GRADE_LABELS } from "@/lib/utils/grade";

function step(
  id: string,
  title: string,
  summary: string,
  details: string[],
): AnalyzerTraceStep {
  return { id, title, summary, details };
}

export function buildAnalyzerTrace(analysis: AnalysisResult): AnalyzerTrace {
  const missingNotices = analysis.complianceGaps.filter((gap) => gap.status !== "present");
  const managementIssues = analysis.management.items.filter(
    (item) => item.status !== "confirmed",
  );

  const steps: AnalyzerTraceStep[] = [
    step(
      "context",
      "1. 주체·목적 판단",
      analysis.context.summary,
      [
        `맥락 라벨: ${analysis.context.labels.join(", ") || "없음"}`,
        `subjectType: ${analysis.context.subjectType}`,
        `publicSectorDetected: ${analysis.context.publicSectorDetected}`,
        `publicSectorConfidence: ${analysis.context.publicSectorConfidence}`,
        ...(analysis.context.publicSectorEvidence.length > 0
          ? [`공공부문 근거: ${analysis.context.publicSectorEvidence.join(" | ")}`]
          : []),
        ...(analysis.context.detectedOrganizations.length > 0
          ? [`탐지 기관: ${analysis.context.detectedOrganizations.join(", ")}`]
          : []),
      ],
    ),
    step(
      "data_risk",
      "2. 수집정보 위험 판단",
      `${analysis.dataRisk.level} (${analysis.dataRisk.levelLabel})`,
      [
        ...(analysis.dataRisk.detectedItems.length > 0
          ? analysis.dataRisk.detectedItems
          : ["탐지된 개인정보 항목 없음"]),
      ],
    ),
    step(
      "tool_risk",
      "3. 도구·처리경로 위험 판단",
      `${analysis.toolRisk.levelLabel} (${analysis.toolRisk.level})`,
      [analysis.toolRisk.description],
    ),
    step(
      "obligations",
      "4. 필요한 고지·동의 항목 산출",
      `필수 의무 ${analysis.obligations.length}건`,
      analysis.obligations.map((item) => `${item.label}: ${item.reason}`),
    ),
    step(
      "notice_compliance",
      "5. 실제 고지 충족 여부",
      missingNotices.length > 0
        ? `미충족/확인 필요 ${missingNotices.length}건`
        : "필요 고지 항목 충족",
      missingNotices.length > 0
        ? missingNotices.map(
            (gap) => `${gap.label} [${gap.status}]: ${gap.detail}`,
          )
        : analysis.complianceGaps.map((gap) => `${gap.label}: ${gap.status}`),
    ),
    step(
      "management",
      "6. 관리·운영 위험",
      analysis.management.summary,
      managementIssues.length > 0
        ? managementIssues.map((item) => `${item.label} [${item.status}]: ${item.detail}`)
        : analysis.management.items.map((item) => `${item.label}: ${item.status}`),
    ),
    step(
      "overrides",
      "7. 최소등급 강제 룰",
      analysis.overrides.length > 0
        ? `${analysis.overrides.length}건 적용`
        : "적용 없음",
      analysis.overrides.length > 0
        ? analysis.overrides.map(
            (override) => `${override.ruleId} → ${override.minGrade}: ${override.reason}`,
          )
        : ["점수 기반 등급만 사용"],
    ),
    step(
      "score",
      "8. 최종 점수·등급",
      `${GRADE_LABELS[analysis.score.finalGrade]} (${analysis.score.finalScore}점)`,
      [
        `rawScore: ${analysis.score.rawScore}`,
        `scoreGrade: ${analysis.score.scoreGrade}`,
        `dataDeduction: ${analysis.score.dataDeduction}`,
        `toolDeduction: ${analysis.score.toolDeduction}`,
        `noticeDeduction: ${analysis.score.noticeDeduction}`,
        `managementDeduction: ${analysis.score.managementDeduction}`,
      ],
    ),
  ];

  return { steps };
}

export function buildLimitedAnalyzerTrace(report: ScanReport): AnalyzerTrace {
  const form = report.form;
  return {
    steps: [
      step(
        "extraction",
        "1. 추출 상태",
        report.isLimited ? "진단 제한 (문항 추출 불가 또는 미완료)" : "부분 추출",
        [
          `extractor: ${form.platform}`,
          `questionCount: ${form.questions.length}`,
          `partialScan: ${Boolean(form.partialScan)}`,
          `isLimited: ${Boolean(form.isLimited)}`,
          ...(form.limitedReason ? [`limitedReason: ${form.limitedReason}`] : []),
        ],
      ),
      step(
        "analysis",
        "2. 룰엔진 분석",
        "문항이 없어 전체 analyzer trace를 생성하지 않았습니다.",
        report.limitationReasons ?? [],
      ),
    ],
  };
}
