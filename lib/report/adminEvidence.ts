import type { SupabaseClient } from "@supabase/supabase-js";

export const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  temporary_zip: "신고용 ZIP",
  key_screenshot: "핵심 캡처",
  notice_screenshot: "고지문 캡처",
  pii_question_screenshot: "개인정보 문항 캡처",
  sensitive_question_screenshot: "민감정보 문항 캡처",
  high_risk_question_screenshot: "고위험정보 문항 캡처",
  summary_document: "요약 문서",
  metadata: "메타데이터",
};

export function evidenceTypeLabel(evidenceType: string): string {
  return EVIDENCE_TYPE_LABEL[evidenceType] || evidenceType;
}

export type EvidenceEmptyKind = "none" | "capture_only" | "files_present";

export interface EvidenceEmptyState {
  kind: EvidenceEmptyKind;
  title: string;
  detail: string;
}

export function buildEvidenceEmptyState(input: {
  captureJobCount: number;
  evidenceFileCount: number;
}): EvidenceEmptyState {
  if (input.evidenceFileCount > 0) {
    return {
      kind: "files_present",
      title: "",
      detail: "",
    };
  }
  if (input.captureJobCount > 0) {
    return {
      kind: "capture_only",
      title: "캡처 작업 기록은 있으나 저장된 증빙 파일이 없습니다.",
      detail:
        "Storage 업로드 실패 또는 evidence_files 메타데이터 저장 실패 가능성이 있습니다.",
    };
  }
  return {
    kind: "none",
    title: "이 진단 건에는 저장된 증빙자료가 없습니다.",
    detail:
      "증빙 저장 기능 적용 전 진단된 건이거나, 신고용 전체 캡처가 실행되지 않았을 수 있습니다.",
  };
}

interface CaptureJobRow {
  id: string;
  survey_record_id: string | null;
  scan_job_id: string;
  capture_mode: string | null;
  status: string;
  completeness: string | null;
  captured_page_count: number | null;
  key_evidence_count: number | null;
  temporary_answers_used: boolean | null;
  final_submit_detected: boolean | null;
  final_submit_clicked: boolean | null;
  path_scope: string | null;
  stop_reason: string | null;
  limitations: string[] | null;
  created_at?: string;
}

interface EvidenceFileRow {
  id: string;
  survey_record_id: string | null;
  scan_job_id: string | null;
  capture_job_id: string | null;
  evidence_type: string;
  is_key_evidence: boolean;
  retention_level: string;
  mime_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  label: string | null;
  expires_at: string | null;
  page_number: number | null;
  created_at?: string;
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.id, row);
  return [...map.values()];
}

/**
 * Load capture_jobs linked by survey_record_id and/or scan_job_id.
 */
export async function loadAdminCaptureJobs(
  supabase: SupabaseClient,
  surveyRecordId: string,
  scanJobId: string | null,
): Promise<CaptureJobRow[]> {
  const selectCols =
    "id, survey_record_id, scan_job_id, capture_mode, status, completeness, captured_page_count, key_evidence_count, temporary_answers_used, final_submit_detected, final_submit_clicked, path_scope, stop_reason, limitations, created_at";

  const queries = [
    supabase
      .from("capture_jobs")
      .select(selectCols)
      .eq("survey_record_id", surveyRecordId)
      .order("created_at", { ascending: false }),
  ];
  if (scanJobId) {
    queries.push(
      supabase
        .from("capture_jobs")
        .select(selectCols)
        .eq("scan_job_id", scanJobId)
        .order("created_at", { ascending: false }),
    );
  }

  const results = await Promise.all(queries);
  for (const res of results) {
    if (res.error) throw new Error(`capture_jobs: ${res.error.message}`);
  }
  return dedupeById(
    results.flatMap((res) => (res.data || []) as CaptureJobRow[]),
  ).sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || "")),
  );
}

/**
 * Load evidence_files with fallback:
 * 1) survey_record_id
 * 2) scan_job_id
 * 3) capture_job_id(s)
 */
export async function loadAdminEvidenceFiles(
  supabase: SupabaseClient,
  surveyRecordId: string,
  scanJobId: string | null,
  captureJobIds: string[],
): Promise<EvidenceFileRow[]> {
  const selectCols =
    "id, survey_record_id, scan_job_id, capture_job_id, evidence_type, is_key_evidence, retention_level, mime_type, byte_size, sha256, label, expires_at, page_number, created_at";

  const queries = [
    supabase
      .from("evidence_files")
      .select(selectCols)
      .eq("survey_record_id", surveyRecordId)
      .order("created_at", { ascending: true }),
  ];
  if (scanJobId) {
    queries.push(
      supabase
        .from("evidence_files")
        .select(selectCols)
        .eq("scan_job_id", scanJobId)
        .order("created_at", { ascending: true }),
    );
  }
  if (captureJobIds.length > 0) {
    queries.push(
      supabase
        .from("evidence_files")
        .select(selectCols)
        .in("capture_job_id", captureJobIds)
        .order("created_at", { ascending: true }),
    );
  }

  const results = await Promise.all(queries);
  for (const res of results) {
    if (res.error) throw new Error(`evidence_files: ${res.error.message}`);
  }

  return dedupeById(
    results.flatMap((res) => (res.data || []) as EvidenceFileRow[]),
  ).sort((a, b) => {
    // ZIP first, then key evidence, then others
    const rank = (type: string) =>
      type === "temporary_zip" ? 0 : type.includes("screenshot") ? 1 : 2;
    const diff = rank(a.evidence_type) - rank(b.evidence_type);
    if (diff !== 0) return diff;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}
