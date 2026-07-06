import type {
  ValidationCase,
  ValidationResult,
  ValidationRunRecord,
  ValidationRunSummary,
} from "@/lib/validation/types";

function timestampForFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildValidationExportPayload(
  results: ValidationResult[],
  cases: ValidationCase[],
  summary: ValidationRunSummary,
): ValidationRunRecord {
  const now = new Date().toISOString();
  return {
    runId: `run_${Date.now()}`,
    startedAt: results[0]?.startedAt ?? now,
    completedAt: results[results.length - 1]?.completedAt ?? now,
    results: results.map((result) => ({
      ...result,
      report: undefined,
      normalizedForm: result.normalizedForm,
    })),
    summary,
  };
}

export function validationResultsToJson(
  results: ValidationResult[],
  cases: ValidationCase[],
  summary: ValidationRunSummary,
): string {
  return JSON.stringify(buildValidationExportPayload(results, cases, summary), null, 2);
}

export function validationResultsToCsv(
  results: ValidationResult[],
  cases: ValidationCase[],
): string {
  const caseMap = new Map(cases.map((c) => [c.id, c]));
  const headers = [
    "status",
    "caseName",
    "url",
    "expectedPlatform",
    "actualPlatform",
    "expectedExtractor",
    "actualExtractor",
    "expectedMinQuestionCount",
    "actualQuestionCount",
    "expectedRiskGrade",
    "actualRiskGrade",
    "expectedIsLimited",
    "actualIsLimited",
    "actualDataLevel",
    "mismatchSummary",
    "warnings",
  ];

  const rows = results.map((result) => {
    const expected = caseMap.get(result.caseId);
    return [
      result.status,
      result.caseName,
      result.url,
      expected?.expectedPlatform ?? "",
      result.actualPlatform,
      expected?.expectedExtractor ?? "",
      result.actualExtractor,
      expected?.expectedMinQuestionCount ?? "",
      result.actualQuestionCount,
      expected?.expectedRiskGrade ?? "",
      result.actualRiskGrade ?? "",
      expected?.expectedIsLimited ?? "",
      result.actualIsLimited,
      result.actualDataLevel ?? "",
      result.mismatches.join("; "),
      result.warnings.join("; "),
    ]
      .map(escapeCsv)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export async function copyValidationJson(
  results: ValidationResult[],
  cases: ValidationCase[],
  summary: ValidationRunSummary,
): Promise<void> {
  await navigator.clipboard.writeText(
    validationResultsToJson(results, cases, summary),
  );
}

export function downloadValidationJson(
  results: ValidationResult[],
  cases: ValidationCase[],
  summary: ValidationRunSummary,
): void {
  const blob = new Blob([validationResultsToJson(results, cases, summary)], {
    type: "application/json",
  });
  triggerDownload(blob, `sure-check-validation-results-${timestampForFilename()}.json`);
}

export function downloadValidationCsv(
  results: ValidationResult[],
  cases: ValidationCase[],
): void {
  const blob = new Blob([validationResultsToCsv(results, cases)], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, `sure-check-validation-results-${timestampForFilename()}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
