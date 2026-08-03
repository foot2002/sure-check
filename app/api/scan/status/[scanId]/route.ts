import { after, NextResponse } from "next/server";
import { getJobWorkerConfig, isMonitoringConfigured } from "@/lib/jobs/config";
import { processScanJob } from "@/lib/jobs/processScanJob";
import {
  getReportJsonByExternalScanId,
  getScanJobByExternalId,
  isInProgressScanStale,
  recoverStaleScanJobs,
  toApiScanStatus,
  toScanStatus,
} from "@/lib/jobs/scanJobQueue";
import { getScanRepository } from "@/lib/repositories/MockScanRepository";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import type { ScanReport } from "@/lib/types/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const repository = getScanRepository();
    const memoryJob = await repository.getScanJob(scanId);
    const memoryReport = await repository.getReport(scanId);

    let dbJob = null;
    if (isMonitoringConfigured()) {
      try {
        const { scanStatusStaleSeconds } = getJobWorkerConfig();
        await recoverStaleScanJobs(scanStatusStaleSeconds);
        dbJob = await getScanJobByExternalId(scanId);
        if (
          dbJob &&
          (dbJob.status === "pending" ||
            dbJob.status === "running" ||
            dbJob.status === "idle") &&
          isInProgressScanStale(dbJob, scanStatusStaleSeconds)
        ) {
          await recoverStaleScanJobs(scanStatusStaleSeconds);
          dbJob = await getScanJobByExternalId(scanId);
        }
      } catch (err) {
        console.warn("[scan/status] db lookup failed:", err);
      }
    }

    if (!memoryJob && !dbJob) {
      return NextResponse.json(
        { ok: false, error: "진단 작업을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const status = toApiScanStatus(memoryJob?.status ?? dbJob?.status);
    const currentStep =
      memoryJob?.currentStep ?? dbJob?.current_step ?? 0;
    const totalSteps =
      memoryJob?.totalSteps ??
      dbJob?.total_steps ??
      SCAN_PROGRESS_STEPS.length;
    const stepLabel =
      memoryJob?.stepLabel ??
      dbJob?.step_label ??
      SCAN_PROGRESS_STEPS[0];
    const errorMessage =
      memoryJob?.errorMessage ?? dbJob?.error_message ?? undefined;
    const progressPercent =
      totalSteps > 0
        ? Math.min(100, Math.round((currentStep / totalSteps) * 100))
        : 0;

    const terminal =
      status === "completed" ||
      status === "failed" ||
      status === "limited";

    const needsKick =
      !terminal &&
      isMonitoringConfigured() &&
      (status === "queued" || currentStep <= 0);
    if (needsKick) {
      after(() => {
        void processScanJob(scanId).catch((err) => {
          console.error("[scan/status] processScanJob kick failed:", err);
        });
      });
    }

    let result: ScanReport | undefined;
    if (terminal) {
      result = memoryReport ?? undefined;
      if (!result && isMonitoringConfigured()) {
        try {
          result = (await getReportJsonByExternalScanId(scanId)) ?? undefined;
          if (result) {
            await repository.saveReport(result);
          }
        } catch (err) {
          console.warn("[scan/status] report hydrate failed:", err);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      scanId,
      status,
      formUrl: memoryJob?.formUrl ?? dbJob?.form_url ?? "",
      platform: memoryJob?.platform ?? "unknown",
      mockKey: memoryJob?.mockKey ?? "generic_unknown_warning",
      currentStep,
      totalSteps,
      stepLabel,
      progressPercent,
      createdAt: memoryJob?.createdAt ?? dbJob?.created_at,
      updatedAt: memoryJob?.updatedAt ?? dbJob?.updated_at,
      errorMessage,
      result: terminal ? result ?? null : undefined,
      monitoringSaved: dbJob?.monitoring_saved ?? undefined,
      evidenceStored: dbJob?.evidence_stored ?? undefined,
      extractionMode:
        result?.debug?.extractionMode ??
        (dbJob as { extraction_mode?: string } | null)?.extraction_mode ??
        undefined,
      browserUsed:
        result?.debug?.browserUsed ??
        (dbJob as { browser_used?: boolean } | null)?.browser_used ??
        undefined,
      scanStatus: toScanStatus(memoryJob?.status ?? dbJob?.status),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "상태 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
