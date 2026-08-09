import JSZip from "jszip";
import type { CaptureSurveyResult } from "@/lib/evidence/capture/captureTypes";
import type { CaptureProvider as DbCaptureProvider } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getEvidenceBucketName,
  uploadEvidenceFile,
} from "@/lib/storage/evidenceStorage";
import { selectKeyEvidenceScreenshots } from "@/lib/monitoring/selectKeyEvidenceScreenshots";
import { getSupabaseMonitoringRepository } from "@/lib/repositories/SupabaseMonitoringRepository";

export interface PersistCaptureEvidenceResult {
  evidenceStored: boolean;
  storedEvidenceFiles: number;
  captureJobId: string | null;
  zipPath: string | null;
  keyScreenshotCount: number;
  errorMessage?: string;
}

function mapCaptureProvider(
  provider: CaptureSurveyResult["captureProvider"],
): DbCaptureProvider {
  switch (provider) {
    case "google_forms":
    case "naver_form":
    case "moaform":
    case "generic":
      return provider;
    default:
      return "unknown";
  }
}

function mapCaptureStatus(
  status: CaptureSurveyResult["status"],
): "success" | "partial" | "failed" | "timeout" | "skipped" {
  if (
    status === "success" ||
    status === "partial" ||
    status === "failed" ||
    status === "timeout"
  ) {
    return status;
  }
  return "failed";
}

function kstDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

