import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMonitoringConfigured } from "@/lib/jobs/config";

export const SCAN_JOB_QUEUE_COLUMNS = [
  "attempt_count",
  "locked_at",
  "locked_by",
  "last_heartbeat_at",
  "priority",
  "queued_at",
  "cache_key",
  "monitoring_saved",
  "evidence_stored",
  "is_cached_reuse",
  "extraction_mode",
  "browser_used",
  "browser_reason",
  "fast_extractor_confidence",
  "fallback_triggered",
  "fallback_reason",
  "total_duration_ms",
  "extract_duration_ms",
  "analysis_duration_ms",
  "save_duration_ms",
] as const;

export const CAPTURE_JOB_QUEUE_COLUMNS = [
  "attempt_count",
  "locked_at",
  "locked_by",
  "last_heartbeat_at",
  "priority",
  "queued_at",
  "external_capture_id",
  "survey_url",
  "final_url",
  "diagnosis_external_id",
  "result_json",
  "error_message",
] as const;

export const QUEUE_RPC_FUNCTIONS = [
  "claim_scan_job_by_external_id",
  "claim_next_scan_job",
  "claim_next_capture_job",
] as const;

export type QueueSchemaReport = {
  ok: boolean;
  scanJobColumns: Record<string, boolean>;
  captureJobColumns: Record<string, boolean>;
  rpcFunctions: Record<string, boolean>;
  missing: string[];
};

let cached: QueueSchemaReport | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

async function columnExists(
  table: "scan_jobs" | "capture_jobs",
  column: string,
): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  const msg = (error.message || "").toLowerCase();
  if (
    msg.includes("does not exist") ||
    msg.includes("column") ||
    error.code === "42703" ||
    error.code === "PGRST204"
  ) {
    return false;
  }
  // Other errors (empty table, RLS) still mean the column is addressable.
  return true;
}

async function rpcExists(name: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  if (name === "claim_scan_job_by_external_id") {
    const { error } = await supabase.rpc(name, {
      p_external_scan_id: "__schema_check__",
      p_worker_id: "__schema_check__",
      p_max_running: 1,
      p_stale_seconds: 30,
    });
    if (!error) return true;
    const msg = (error.message || "").toLowerCase();
    return !(
      msg.includes("could not find the function") ||
      msg.includes("does not exist") ||
      error.code === "PGRST202" ||
      error.code === "42883"
    );
  }
  if (name === "claim_next_scan_job" || name === "claim_next_capture_job") {
    const { error } = await supabase.rpc(name, {
      p_worker_id: "__schema_check__",
      p_max_running: 1,
      p_stale_seconds: 30,
    });
    if (!error) return true;
    const msg = (error.message || "").toLowerCase();
    return !(
      msg.includes("could not find the function") ||
      msg.includes("does not exist") ||
      error.code === "PGRST202" ||
      error.code === "42883"
    );
  }
  return false;
}

export async function checkQueueSchema(
  options?: { bypassCache?: boolean },
): Promise<QueueSchemaReport> {
  if (!isMonitoringConfigured()) {
    return {
      ok: false,
      scanJobColumns: Object.fromEntries(
        SCAN_JOB_QUEUE_COLUMNS.map((c) => [c, false]),
      ),
      captureJobColumns: Object.fromEntries(
        CAPTURE_JOB_QUEUE_COLUMNS.map((c) => [c, false]),
      ),
      rpcFunctions: Object.fromEntries(
        QUEUE_RPC_FUNCTIONS.map((c) => [c, false]),
      ),
      missing: ["SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"],
    };
  }

  if (
    !options?.bypassCache &&
    cached &&
    Date.now() - cachedAt < CACHE_MS
  ) {
    return cached;
  }

  const scanJobColumns: Record<string, boolean> = {};
  const captureJobColumns: Record<string, boolean> = {};
  const rpcFunctions: Record<string, boolean> = {};
  const missing: string[] = [];

  for (const col of SCAN_JOB_QUEUE_COLUMNS) {
    const ok = await columnExists("scan_jobs", col);
    scanJobColumns[col] = ok;
    if (!ok) missing.push(`scan_jobs.${col}`);
  }
  for (const col of CAPTURE_JOB_QUEUE_COLUMNS) {
    const ok = await columnExists("capture_jobs", col);
    captureJobColumns[col] = ok;
    if (!ok) missing.push(`capture_jobs.${col}`);
  }
  for (const name of QUEUE_RPC_FUNCTIONS) {
    const ok = await rpcExists(name);
    rpcFunctions[name] = ok;
    if (!ok) missing.push(`rpc.${name}`);
  }

  const report: QueueSchemaReport = {
    ok: missing.length === 0,
    scanJobColumns,
    captureJobColumns,
    rpcFunctions,
    missing,
  };
  cached = report;
  cachedAt = Date.now();
  return report;
}

export class QueueSchemaNotReadyError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      "진단 대기열 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.",
    );
    this.name = "QueueSchemaNotReadyError";
    this.missing = missing;
  }
}

export async function assertQueueSchemaReady(): Promise<void> {
  const report = await checkQueueSchema();
  if (!report.ok) {
    throw new QueueSchemaNotReadyError(report.missing);
  }
}
