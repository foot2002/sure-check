import type { CaptureMode } from "@/lib/evidence/capture/captureTypes";
import { getJobWorkerConfig, isMonitoringConfigured } from "@/lib/jobs/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseMonitoringRepository } from "@/lib/repositories/SupabaseMonitoringRepository";

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

export interface QueuedCaptureJobRow {
  id: string;
  external_capture_id: string | null;
  scan_job_id: string;
  survey_record_id: string | null;
  capture_mode: CaptureMode | null;
  status: string;
  survey_url: string | null;
  final_url: string | null;
  diagnosis_external_id: string | null;
  result_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function enqueuePendingCaptureJob(input: {
  externalCaptureId: string;
  diagnosisId: string;
  surveyUrl: string;
  finalUrl: string;
  mode: CaptureMode;
}): Promise<QueuedCaptureJobRow> {
  if (!isMonitoringConfigured()) {
    throw new Error("Supabase is not configured for capture queue");
  }
  const monitoring = getSupabaseMonitoringRepository();
  const linked = await monitoring.findMonitoringIdsByExternalScanId(
    input.diagnosisId,
  );
  if (!linked) {
    throw new Error(
      `scan_jobs not found for diagnosisId=${input.diagnosisId}`,
    );
  }

  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("capture_jobs")
    .insert({
      scan_job_id: linked.scanJobId,
      survey_record_id: linked.surveyRecordId,
      capture_mode: input.mode,
      status: "pending",
      external_capture_id: input.externalCaptureId,
      survey_url: input.surveyUrl || null,
      final_url: input.finalUrl || null,
      diagnosis_external_id: input.diagnosisId,
      observed_at: now,
      observed_date_kst: kstToday(),
      queued_at: now,
      priority: input.mode === "evidence_full_walkthrough" ? 50 : 100,
      attempt_count: 0,
      captured_page_count: 0,
      key_evidence_count: 0,
      temporary_answers_used: false,
      final_submit_detected: false,
      final_submit_clicked: false,
      limitations: [],
    })
    .select(
      "id, external_capture_id, scan_job_id, survey_record_id, capture_mode, status, survey_url, final_url, diagnosis_external_id, result_json, error_message, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(
      `enqueuePendingCaptureJob: ${error?.message || "missing row"}`,
    );
  }
  return data as QueuedCaptureJobRow;
}

export async function claimNextCaptureJob(
  workerId: string,
): Promise<QueuedCaptureJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  const config = getJobWorkerConfig();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_next_capture_job", {
    p_worker_id: workerId,
    p_max_running: config.captureConcurrency,
    p_stale_seconds: Math.max(
      config.staleCaptureSeconds,
      config.captureTimeoutSeconds + 30,
    ),
  });
  if (error) {
    console.warn("[jobs] claim_next_capture_job RPC failed:", error.message);
    return claimNextCaptureJobFallback(workerId);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as QueuedCaptureJobRow | undefined) ?? null;
}

async function claimNextCaptureJobFallback(
  workerId: string,
): Promise<QueuedCaptureJobRow | null> {
  const config = getJobWorkerConfig();
  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from("capture_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");
  if ((count ?? 0) >= config.captureConcurrency) return null;

  const { data: pending } = await supabase
    .from("capture_jobs")
    .select(
      "id, external_capture_id, scan_job_id, survey_record_id, capture_mode, status, survey_url, final_url, diagnosis_external_id, result_json, error_message, created_at, updated_at",
    )
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("queued_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pending) return null;

  const { data, error } = await supabase
    .from("capture_jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      locked_by: workerId,
      last_heartbeat_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      attempt_count: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select(
      "id, external_capture_id, scan_job_id, survey_record_id, capture_mode, status, survey_url, final_url, diagnosis_external_id, result_json, error_message, created_at, updated_at",
    )
    .maybeSingle();
  if (error) throw new Error(`claimNextCaptureJobFallback: ${error.message}`);
  return (data as QueuedCaptureJobRow | null) ?? null;
}

export async function claimCaptureJobByExternalId(
  externalCaptureId: string,
  workerId: string,
): Promise<QueuedCaptureJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  const config = getJobWorkerConfig();
  const supabase = createSupabaseServerClient();

  const { count } = await supabase
    .from("capture_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  const { data: existing } = await supabase
    .from("capture_jobs")
    .select(
      "id, external_capture_id, scan_job_id, survey_record_id, capture_mode, status, survey_url, final_url, diagnosis_external_id, result_json, error_message, created_at, updated_at",
    )
    .eq("external_capture_id", externalCaptureId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) return null;
  if (
    existing.status === "success" ||
    existing.status === "partial" ||
    existing.status === "failed" ||
    existing.status === "timeout" ||
    existing.status === "skipped"
  ) {
    return existing as QueuedCaptureJobRow;
  }
  if (existing.status === "running") {
    return existing as QueuedCaptureJobRow;
  }
  if ((count ?? 0) >= config.captureConcurrency) return null;

  const { data, error } = await supabase
    .from("capture_jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      locked_by: workerId,
      last_heartbeat_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      attempt_count: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("status", "pending")
    .select(
      "id, external_capture_id, scan_job_id, survey_record_id, capture_mode, status, survey_url, final_url, diagnosis_external_id, result_json, error_message, created_at, updated_at",
    )
    .maybeSingle();
  if (error) throw new Error(`claimCaptureJobByExternalId: ${error.message}`);
  return (data as QueuedCaptureJobRow | null) ?? null;
}

export async function getCaptureJobByExternalId(
  externalCaptureId: string,
): Promise<QueuedCaptureJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("capture_jobs")
    .select(
      "id, external_capture_id, scan_job_id, survey_record_id, capture_mode, status, survey_url, final_url, diagnosis_external_id, result_json, error_message, created_at, updated_at",
    )
    .eq("external_capture_id", externalCaptureId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getCaptureJobByExternalId: ${error.message}`);
  return (data as QueuedCaptureJobRow | null) ?? null;
}

export async function updateCaptureJob(
  captureJobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!isMonitoringConfigured()) return;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("capture_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", captureJobId);
  if (error) throw new Error(`updateCaptureJob: ${error.message}`);
}
