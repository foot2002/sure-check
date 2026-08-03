import type { ScanJobStatus } from "@/lib/db/types";
import type { ScanReport, ScanStatus } from "@/lib/types/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getJobWorkerConfig, isMonitoringConfigured } from "@/lib/jobs/config";

export type ApiScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "limited";

export function toApiScanStatus(status: string | null | undefined): ApiScanStatus {
  if (status === "pending" || status === "idle") return "queued";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "limited") return "limited";
  return "failed";
}

export function toScanStatus(status: string | null | undefined): ScanStatus {
  if (status === "pending" || status === "idle") return "pending";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "limited") return "limited";
  if (status === "failed" || status === "cancelled") return "failed";
  return "pending";
}

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

export interface QueuedScanJobRow {
  id: string;
  external_scan_id: string | null;
  form_url: string | null;
  form_url_hash: string | null;
  cache_key: string | null;
  status: ScanJobStatus;
  current_step: number;
  total_steps: number;
  step_label: string | null;
  error_message: string | null;
  monitoring_saved?: boolean | null;
  evidence_stored?: boolean | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STALE_FAIL_MESSAGE =
  "작업 시간 초과로 중단되었습니다. 다시 시도해 주세요.";

export function isInProgressScanStale(
  job: Pick<QueuedScanJobRow, "created_at" | "updated_at">,
  staleSeconds = getJobWorkerConfig().staleScanSeconds,
): boolean {
  const anchor = job.updated_at || job.created_at;
  const ts = Date.parse(anchor);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > Math.max(staleSeconds, 30) * 1000;
}

/**
 * Mark zombie pending/running rows failed so they stop blocking reuse and concurrency.
 */
export async function recoverStaleScanJobs(): Promise<number> {
  if (!isMonitoringConfigured()) return 0;
  const { staleScanSeconds } = getJobWorkerConfig();
  const cutoff = new Date(
    Date.now() - Math.max(staleScanSeconds, 30) * 1000,
  ).toISOString();
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("scan_jobs")
    .update({
      status: "failed",
      error_message: STALE_FAIL_MESSAGE,
      locked_at: null,
      locked_by: null,
      completed_at: now,
      updated_at: now,
      step_label: "완료",
    })
    .in("status", ["pending", "running", "idle"])
    .lt("updated_at", cutoff)
    .select("id");
  if (error) {
    console.warn("[jobs] recoverStaleScanJobs:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export async function failStaleScanJob(job: QueuedScanJobRow): Promise<void> {
  if (!isMonitoringConfigured()) return;
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  await supabase
    .from("scan_jobs")
    .update({
      status: "failed",
      error_message: STALE_FAIL_MESSAGE,
      locked_at: null,
      locked_by: null,
      completed_at: now,
      updated_at: now,
      step_label: "완료",
    })
    .eq("id", job.id)
    .in("status", ["pending", "running", "idle"]);
}

export async function findRunningScanByCacheKey(
  cacheKey: string,
): Promise<QueuedScanJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  await recoverStaleScanJobs();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("scan_jobs")
    .select(
      "id, external_scan_id, form_url, form_url_hash, cache_key, status, current_step, total_steps, step_label, error_message, monitoring_saved, evidence_stored, completed_at, created_at, updated_at",
    )
    .eq("cache_key", cacheKey)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findRunningScanByCacheKey: ${error.message}`);
  const row = (data as QueuedScanJobRow | null) ?? null;
  if (!row) return null;
  if (isInProgressScanStale(row)) {
    await failStaleScanJob(row);
    return null;
  }
  return row;
}

export async function findCachedCompletedScan(
  cacheKey: string,
): Promise<{ job: QueuedScanJobRow; report: ScanReport } | null> {
  if (!isMonitoringConfigured()) return null;
  const { scanCacheTtlSeconds } = getJobWorkerConfig();
  const since = new Date(Date.now() - scanCacheTtlSeconds * 1000).toISOString();
  const supabase = createSupabaseServerClient();
  const { data: job, error } = await supabase
    .from("scan_jobs")
    .select(
      "id, external_scan_id, form_url, form_url_hash, cache_key, status, current_step, total_steps, step_label, error_message, monitoring_saved, evidence_stored, completed_at, created_at, updated_at",
    )
    .eq("cache_key", cacheKey)
    .eq("status", "completed")
    .gte("completed_at", since)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findCachedCompletedScan: ${error.message}`);
  if (!job?.id) return null;

  const { data: reportRow, error: reportError } = await supabase
    .from("scan_reports")
    .select("report_json")
    .eq("scan_job_id", job.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportError) {
    throw new Error(`findCachedCompletedScan.report: ${reportError.message}`);
  }
  const report = reportRow?.report_json as ScanReport | undefined;
  if (!report || typeof report !== "object") return null;

  return { job: job as QueuedScanJobRow, report };
}

export async function enqueuePendingScanJob(input: {
  externalScanId: string;
  formUrl: string;
  formUrlHash: string;
  cacheKey: string;
  urlHost: string | null;
  totalSteps: number;
}): Promise<QueuedScanJobRow> {
  if (!isMonitoringConfigured()) {
    throw new Error("Supabase is not configured for scan job queue");
  }
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const baseRow = {
    external_scan_id: input.externalScanId,
    source_kind: "url" as const,
    form_url: input.formUrl,
    url_host: input.urlHost,
    form_url_hash: input.formUrlHash,
    survey_url_hash: input.formUrlHash,
    platform: "unknown" as const,
    status: "pending" as const,
    current_step: 0,
    total_steps: input.totalSteps,
    step_label: "대기 중",
    observed_at: now,
    observed_date_kst: kstToday(),
  };
  const selectCols =
    "id, external_scan_id, form_url, form_url_hash, cache_key, status, current_step, total_steps, step_label, error_message, monitoring_saved, evidence_stored, completed_at, created_at, updated_at";

  const withQueue = {
    ...baseRow,
    cache_key: input.cacheKey,
    queued_at: now,
    priority: 100,
    attempt_count: 0,
    monitoring_saved: false,
    evidence_stored: false,
  };

  const first = await supabase
    .from("scan_jobs")
    .insert(withQueue)
    .select(selectCols)
    .single();

  if (!first.error && first.data) {
    return first.data as QueuedScanJobRow;
  }

  // Migration 002 may not be applied — retry with core columns only.
  const fallback = await supabase
    .from("scan_jobs")
    .insert(baseRow)
    .select(
      "id, external_scan_id, form_url, form_url_hash, status, current_step, total_steps, step_label, error_message, completed_at, created_at, updated_at",
    )
    .single();
  if (fallback.error || !fallback.data) {
    throw new Error(
      `enqueuePendingScanJob: ${first.error?.message || fallback.error?.message || "missing row"}`,
    );
  }
  return {
    ...(fallback.data as QueuedScanJobRow),
    cache_key: input.cacheKey,
    monitoring_saved: false,
    evidence_stored: false,
  };
}

export async function claimScanJobByExternalId(
  externalScanId: string,
  workerId: string,
): Promise<QueuedScanJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  const config = getJobWorkerConfig();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_scan_job_by_external_id", {
    p_external_scan_id: externalScanId,
    p_worker_id: workerId,
    p_max_running: config.scanConcurrency,
    p_stale_seconds: Math.max(
      config.staleScanSeconds,
      config.scanTimeoutSeconds + 30,
    ),
  });
  if (error) {
    // Fallback when migration not yet applied: optimistic update
    console.warn("[jobs] claim_scan_job_by_external_id RPC failed:", error.message);
    return claimScanJobByExternalIdFallback(externalScanId, workerId);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as QueuedScanJobRow | undefined) ?? null;
}

