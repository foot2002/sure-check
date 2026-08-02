import {
  CAPTURE_TOTAL_TIMEOUT_MS,
  EVIDENCE_FULL_TIMEOUT_MS,
} from "@/lib/evidence/capture/captureConfig";
import { captureSurveyScreenshots } from "@/lib/evidence/capture/captureSurveyScreenshots";
import type { CaptureMode } from "@/lib/evidence/capture/captureTypes";
import { fitScreenshotsForResponse } from "@/lib/evidence/capture/fitCaptureResponse";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import {
  claimCaptureJobByExternalId,
  claimNextCaptureJob,
  updateCaptureJob,
  type QueuedCaptureJobRow,
} from "@/lib/jobs/captureJobQueue";
import { withTimeout } from "@/lib/jobs/withTimeout";
import { persistCaptureEvidence } from "@/lib/monitoring/persistCaptureEvidence";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function processClaimedCaptureJob(
  claimed: QueuedCaptureJobRow,
): Promise<{ ok: boolean; captureJobId: string; status: string }> {
  const mode = (claimed.capture_mode || "safe_public_only") as CaptureMode;
  const surveyUrl = claimed.survey_url || "";
  const finalUrl = claimed.final_url || "";
  const diagnosisId = claimed.diagnosis_external_id || "";
  const timeoutMs =
    mode === "evidence_full_walkthrough"
      ? EVIDENCE_FULL_TIMEOUT_MS
      : CAPTURE_TOTAL_TIMEOUT_MS;

  try {
    const result = await withTimeout(
      captureSurveyScreenshots({
        surveyUrl,
        finalUrl,
        mode,
      }),
      timeoutMs,
      "capture_job",
    );

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
          existingCaptureJobId: claimed.id,
        });
        evidenceStored = persisted.evidenceStored;
        storedEvidenceFiles = persisted.storedEvidenceFiles;
      } catch (err) {
        console.error("[jobs] persistCaptureEvidence failed:", err);
      }
    }

    const fitted = fitScreenshotsForResponse(result.screenshots);
    const status =
      fitted.omittedCount > 0 && result.status === "success"
        ? "partial"
        : result.status;

    const responsePayload = {
      success: result.success && fitted.screenshots.length > 0,
      status,
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
      limitations: [
        ...new Set([...(result.limitations || []), ...fitted.limitations]),
      ],
      diagnosisId: diagnosisId || null,
      startedAt: result.startedAt ?? null,
      finishedAt: result.finishedAt ?? null,
      evidenceStored,
      storedEvidenceFiles,
    };

    await updateCaptureJob(claimed.id, {
      status,
      result_json: responsePayload,
      captured_page_count: fitted.screenshots.length,
      temporary_answers_used: Boolean(result.temporaryAnswersUsed),
      limitations: responsePayload.limitations,
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      error_message: null,
    });

    if (evidenceStored && diagnosisId) {
      try {
        const supabase = createSupabaseServerClient();
        await supabase
          .from("scan_jobs")
          .update({
            evidence_stored: true,
            updated_at: new Date().toISOString(),
          })
          .eq("external_scan_id", diagnosisId);
      } catch {
        /* optional column */
      }
    }

    return { ok: true, captureJobId: claimed.id, status };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "캡처 중 오류가 발생했습니다.";
    const status = /timed out|timeout/i.test(message) ? "timeout" : "failed";
    await updateCaptureJob(claimed.id, {
      status,
      error_message: message.slice(0, 500),
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      result_json: {
        success: false,
        status,
        mode,
        screenshots: [],
        pageMetas: [],
        temporaryAnswersUsed: false,
        limitations: [
          "자동 화면 캡처에 실패했습니다.",
          message.slice(0, 240),
          "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
        ],
        evidenceStored: false,
        storedEvidenceFiles: 0,
      },
    });
    return { ok: false, captureJobId: claimed.id, status };
  }
}

export async function processCaptureJob(
  externalCaptureId: string,
  workerId = `after_capture_${process.pid}_${Date.now()}`,
): Promise<{ ok: boolean; captureJobId: string | null; status: string | null }> {
  if (!isMonitoringConfigured()) {
    return { ok: false, captureJobId: null, status: null };
  }
  const claimed = await claimCaptureJobByExternalId(externalCaptureId, workerId);
  if (!claimed) {
    return { ok: false, captureJobId: null, status: "pending" };
  }
  if (
    claimed.status === "success" ||
    claimed.status === "partial" ||
    claimed.status === "failed" ||
    claimed.status === "timeout" ||
    claimed.status === "skipped"
  ) {
    return { ok: true, captureJobId: claimed.id, status: claimed.status };
  }
  return processClaimedCaptureJob(claimed);
}

export async function processNextCaptureJob(
  workerId = `worker_capture_${process.pid}_${Date.now()}`,
): Promise<{ ok: boolean; captureJobId: string | null; status: string | null }> {
  if (!isMonitoringConfigured()) {
    return { ok: false, captureJobId: null, status: null };
  }
  const claimed = await claimNextCaptureJob(workerId);
  if (!claimed) {
    return { ok: true, captureJobId: null, status: null };
  }
  return processClaimedCaptureJob(claimed);
}
