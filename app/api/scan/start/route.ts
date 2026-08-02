import { NextResponse } from "next/server";
import { getScanRepository } from "@/lib/repositories/MockScanRepository";
import { saveMonitoringSnapshot } from "@/lib/repositories/SupabaseMonitoringRepository";
import { isFileSourceReport } from "@/lib/reporting/buildFilePreDeployReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Moaform SPA extraction can take a while on cold egress. */
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const formUrl = typeof body.formUrl === "string" ? body.formUrl.trim() : "";

    if (!formUrl) {
      return NextResponse.json(
        { error: "설문 URL을 입력해 주세요." },
        { status: 400 },
      );
    }

    try {
      new URL(formUrl);
    } catch {
      return NextResponse.json(
        { error: "올바른 URL 형식이 아닙니다." },
        { status: 400 },
      );
    }

    const repository = getScanRepository();
    const job = await repository.createScanJob({ formUrl });
    // Return report in the same response so Vercel multi-isolate memory
    // does not lose the result between /start and /report.
    const report = await repository.getReport(job.scanId);

    let monitoringSaved = false;
    if (report && !isFileSourceReport(report)) {
      try {
        await saveMonitoringSnapshot(report);
        monitoringSaved = true;
      } catch (error) {
        console.error("[monitoring] saveMonitoringSnapshot failed:", error);
        monitoringSaved = false;
      }
    }

    return NextResponse.json({
      scanId: job.scanId,
      status: job.status,
      stepLabel: job.stepLabel,
      errorMessage: job.errorMessage,
      report: report ?? null,
      monitoringSaved,
    });
  } catch {
    return NextResponse.json(
      { error: "진단 시작 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
