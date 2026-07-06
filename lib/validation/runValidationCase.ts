import { compareValidationResult } from "@/lib/validation/compareValidationResult";
import { mapActualFromReport } from "@/lib/validation/mapActualFromReport";
import type { ValidationCase, ValidationResult } from "@/lib/validation/types";
import type { ValidationRunSummary } from "@/lib/validation/types";

const RUN_DELAY_MS = 500;
const POLL_INTERVAL_MS = 600;
const MAX_POLL_ATTEMPTS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startScan(url: string): Promise<string> {
  const res = await fetch("/api/scan/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formUrl: url }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "scan/start 실패");
  }
  return data.scanId as string;
}

async function waitForScanComplete(scanId: string): Promise<void> {
  let notFoundRetries = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const res = await fetch(`/api/scan/status/${scanId}`);
    if (!res.ok) {
      if (res.status === 404 && notFoundRetries < 8) {
        notFoundRetries += 1;
        await delay(POLL_INTERVAL_MS);
        continue;
      }
      throw new Error("scan/status 조회 실패");
    }

    notFoundRetries = 0;
    const job = await res.json();
    if (
      job.status === "completed" ||
      job.status === "limited" ||
      job.status === "failed"
    ) {
      return;
    }
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("scan 상태 polling 시간 초과");
}

async function fetchReport(scanId: string) {
  const res = await fetch(`/api/scan/report/${scanId}`);
  if (res.status === 202) {
    await delay(POLL_INTERVAL_MS);
    return fetchReport(scanId);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "report 조회 실패");
  }
  return res.json();
}

export { RUN_DELAY_MS };

export async function runValidationCase(
  testCase: ValidationCase,
): Promise<ValidationResult> {
  const startedAt = new Date().toISOString();

  if (!testCase.enabled) {
    return {
      caseId: testCase.id,
      caseName: testCase.name,
      url: testCase.url,
      startedAt,
      completedAt: new Date().toISOString(),
      success: false,
      status: "skipped",
      matched: [],
      mismatches: [],
      warnings: ["disabled 케이스"],
      actualPlatform: "unknown",
      actualExtractor: "Unknown",
      actualQuestionCount: 0,
      actualDetectedCategories: [],
      actualIsLimited: false,
      actualContext: "unknown",
    };
  }

  try {
    const scanId = await startScan(testCase.url);
    await waitForScanComplete(scanId);
    const report = await fetchReport(scanId);
    const actual = mapActualFromReport(report);
    const comparison = compareValidationResult(testCase, actual);

    return {
      caseId: testCase.id,
      caseName: testCase.name,
      url: testCase.url,
      startedAt,
      completedAt: new Date().toISOString(),
      ...actual,
      ...comparison,
      report,
      normalizedForm: report.form,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return {
      caseId: testCase.id,
      caseName: testCase.name,
      url: testCase.url,
      startedAt,
      completedAt: new Date().toISOString(),
      success: false,
      status: "error",
      matched: [],
      mismatches: [message],
      warnings: [],
      errorMessage: message,
      actualPlatform: "unknown",
      actualExtractor: "Unknown",
      actualQuestionCount: 0,
      actualDetectedCategories: [],
      actualIsLimited: false,
      actualContext: "unknown",
    };
  }
}

export async function runValidationCases(
  cases: ValidationCase[],
  onCaseUpdate?: (
    caseId: string,
    phase: "running" | "done",
    result?: ValidationResult,
  ) => void,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    onCaseUpdate?.(testCase.id, "running");
    const result = await runValidationCase(testCase);
    results.push(result);
    onCaseUpdate?.(testCase.id, "done", result);
    if (index < cases.length - 1) {
      await delay(RUN_DELAY_MS);
    }
  }

  return results;
}

export function buildValidationSummary(
  results: ValidationResult[],
): ValidationRunSummary {
  const executed = results.filter((r) => r.status !== "skipped");
  const passed = results.filter((r) => r.status === "pass").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  const questionCounts = executed
    .map((r) => r.actualQuestionCount)
    .filter((n) => n > 0);
  const averageQuestionCount =
    questionCounts.length > 0
      ? Math.round(
          (questionCounts.reduce((a, b) => a + b, 0) / questionCounts.length) * 10,
        ) / 10
      : 0;

  const limitedCount = executed.filter((r) => r.actualIsLimited).length;

  const platformBuckets: Record<string, { total: number; passed: number }> = {};
  for (const result of executed) {
    const platform = result.actualPlatform;
    if (!platformBuckets[platform]) {
      platformBuckets[platform] = { total: 0, passed: 0 };
    }
    platformBuckets[platform].total += 1;
    if (result.status === "pass" || result.status === "partial") {
      platformBuckets[platform].passed += 1;
    }
  }

  const platformSuccessRates: Record<
    string,
    { total: number; passed: number; rate: number }
  > = {};
  for (const [platform, bucket] of Object.entries(platformBuckets)) {
    platformSuccessRates[platform] = {
      ...bucket,
      rate: bucket.total > 0 ? Math.round((bucket.passed / bucket.total) * 100) : 0,
    };
  }

  return {
    total: results.length,
    passed,
    partial,
    failed,
    skipped,
    errors,
    averageQuestionCount,
    limitedCount,
    platformSuccessRates,
  };
}
