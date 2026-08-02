import { NextResponse } from "next/server";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import {
  getReportJsonByExternalScanId,
  getScanJobByExternalId,
  toApiScanStatus,
  toScanStatus,
} from "@/lib/jobs/scanJobQueue";
import { getScanRepository } from "@/lib/repositories/MockScanRepository";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import type { ScanReport } from "@/lib/types/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        dbJob = await getScanJobByExternalId(scanId);
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
      // Compatibility with existing ScanProgress / ScanJob consumers
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
      // legacy field aliases
      scanStatus: toScanStatus(memoryJob?.status ?? dbJob?.status),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "상태 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
