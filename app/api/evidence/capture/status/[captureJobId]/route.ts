import { NextResponse } from "next/server";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { getCaptureJobByExternalId } from "@/lib/jobs/captureJobQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ captureJobId: string }> },
) {
  try {
    if (!isMonitoringConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Supabase is not configured" },
        { status: 503 },
      );
    }

    const { captureJobId } = await params;
    const job = await getCaptureJobByExternalId(captureJobId);
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "캡처 작업을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const status =
      job.status === "pending"
        ? "queued"
        : job.status === "running"
          ? "running"
          : job.status;

    const terminal = [
      "success",
      "partial",
      "failed",
      "timeout",
      "skipped",
    ].includes(job.status);

    return NextResponse.json({
      ok: true,
      captureJobId,
      status,
      mode: job.capture_mode,
      errorMessage: job.error_message,
      result: terminal ? job.result_json : undefined,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "캡처 상태 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
