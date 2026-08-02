import { NextResponse } from "next/server";
import {
  CAPTURE_TOTAL_TIMEOUT_MS,
  EVIDENCE_FULL_TIMEOUT_MS,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import { captureSurveyScreenshots } from "@/lib/evidence/capture/captureSurveyScreenshots";
import type { CaptureMode } from "@/lib/evidence/capture/captureTypes";
import { fitScreenshotsForResponse } from "@/lib/evidence/capture/fitCaptureResponse";
import { persistCaptureEvidence } from "@/lib/monitoring/persistCaptureEvidence";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Fluid: up to 300s on Hobby/Pro default; internal walk timeout stays 180s. */
export const maxDuration = 300;

interface CaptureRequestBody {
  surveyUrl?: string;
  finalUrl?: string;
  diagnosisId?: string;
  mode?: CaptureMode;
  /** Alias for mode — clients may send either. */
  captureMode?: CaptureMode;
  /** When true, force evidence_full_walkthrough. */
  includeFullWalkthrough?: boolean;
  priorityQuestions?: unknown;
}

function parseMode(body: CaptureRequestBody): CaptureMode {
  if (
    body.mode === "evidence_full_walkthrough" ||
    body.captureMode === "evidence_full_walkthrough" ||
    body.includeFullWalkthrough === true
  ) {
    return "evidence_full_walkthrough";
  }
  return "safe_public_only";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CaptureRequestBody;
    const surveyUrl =
      typeof body.surveyUrl === "string" ? body.surveyUrl.trim() : "";
    const finalUrl =
      typeof body.finalUrl === "string" ? body.finalUrl.trim() : "";
    const diagnosisId =
      typeof body.diagnosisId === "string" ? body.diagnosisId.trim() : "";
    const mode = parseMode(body);

    if (!surveyUrl && !finalUrl) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          mode,
          screenshots: [],
          pageMetas: [],
          temporaryAnswersUsed: false,
          limitations: [
            "자동 화면 캡처에 실패했습니다.",
            "surveyUrl 또는 finalUrl이 필요합니다.",
            "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
          ],
          diagnosisId: diagnosisId || null,
          evidenceStored: false,
          storedEvidenceFiles: 0,
        },
        { status: 400 },
      );
    }

    const primary = finalUrl || surveyUrl;
    const safety = await safeUrlCheck(primary);
    if (!safety.safe) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          mode,
          screenshots: [],
          pageMetas: [],
          temporaryAnswersUsed: false,
          limitations: [
            "자동 화면 캡처에 실패했습니다.",
            safety.reason || "URL 보안 검사를 통과하지 못했습니다.",
            "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
          ],
          diagnosisId: diagnosisId || null,
          evidenceStored: false,
          storedEvidenceFiles: 0,
        },
        { status: 400 },
      );
    }

    const result = await captureSurveyScreenshots({
      surveyUrl,
      finalUrl: finalUrl || safety.normalizedUrl,
      mode,
    });

    let evidenceStored = false;
    let storedEvidenceFiles = 0;
    if (
      mode === "evidence_full_walkthrough" &&
      diagnosisId &&
      result.screenshots.length > 0
    ) {
      try {
        const persisted = await persistCaptureEvidence({
          diagnosisId,
          result,
        });
        evidenceStored = persisted.evidenceStored;
        storedEvidenceFiles = persisted.storedEvidenceFiles;
        if (!persisted.evidenceStored && persisted.errorMessage) {
          console.error(
            "[evidence] persistCaptureEvidence skipped:",
            persisted.errorMessage,
          );
        }
      } catch (error) {
        console.error("[evidence] persistCaptureEvidence failed:", error);
        evidenceStored = false;
        storedEvidenceFiles = 0;
      }
    }

    const fitted = fitScreenshotsForResponse(result.screenshots);
    const limitations = [
      ...result.limitations,
      ...fitted.limitations,
    ];
    if (isServerlessCaptureRuntime() && result.screenshots.length > 0) {
      limitations.push(
        "배포 환경에서는 응답 크기 제한을 피하기 위해 JPEG 압축 캡처를 사용합니다.",
      );
    }

    return NextResponse.json({
      success: result.success && fitted.screenshots.length > 0,
      status:
        fitted.omittedCount > 0 && result.status === "success"
          ? "partial"
          : result.status,
      mode: result.mode,
      captureProvider: result.captureProvider ?? null,
      expectedPageCount: result.expectedPageCount ?? null,
      expectedCapturablePageCount: result.expectedCapturablePageCount ?? null,
      sectionProgressTotal: result.sectionProgressTotal ?? null,
      capturedPageCount: fitted.screenshots.length,
      captureCompleteness:
        fitted.omittedCount > 0
          ? "partial"
          : (result.captureCompleteness ?? null),
      capturePathScope: result.capturePathScope ?? null,
      finalSubmitDetected: result.finalSubmitDetected ?? false,
      finalSubmitClicked: false,
      blockedSubmitRequestCount: result.blockedSubmitRequestCount ?? 0,
      stopReason: result.stopReason ?? null,
      stopPage: result.stopPage ?? null,
      branchLimitations: result.branchLimitations ?? [],
      piiSensitivePagesCaptured: result.piiSensitivePagesCaptured ?? false,
      piiSensitiveScreenshotFiles: result.piiSensitiveScreenshotFiles ?? [],
      screenshots: fitted.screenshots,
      pageMetas: result.pageMetas,
      temporaryAnswersUsed: result.temporaryAnswersUsed,
      limitations: [...new Set(limitations.filter(Boolean))],
      diagnosisId: diagnosisId || null,
      startedAt: result.startedAt ?? null,
      finishedAt: result.finishedAt ?? null,
      timeoutMs:
        mode === "evidence_full_walkthrough"
          ? EVIDENCE_FULL_TIMEOUT_MS
          : CAPTURE_TOTAL_TIMEOUT_MS,
      runtime: isServerlessCaptureRuntime() ? "serverless" : "local",
      evidenceStored,
      storedEvidenceFiles,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({
      success: false,
      status: "failed",
      mode: "safe_public_only",
      screenshots: [],
      pageMetas: [],
      temporaryAnswersUsed: false,
      limitations: [
        "자동 화면 캡처에 실패했습니다.",
        "설문 페이지가 접근을 차단했거나 로딩 시간이 초과되었습니다.",
        `상세: ${message.slice(0, 240)}`,
        "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
      ],
      evidenceStored: false,
      storedEvidenceFiles: 0,
    });
  }
}
