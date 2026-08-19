/**
 * Public /report disclosure policy.
 * Aggregate-only — never expose individual survey, org names, or Storage paths.
 */

export const PUBLIC_REPORT_FORBIDDEN_KEYS = [
  "survey_url",
  "surveyUrl",
  "form_url",
  "final_url",
  "finalUrl",
  "captured_url",
  "storage_path",
  "storage_bucket",
  "signedUrl",
  "signed_url",
  "report_json",
  "report_summary",
  "question_label",
  "question_text",
  "operator_name",
  "survey_title",
  "matched_name",
  "evidence_text",
  "evidence_files",
  "sha256",
  "mime_type",
  "byte_size",
  "scan_job_id",
  "survey_record_id",
  "capture_job_id",
] as const;

const FORBIDDEN_KEY_SET = new Set(
  PUBLIC_REPORT_FORBIDDEN_KEYS.map((k) => k.toLowerCase()),
);

const FORBIDDEN_VALUE_HINTS = [
  "supabase.co/storage",
  "evidence/",
  "signedurl",
  "report_json",
] as const;

export interface PublicReportSafetyResult {
  ok: boolean;
  violations: string[];
}

function walk(
  value: unknown,
  path: string,
  violations: string[],
): void {
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
    const lowered = value.toLowerCase();
    for (const hint of FORBIDDEN_VALUE_HINTS) {
      if (lowered.includes(hint)) {
        violations.push(`forbidden value hint (${hint}) at ${path || "(root)"}`);
      }
    }
  }
}

export function checkPublicReportSafe(payload: unknown): PublicReportSafetyResult {
  const violations: string[] = [];
  walk(payload, "", violations);
  return { ok: violations.length === 0, violations };
}

export function assertPublicReportSafe(payload: unknown): void {
  const result = checkPublicReportSafe(payload);
  if (!result.ok) {
    throw new Error(
      `Public report payload failed safety check:\n- ${result.violations.join("\n- ")}`,
    );
  }
}

export const PUBLIC_DISCLOSURE_MESSAGE =
  "본 페이지는 자동진단 기반 사회적 모니터링 통계입니다. 개별 진단 결과는 위반 확정이 아니며, 검토 전 데이터는 ‘위반 소지’, ‘미흡’, ‘확인 필요’로 해석해야 합니다. 기관·기업명, 개별 설문 URL, 캡처 이미지, 신고용 증빙자료는 공개하지 않습니다.";