async function claimScanJobByExternalIdFallback(
  externalScanId: string,
  workerId: string,
): Promise<QueuedScanJobRow | null> {
  const config = getJobWorkerConfig();
  const supabase = createSupabaseServerClient();
  await recoverStaleScanJobs();

  const { data: existing } = await supabase
    .from("scan_jobs")
    .select(
      "id, external_scan_id, form_url, form_url_hash, cache_key, status, current_step, total_steps, step_label, error_message, monitoring_saved, evidence_stored, completed_at, created_at, updated_at",
    )
    .eq("external_scan_id", externalScanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) return null;
  if (
    existing.status === "completed" ||
    existing.status === "failed" ||
    existing.status === "limited"
  ) {
    return existing as QueuedScanJobRow;
  }

  const { count } = await supabase
    .from("scan_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .neq("id", existing.id);
  if ((count ?? 0) >= config.scanConcurrency) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("scan_jobs")
    .update({
      status: "running",
      locked_at: now,
      locked_by: workerId,
      last_heartbeat_at: now,
      started_at: now,
      attempt_count: 1,
      updated_at: now,
    })
    .eq("id", existing.id)
    .in("status", ["pending", "running", "idle"])
    .select(
      "id, external_scan_id, form_url, form_url_hash, cache_key, status, current_step, total_steps, step_label, error_message, monitoring_saved, evidence_stored, completed_at, created_at, updated_at",
    )
    .maybeSingle();
  if (error) throw new Error(`claimScanJobByExternalIdFallback: ${error.message}`);
  return (data as QueuedScanJobRow | null) ?? null;
}

export async function claimNextScanJob(
  workerId: string,
): Promise<QueuedScanJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  const config = getJobWorkerConfig();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_next_scan_job", {
    p_worker_id: workerId,
    p_max_running: config.scanConcurrency,
    p_stale_seconds: Math.max(
      config.staleScanSeconds,
      config.scanTimeoutSeconds + 30,
    ),
  });
  if (error) {
    console.warn("[jobs] claim_next_scan_job RPC failed:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as QueuedScanJobRow | undefined) ?? null;
}

export async function updateScanJobProgress(
  scanJobId: string,
  patch: {
    status?: ScanJobStatus;
    currentStep?: number;
    totalSteps?: number;
    stepLabel?: string;
    errorMessage?: string | null;
    platform?: string;
    monitoringSaved?: boolean;
    evidenceStored?: boolean;
    completedAt?: string | null;
    extractionMode?: string | null;
    browserUsed?: boolean;
    browserReason?: string | null;
    fastExtractorConfidence?: string | null;
    fallbackTriggered?: boolean;
    fallbackReason?: string | null;
    totalDurationMs?: number | null;
    extractDurationMs?: number | null;
    analysisDurationMs?: number | null;
    saveDurationMs?: number | null;
    isCachedReuse?: boolean;
  },
): Promise<void> {
  if (!isMonitoringConfigured()) return;
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
  };
  if (patch.status) payload.status = patch.status;
  if (patch.currentStep !== undefined) payload.current_step = patch.currentStep;
  if (patch.totalSteps !== undefined) payload.total_steps = patch.totalSteps;
  if (patch.stepLabel !== undefined) payload.step_label = patch.stepLabel;
  if (patch.errorMessage !== undefined) payload.error_message = patch.errorMessage;
  if (patch.platform) payload.platform = patch.platform;
  if (patch.monitoringSaved !== undefined) {
    payload.monitoring_saved = patch.monitoringSaved;
  }
  if (patch.evidenceStored !== undefined) {
    payload.evidence_stored = patch.evidenceStored;
  }
  if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt;
  if (patch.extractionMode !== undefined) {
    payload.extraction_mode = patch.extractionMode;
  }
  if (patch.browserUsed !== undefined) payload.browser_used = patch.browserUsed;
  if (patch.browserReason !== undefined) {
    payload.browser_reason = patch.browserReason;
  }
  if (patch.fastExtractorConfidence !== undefined) {
    payload.fast_extractor_confidence = patch.fastExtractorConfidence;
  }
  if (patch.fallbackTriggered !== undefined) {
    payload.fallback_triggered = patch.fallbackTriggered;
  }
  if (patch.fallbackReason !== undefined) {
    payload.fallback_reason = patch.fallbackReason;
  }
  if (patch.totalDurationMs !== undefined) {
    payload.total_duration_ms = patch.totalDurationMs;
  }
  if (patch.extractDurationMs !== undefined) {
    payload.extract_duration_ms = patch.extractDurationMs;
  }
  if (patch.analysisDurationMs !== undefined) {
    payload.analysis_duration_ms = patch.analysisDurationMs;
  }
  if (patch.saveDurationMs !== undefined) {
    payload.save_duration_ms = patch.saveDurationMs;
  }
  if (patch.isCachedReuse !== undefined) {
    payload.is_cached_reuse = patch.isCachedReuse;
  }

  const { error } = await supabase
    .from("scan_jobs")
    .update(payload)
    .eq("id", scanJobId);
  if (error) {
    // Retry without optional metadata columns if migration 003 missing
    const core: Record<string, unknown> = {
      updated_at: payload.updated_at,
      last_heartbeat_at: payload.last_heartbeat_at,
      status: payload.status,
      current_step: payload.current_step,
      total_steps: payload.total_steps,
      step_label: payload.step_label,
      error_message: payload.error_message,
      platform: payload.platform,
      monitoring_saved: payload.monitoring_saved,
      evidence_stored: payload.evidence_stored,
      completed_at: payload.completed_at,
    };
    const cleaned = Object.fromEntries(
      Object.entries(core).filter(([, v]) => v !== undefined),
    );
    const { error: retryError } = await supabase
      .from("scan_jobs")
      .update(cleaned)
      .eq("id", scanJobId);
    if (retryError) {
      throw new Error(`updateScanJobProgress: ${error.message}`);
    }
  }
}

