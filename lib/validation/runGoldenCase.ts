import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import type { GoldenCase } from "@/lib/validation/goldenCases";
import { GOLDEN_CASES } from "@/lib/validation/goldenCases";
import { compareGoldenCase, type GoldenCaseResult } from "@/lib/validation/compareGoldenCase";
import type { ValidationRunSummary } from "@/lib/validation/types";
import type { NormalizedForm } from "@/lib/types/scan";

const GOLDEN_RUN_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneForm(form: NormalizedForm): NormalizedForm {
  return JSON.parse(JSON.stringify(form)) as NormalizedForm;
}

function timestampForFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export async function runGoldenCase(goldenCase: GoldenCase): Promise<GoldenCaseResult> {
  const startedAt = new Date().toISOString();

  if (!goldenCase.sampleNormalizedForm) {
    return {
      caseId: goldenCase.id,
      caseName: goldenCase.name,
      scenarioType: goldenCase.scenarioType,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "error",
      success: false,
      matched: [],
      mismatches: ["sampleNormalizedForm이 없습니다."],
      warnings: [],
      decision: "check_before_responding",
      decisionLabel: "확인 후 응답",
      score: null,
      isLimited: true,
      context: "unknown",
      dataItems: {},
      operatorFixes: [],
      reportText: "",
    };
  }

  try {
    const form = cloneForm(goldenCase.sampleNormalizedForm);
    const report = analyzeForm(
      form,
      `golden_${goldenCase.id}_${Date.now()}`,
      goldenCase.sampleUrl ?? form.url,
      "generic_unknown_warning",
      {
        normalizedUrl: goldenCase.sampleUrl ?? form.url,
        finalUrl: goldenCase.sampleUrl ?? form.url,
      },
    );
    const audience = composeAudienceReport(report);

    return compareGoldenCase(goldenCase, report, audience, startedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return {
      caseId: goldenCase.id,
      caseName: goldenCase.name,
      scenarioType: goldenCase.scenarioType,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "error",
      success: false,
      matched: [],
      mismatches: [message],
      warnings: [],
      decision: "check_before_responding",
      decisionLabel: "확인 후 응답",
      score: null,
      isLimited: true,
      context: "unknown",
      dataItems: {},
      operatorFixes: [],
      reportText: message,
    };
  }
}

export async function runGoldenCases(
  cases: GoldenCase[] = GOLDEN_CASES,
  onCaseUpdate?: (
    caseId: string,
    phase: "running" | "done",
    result?: GoldenCaseResult,
  ) => void,
): Promise<GoldenCaseResult[]> {
  const results: GoldenCaseResult[] = [];

  for (let index = 0; index < cases.length; index += 1) {
    const goldenCase = cases[index];
    onCaseUpdate?.(goldenCase.id, "running");
    const result = await runGoldenCase(goldenCase);
    results.push(result);
    onCaseUpdate?.(goldenCase.id, "done", result);
    if (index < cases.length - 1) {
      await delay(GOLDEN_RUN_DELAY_MS);
    }
  }

  return results;
}

export function buildGoldenSummary(results: GoldenCaseResult[]): ValidationRunSummary {
  const passed = results.filter((r) => r.status === "pass").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  const scored = results
    .map((result) => result.score)
    .filter((score): score is number => typeof score === "number");

  return {
    total: results.length,
    passed,
    partial,
    failed,
    skipped,
    errors,
    averageQuestionCount: 0,
    limitedCount: results.filter((r) => r.isLimited).length,
    platformSuccessRates: {
      golden: {
        total: results.length,
        passed: passed + partial,
        rate:
          results.length > 0
            ? Math.round(((passed + partial) / results.length) * 100)
            : 0,
      },
      score: {
        total: scored.length,
        passed: scored.length,
        rate:
          scored.length > 0
            ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length)
            : 0,
      },
    },
  };
}

export function goldenResultsToJson(
  results: GoldenCaseResult[],
  cases: GoldenCase[] = GOLDEN_CASES,
): string {
  return JSON.stringify(
    {
      runId: `golden_${Date.now()}`,
      startedAt: results[0]?.startedAt ?? new Date().toISOString(),
      completedAt: results[results.length - 1]?.completedAt ?? new Date().toISOString(),
      summary: buildGoldenSummary(results),
      cases: cases.map((goldenCase) => ({
        id: goldenCase.id,
        name: goldenCase.name,
        scenarioType: goldenCase.scenarioType,
        expectedDecision: goldenCase.expectedDecision,
        expectedGradeRange: goldenCase.expectedGradeRange,
        expectedDataItems: goldenCase.expectedDataItems,
        expectedNotDataItems: goldenCase.expectedNotDataItems,
        expectedContext: goldenCase.expectedContext,
        expectedOperatorFixes: goldenCase.expectedOperatorFixes,
        forbiddenPhrases: goldenCase.forbiddenPhrases,
        requiredPhrases: goldenCase.requiredPhrases,
        notes: goldenCase.notes,
      })),
      results,
    },
    null,
    2,
  );
}

export function downloadGoldenResultsJson(results: GoldenCaseResult[]): void {
  const blob = new Blob([goldenResultsToJson(results)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sure-check-golden-results-${timestampForFilename()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