async function buildTemporaryEvidenceZip(
  result: CaptureSurveyResult,
): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder("02_화면캡처");
  for (const shot of result.screenshots) {
    const bytes = base64ToBuffer(shot.base64);
    folder?.file(shot.fileName, bytes);
  }
  zip.file(
    "01_신고증빙_요약서.txt",
    [
      "SURE Check temporary evidence package",
      `capturedPageCount: ${result.screenshots.length}`,
      `status: ${result.status}`,
      `provider: ${result.captureProvider ?? "unknown"}`,
      `generatedAt: ${new Date().toISOString()}`,
      "",
      "This ZIP is temporary storage (expires in 3 days).",
      "Key evidence screenshots are stored separately.",
    ].join("\n"),
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/**
 * Persist full-walkthrough capture:
 * - temporary ZIP of all screenshots (expires in 3 days)
 * - key evidence screenshots only (long-term subset)
 * - capture_jobs + evidence_files metadata (Storage paths, not binaries)
 */
export async function persistCaptureEvidence(params: {
  diagnosisId: string;
  result: CaptureSurveyResult;
  /** When set, update this capture_jobs row instead of inserting a new one. */
  existingCaptureJobId?: string;
}): Promise<PersistCaptureEvidenceResult> {
  const { diagnosisId, result, existingCaptureJobId } = params;
  if (!diagnosisId) {
    return {
      evidenceStored: false,
      storedEvidenceFiles: 0,
      captureJobId: null,
      zipPath: null,
      keyScreenshotCount: 0,
      errorMessage: "diagnosisId missing",
    };
  }
  if (
    result.mode !== "evidence_full_walkthrough" &&
    result.mode !== "safe_public_only"
  ) {
    return {
      evidenceStored: false,
      storedEvidenceFiles: 0,
      captureJobId: null,
      zipPath: null,
      keyScreenshotCount: 0,
      errorMessage: "unsupported capture mode",
    };
  }
  if (result.screenshots.length === 0) {
    return {
      evidenceStored: false,
      storedEvidenceFiles: 0,
      captureJobId: null,
      zipPath: null,
      keyScreenshotCount: 0,
      errorMessage: "no screenshots",
    };
  }
  const isPreview = result.mode === "safe_public_only";

  const monitoring = getSupabaseMonitoringRepository();
  const linked = await monitoring.findMonitoringIdsByExternalScanId(diagnosisId);
  if (!linked) {
    return {
      evidenceStored: false,
      storedEvidenceFiles: 0,
      captureJobId: null,
      zipPath: null,
      keyScreenshotCount: 0,
      errorMessage: `scan_jobs not found for external_scan_id=${diagnosisId}`,
    };
  }

  const now = new Date();
  const observedAt = now.toISOString();
  const observedDateKst = kstDateString(now);
  const zipExpiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const keySelections = selectKeyEvidenceScreenshots(
    result.screenshots,
    result.pageMetas || [],
  );

  const supabase = createSupabaseServerClient();
  const capturePayload = {
    scan_job_id: linked.scanJobId,
    survey_record_id: linked.surveyRecordId,
    capture_mode: result.mode,
    capture_provider: mapCaptureProvider(result.captureProvider),
    status: mapCaptureStatus(result.status),
    completeness: result.captureCompleteness ?? null,
    path_scope: result.capturePathScope ?? null,
    expected_page_count:
      result.expectedCapturablePageCount ?? result.expectedPageCount ?? null,
    captured_page_count: result.screenshots.length,
    key_evidence_count: keySelections.length,
    temporary_answers_used: Boolean(result.temporaryAnswersUsed),
    final_submit_detected: Boolean(result.finalSubmitDetected),
    final_submit_clicked: Boolean(result.finalSubmitClicked),
    stop_reason: result.stopReason ?? null,
    stop_page: result.stopPage ?? null,
    limitations: result.limitations ?? [],
    observed_at: observedAt,
    observed_date_kst: observedDateKst,
    started_at: result.startedAt ?? observedAt,
    completed_at: result.finishedAt ?? observedAt,
    locked_at: null,
    locked_by: null,
  };

  let captureJobId: string;
  if (existingCaptureJobId) {
    const { data: updated, error: updateError } = await supabase
      .from("capture_jobs")
      .update(capturePayload)
      .eq("id", existingCaptureJobId)
      .select("id")
      .single();
    if (updateError || !updated?.id) {
      throw new Error(
        `capture_jobs update failed: ${updateError?.message || "missing id"}`,
      );
    }
    captureJobId = updated.id as string;
  } else {
    const { data: captureJob, error: captureError } = await supabase
      .from("capture_jobs")
      .insert(capturePayload)
      .select("id")
      .single();

    if (captureError || !captureJob?.id) {
      throw new Error(
        `capture_jobs insert failed: ${captureError?.message || "missing id"}`,
      );
    }
    captureJobId = captureJob.id as string;
  }
  const bucket = getEvidenceBucketName();
  const evidenceRows: Array<Record<string, unknown>> = [];
  let storedEvidenceFiles = 0;
  let zipPath: string | null = null;

  // 1) Full walkthrough: temporary ZIP of all screenshots
  if (!isPreview) {
    zipPath = `evidence/${diagnosisId}/package/sure-check-evidence.zip`;
    const zipBuffer = await buildTemporaryEvidenceZip(result);
    const zipUpload = await uploadEvidenceFile({
      path: zipPath,
      body: zipBuffer,
      contentType: "application/zip",
      upsert: true,
    });
    evidenceRows.push({
      survey_record_id: linked.surveyRecordId,
      capture_job_id: captureJobId,
      scan_job_id: linked.scanJobId,
      evidence_type: "temporary_zip",
      is_key_evidence: false,
      retention_level: "temporary",
      storage_bucket: zipUpload.bucket,
      storage_path: zipUpload.path,
      mime_type: zipUpload.contentType,
      byte_size: zipUpload.byteSize,
      sha256: zipUpload.sha256,
      page_number: null,
      captured_url: null,
      label: "신고용 전체 캡처 ZIP (임시)",
      expires_at: zipExpiresAt,
      observed_at: observedAt,
      observed_date_kst: observedDateKst,
    });
    storedEvidenceFiles += 1;
  }

  // 2) Key / preview screenshots (no giant base64 in report_json)
  const screenshotItems = isPreview
    ? result.screenshots.slice(0, 3).map((screenshot, index) => ({
        screenshot,
        pageMeta: (result.pageMetas?.[index] ?? null) as
          | (typeof result.pageMetas)[number]
          | null,
        evidenceType: "key_screenshot" as const,
        retentionLevel: "temporary" as const,
        label:
          screenshot.label ||
          (index === 0 ? "설문 상단 미리보기" : `미리보기 ${index + 1}`),
      }))
    : keySelections;

  for (const item of screenshotItems) {
    const fileName = item.screenshot.fileName || `page_${item.screenshot.pageNumber || 0}.png`;
    const storagePath = `evidence/${diagnosisId}/screenshots/${fileName}`;
    const bytes = base64ToBuffer(item.screenshot.base64);
    const uploaded = await uploadEvidenceFile({
      path: storagePath,
      body: bytes,
      contentType: item.screenshot.mimeType || "image/png",
      upsert: true,
    });
    evidenceRows.push({
      survey_record_id: linked.surveyRecordId,
      capture_job_id: captureJobId,
      scan_job_id: linked.scanJobId,
      evidence_type: item.evidenceType,
      is_key_evidence: !isPreview,
      retention_level: item.retentionLevel,
      storage_bucket: uploaded.bucket || bucket,
      storage_path: uploaded.path,
      mime_type: uploaded.contentType,
      byte_size: uploaded.byteSize,
      sha256: uploaded.sha256,
      page_number:
        item.pageMeta?.pageNumber ?? item.screenshot.pageNumber ?? null,
      captured_url:
        item.pageMeta?.capturedUrl || item.screenshot.capturedUrl || null,
      label: item.label,
      expires_at: isPreview ? zipExpiresAt : null,
      observed_at: observedAt,
      observed_date_kst: observedDateKst,
    });
    storedEvidenceFiles += 1;
  }

  const { error: evidenceError } = await supabase
    .from("evidence_files")
    .insert(evidenceRows);
  if (evidenceError) {
    throw new Error(`evidence_files insert failed: ${evidenceError.message}`);
  }

  return {
    evidenceStored: true,
    storedEvidenceFiles,
    captureJobId,
    zipPath,
    keyScreenshotCount: screenshotItems.length,
  };
}