export async function getScanJobByExternalId(
  externalScanId: string,
): Promise<QueuedScanJobRow | null> {
  if (!isMonitoringConfigured()) return null;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("scan_jobs")
    .select(
      "id, external_scan_id, form_url, form_url_hash, cache_key, status, current_step, total_steps, step_label, error_message, monitoring_saved, evidence_stored, completed_at, created_at, updated_at",
    )
    .eq("external_scan_id", externalScanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getScanJobByExternalId: ${error.message}`);
  return (data as QueuedScanJobRow | null) ?? null;
}

export async function getReportJsonByExternalScanId(
  externalScanId: string,
): Promise<ScanReport | null> {
  if (!isMonitoringConfigured()) return null;
  const supabase = createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase
    .from("scan_jobs")
    .select("id")
    .eq("external_scan_id", externalScanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) throw new Error(`getReportJson.job: ${jobError.message}`);
  if (!job?.id) return null;

  const { data: reportRow, error } = await supabase
    .from("scan_reports")
    .select("report_json")
    .eq("scan_job_id", job.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getReportJson.report: ${error.message}`);
  const report = reportRow?.report_json as ScanReport | undefined;
  return report && typeof report === "object" ? report : null;
}

export async function getQueueCounts(): Promise<{
  scanPending: number;
  scanRunning: number;
  scanFailed: number;
  scanLimited: number;
  capturePending: number;
  captureRunning: number;
}> {
  if (!isMonitoringConfigured()) {
    return {
      scanPending: 0,
      scanRunning: 0,
      scanFailed: 0,
      scanLimited: 0,
      capturePending: 0,
      captureRunning: 0,
    };
  }
  const supabase = createSupabaseServerClient();

  async function count(
    table: "scan_jobs" | "capture_jobs",
    status: string | string[],
  ): Promise<number> {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    if (Array.isArray(status)) {
      query = query.in("status", status);
    } else {
      query = query.eq("status", status);
    }
    const { count: c, error } = await query;
    if (error) {
      console.warn(`[jobs] getQueueCounts ${table}:`, error.message);
      return 0;
    }
    return c ?? 0;
  }

  const [
    scanPending,
    scanRunning,
    scanFailed,
    scanLimited,
    capturePending,
    captureRunning,
  ] = await Promise.all([
    count("scan_jobs", "pending"),
    count("scan_jobs", "running"),
    count("scan_jobs", "failed"),
    count("scan_jobs", "limited"),
    count("capture_jobs", "pending"),
    count("capture_jobs", "running"),
  ]);

  return {
    scanPending,
    scanRunning,
    scanFailed,
    scanLimited,
    capturePending,
    captureRunning,
  };
}
