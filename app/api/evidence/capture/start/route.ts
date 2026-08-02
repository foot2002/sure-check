import { after, NextResponse } from "next/server";
import type { CaptureMode } from "@/lib/evidence/capture/captureTypes";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { enqueuePendingCaptureJob } from "@/lib/jobs/captureJobQueue";
import { processCaptureJob } from "@/lib/jobs/processCaptureJob";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CaptureStartBody {
  surveyUrl?: string;
  finalUrl?: string;
  diagnosisId?: string;
  mode?: CaptureMode;
  captureMode?: CaptureMode;
  includeFullWalkthrough?: boolean;
}

function parseMode(body: CaptureStartBody): CaptureMode {
  if (
    body.mode === "evidence_full_walkthrough" ||
    body.captureMode === "evidence_full_walkthrough" ||
    body.includeFullWalkthrough === true
  ) {
    return "evidence_full_walkthrough";
  }
  return "safe_public_only";
}

function createCaptureId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(request: Request) {
  try {
    if (!isMonitoringConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "캡처 대기열이 구성되지 않았습니다. 동기 /api/evidence/capture를 사용하세요.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as CaptureStartBody;
    const surveyUrl =
      typeof body.surveyUrl === "string" ? body.surveyUrl.trim() : "";
    const finalUrl =
      typeof body.finalUrl === "string" ? body.finalUrl.trim() : "";
    const diagnosisId =
      typeof body.diagnosisId === "string" ? body.diagnosisId.trim() : "";
    const mode = parseMode(body);

    if (!surveyUrl && !finalUrl) {
      return NextResponse.json(
        { ok: false, error: "surveyUrl 또는 finalUrl이 필요합니다." },
        { status: 400 },
      );
    }
    if (!diagnosisId) {
      return NextResponse.json(
        { ok: false, error: "diagnosisId가 필요합니다." },
        { status: 400 },
      );
    }

    const primary = finalUrl || surveyUrl;
    const safety = await safeUrlCheck(primary);
    if (!safety.safe) {
      return NextResponse.json(
        {
          ok: false,
          error: safety.reason || "URL 보안 검사를 통과하지 못했습니다.",
        },
        { status: 400 },
      );
    }

    const captureJobId = createCaptureId();
    await enqueuePendingCaptureJob({
      externalCaptureId: captureJobId,
      diagnosisId,
      surveyUrl,
      finalUrl: finalUrl || safety.normalizedUrl || surveyUrl,
      mode,
    });

    after(() => {
      void processCaptureJob(captureJobId).catch((err) => {
        console.error("[evidence/capture/start] process failed:", err);
      });
    });

    return NextResponse.json({
      ok: true,
      captureJobId,
      status: "queued",
      pollUrl: `/api/evidence/capture/status/${captureJobId}`,
      mode,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "캡처 시작 중 오류";
    return NextResponse.json(
      { ok: false, error: message.slice(0, 300) },
      { status: 500 },
    );
  }
}
