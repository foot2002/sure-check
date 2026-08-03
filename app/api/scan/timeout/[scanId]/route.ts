import { NextResponse } from "next/server";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { markScanJobClientTimeout } from "@/lib/jobs/scanJobQueue";
import { mockStore } from "@/lib/mock/mockStore";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client hard-timeout endpoint: mark an in-progress scan as limited so the UI
 * never stays on “진단 중” forever.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const message =
      "진단 시간이 길어져 자동으로 중단했습니다. 설문이 종료되었거나 접근이 제한되었을 수 있습니다. 잠시 후 다시 시도해 주세요.";

    mockStore.updateJob(scanId, {
      status: "limited",
      errorMessage: message,
      currentStep: SCAN_PROGRESS_STEPS.length,
      stepLabel: SCAN_PROGRESS_STEPS[SCAN_PROGRESS_STEPS.length - 1],
    });

    if (isMonitoringConfigured()) {
      await markScanJobClientTimeout(scanId);
    }

    return NextResponse.json({
      ok: true,
      scanId,
      status: "limited",
      errorMessage: message,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "타임아웃 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
