/**
 * Public /cases disclosure policy.
 * Approved individual cases only — never dump admin internals.
 */

export type PublicCaseStatus =
  | "private"
  | "reviewing"
  | "published"
  | "paused"
  | "archived";

export const PUBLIC_CASE_STATUSES: PublicCaseStatus[] = [
  "private",
  "reviewing",
  "published",
  "paused",
  "archived",
];

export const PUBLIC_CASE_STATUS_KO: Record<PublicCaseStatus, string> = {
  private: "미등록",
  reviewing: "공개검토",
  published: "공개중",
  paused: "공개중지",
  archived: "보관",
};

export const PUBLIC_CASE_DISCLAIMER =
  "본 페이지는 공개 설문 화면에 대한 자동진단 기반 공개 검토 사례입니다. 개별 설문의 위법 여부를 확정하는 자료가 아니며, 최종 판단은 사실관계 확인 및 관련 법령 검토에 따라 달라질 수 있습니다.";

export const PUBLIC_CASE_CAUTION =
  "자동진단 기반 공개 검토 사례이며 위반 확정이 아닙니다. 표현은 위반 소지, 확인 필요, 개선 필요로 해석하세요.";

export const PUBLIC_CASE_FORBIDDEN_KEYS = [
  "storage_path",
  "storage_bucket",
  "signedUrl",
  "signed_url",
  "report_json",
  "reportJson",
  "reviewer_note",
  "reviewerNote",
  "resolution_note",
  "resolutionNote",
  "survey_record_id",
  "surveyRecordId",
  "scan_job_id",
  "scanJobId",
  "scan_report_id",
  "scanReportId",
  "question_label",
  "question_text",
  "questionLabel",
  "matched_keyword",
  "matchedKeyword",
  "sha256",
  "mime_type",
  "byte_size",
  "operator_name",
  "operatorName",
  "final_url",
  "finalUrl",
] as const;

const FORBIDDEN_KEY_SET = new Set(
  PUBLIC_CASE_FORBIDDEN_KEYS.map((k) => k.toLowerCase()),
);

const FORBIDDEN_VALUE_HINTS = [
  "supabase.co/storage",
  "token=",
  "signedurl",
] as const;

const FORBIDDEN_WORDING = [/위반\s*확정/, /불법/];

export interface PublicCaseSafetyResult {
  ok: boolean;
  violations: string[];
}

function walk(value: unknown, path: string, violations: string[]): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, violations));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      const nextPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_KEY_SET.has(lower)) {
        violations.push(`forbidden key: ${nextPath}`);
      }
      walk(child, nextPath, violations);
    }
    return;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    for (const hint of FORBIDDEN_VALUE_HINTS) {
      if (lower.includes(hint)) {
        violations.push(`forbidden value hint (${hint}): ${path}`);
      }
    }
    if (path.toLowerCase().includes("storage") && /evidence\//i.test(value)) {
      violations.push(`storage path-like value: ${path}`);
    }
    for (const re of FORBIDDEN_WORDING) {
      if (re.test(value) && !/위반 확정이 아닙/.test(value)) {
        violations.push(`forbidden wording (${re}): ${path}`);
      }
    }
  }
}

export function checkPublicCaseSafe(payload: unknown): PublicCaseSafetyResult {
  const violations: string[] = [];
  walk(payload, "", violations);
  return { ok: violations.length === 0, violations };
}

export function assertPublicCaseSafe(payload: unknown): void {
  const result = checkPublicCaseSafe(payload);
  if (!result.ok) {
    throw new Error(
      `Public case payload is not safe:\n${result.violations.join("\n")}`,
    );
  }
}

export function isPubliclyListedCase(input: {
  publicCaseStatus?: string | null;
  publicId?: string | null;
}): boolean {
  return (
    input.publicCaseStatus === "published" &&
    Boolean(input.publicId && String(input.publicId).trim())
  );
}

export function normalizePublicCaseStatus(
  value: string | null | undefined,
): PublicCaseStatus {
  if (
    value === "private" ||
    value === "reviewing" ||
    value === "published" ||
    value === "paused" ||
    value === "archived"
  ) {
    return value;
  }
  return "private";
}

export function publicCaseStatusKo(
  status: string | null | undefined,
): string {
  return PUBLIC_CASE_STATUS_KO[normalizePublicCaseStatus(status)];
}

export function publicCaseStatusBadgeClass(
  status: string | null | undefined,
): string {
  switch (normalizePublicCaseStatus(status)) {
    case "published":
      return "bg-teal-100 text-teal-900 border-teal-200";
    case "paused":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "reviewing":
      return "bg-sky-100 text-sky-900 border-sky-200";
    case "archived":
      return "bg-slate-200 text-slate-700 border-slate-300";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}
