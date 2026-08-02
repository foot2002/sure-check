import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMonitoringConfigured } from "@/lib/jobs/config";

export type ScanStepName =
  | "normalize_url"
  | "fetch_form"
  | "extract_questions"
  | "analyze_privacy"
  | "build_report"
  | "save_monitoring"
  | "capture_evidence"
  | "upload_storage"
  | "finalize";

export type ScanStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export async function recordScanJobStep(input: {
  scanJobId: string;
  stepName: ScanStepName;
  status: ScanStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  errorMessage?: string | null;
}): Promise<void> {
  if (!isMonitoringConfigured()) return;
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("scan_job_steps").insert({
      scan_job_id: input.scanJobId,
      step_name: input.stepName,
      status: input.status,
      started_at: input.startedAt ?? null,
      completed_at: input.completedAt ?? null,
      duration_ms: input.durationMs ?? null,
      error_message: input.errorMessage ?? null,
    });
    if (error) {
      console.warn("[jobs] recordScanJobStep failed:", error.message);
    }
  } catch (err) {
    console.warn("[jobs] recordScanJobStep error:", err);
  }
}

export async function runTimedStep<T>(
  scanJobId: string | null,
  stepName: ScanStepName,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  if (scanJobId) {
    await recordScanJobStep({
      scanJobId,
      stepName,
      status: "running",
      startedAt,
    });
  }
  try {
    const result = await fn();
    if (scanJobId) {
      await recordScanJobStep({
        scanJobId,
        stepName,
        status: "completed",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
      });
    }
    return result;
  } catch (err) {
    if (scanJobId) {
      await recordScanJobStep({
        scanJobId,
        stepName,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}
