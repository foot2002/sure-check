import { after, NextResponse } from "next/server";
import { getJobWorkerConfig, isMonitoringConfigured } from "@/lib/jobs/config";
import {
  getCaptureJobByExternalId,
  isInProgressCaptureStale,
  recoverStaleCaptureJobs,
  updateCaptureJob,
} from "@/lib/jobs/captureJobQueue";
import { processCaptureJob } from "@/lib/jobs/processCaptureJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const { captureStatusStaleSeconds } = getJobWorkerConfig();
    await recoverStaleCaptureJobs(captureStatusStaleSeconds);

    let job = await getCaptureJobByExternalId(captureJobId);
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "캡처 작업을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (
      (job.status === "pending" || job.status === "running") &&
      isInProgressCaptureStale(job, captureStatusStaleSeconds)
    ) {
      await updateCaptureJob(job.id, {
        status: "timeout",
        error_message:
          "캡처 시간이 초과되어 중단되었습니다. 다시 시도해 주세요.",
        locked_at: null,
        locked_by: null,
        completed_at: new Date().toISOString(),
        final_submit_clicked: false,
        result_json: {
          success: false,
          status: "timeout",
          screenshots: [],
          pageMetas: [],
          temporaryAnswersUsed: false,
          finalSubmitClicked: false,
          limitations: [
            "캡처 시간이 초과되어 중단되었습니다. 다시 시도해 주세요.",
          ],
        },
      });
      job = await getCaptureJobByExternalId(captureJobId);
      if (!job) {
        return NextResponse.json(
          { ok: false, error: "캡처 작업을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
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

    const needsKick =
      !terminal &&
      (status === "queued" ||
        (status === "running" &&
          isInProgressCaptureStale(job, captureStatusStaleSeconds)));
    if (needsKick) {
      after(() => {
        void processCaptureJob(captureJobId).catch((err) => {
          console.error(
            "[evidence/capture/status] processCaptureJob kick failed:",
            err,
          );
        });
      });
    }

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
