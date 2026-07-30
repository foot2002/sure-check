import JSZip from "jszip";
import { buildComplaintDraft } from "@/lib/evidence/buildComplaintDraft";
import { buildEvidenceSummaryHtml } from "@/lib/evidence/buildEvidenceSummaryHtml";
import type {
  EvidencePackageCaptureOptions,
  ManualEvidenceFile,
  ReportEvidenceModel,
  ScreenCaptureEvidenceMeta,
} from "@/lib/evidence/evidenceTypes";
import {
  formatEvidenceTimestamp,
  sanitizeFilename,
} from "@/lib/evidence/sanitizeFilename";

export { downloadBlob } from "@/lib/utils/download";

export interface BuiltEvidencePackage {
  blob: Blob;
  fileName: string;
  fileCount: number;
}

const CAPTURE_DIR = "02_화면캡처";

function manualScreenshotFileName(index: number, originalName: string): string {
  const safe = sanitizeFilename(originalName.replace(/\.[^.]+$/, ""), 28);
  const extMatch = originalName.match(/\.(png|jpe?g|pdf)$/i);
  const ext = (extMatch?.[1] || "bin").toLowerCase().replace("jpeg", "jpg");
  const padded = String(index).padStart(2, "0");
  return `screenshot_${padded}_user_added_${safe}.${ext}`;
}

/**
 * Slim evidence ZIP:
 * 1) 01_신고증빙_요약서.html — survey basics, legal issues, report reason, key evidence
 *    (open in browser → Ctrl+P → Save as PDF)
 * 2) 02_화면캡처/* — screenshot images only
 */
export async function buildEvidencePackage(
  model: ReportEvidenceModel,
  manualFiles: ManualEvidenceFile[] = [],
  capture: EvidencePackageCaptureOptions = {},
): Promise<BuiltEvidencePackage> {
  const zip = new JSZip();
  const stamp = formatEvidenceTimestamp(new Date(model.generatedAt));
  const safeTitle = sanitizeFilename(model.surveyTitle);
  const fileName = `SURE_Check_신고증빙_${stamp}_${safeTitle}.zip`;

  const autoScreenshots = capture.autoScreenshots ?? [];
  const captureLimitations = capture.captureLimitations ?? [];
  const captureAttempted = Boolean(capture.captureAttempted);

  const screenshotEntries: Array<{
    path: string;
    content: Uint8Array;
    meta: Omit<ScreenCaptureEvidenceMeta, "sha256">;
  }> = [];

  for (const shot of autoScreenshots) {
    const path = `${CAPTURE_DIR}/${shot.fileName}`;
    screenshotEntries.push({
      path,
      content: shot.bytes,
      meta: {
        id: shot.id,
        storedName: path,
        mimeType: shot.mimeType,
        size: shot.size || shot.bytes.byteLength,
        source: "auto_browser_capture",
        capturedAt: shot.capturedAt,
        capturedAtKST: shot.capturedAtKst,
        capturedUrl: shot.capturedUrl,
        finalUrl: shot.finalUrl,
        pageTitle: shot.pageTitle,
        viewport: shot.viewport,
        label: shot.label,
      },
    });
  }

  manualFiles.forEach((file, index) => {
    const stored = manualScreenshotFileName(index + 1, file.fileName);
    const path = `${CAPTURE_DIR}/${stored}`;
    screenshotEntries.push({
      path,
      content: file.bytes,
      meta: {
        id: `manual_screenshot_${String(index + 1).padStart(2, "0")}`,
        storedName: path,
        mimeType: file.mimeType,
        size: file.bytes.byteLength,
        source: "manual_upload",
        capturedAt: new Date().toISOString(),
        label: file.label || file.fileName,
      },
    });
  });

  const screenCaptureEvidence: ScreenCaptureEvidenceMeta[] = [];
  for (const entry of screenshotEntries) {
    screenCaptureEvidence.push({
      ...entry.meta,
      sha256: "",
    });
  }

  const reportReason = buildComplaintDraft(model, {
    screenCaptureEvidence,
    captureLimitations,
    captureAttempted,
  });

  const summaryHtml = buildEvidenceSummaryHtml(model, {
    screenCaptureEvidence,
    captureLimitations,
    captureAttempted,
    reportReason,
  });

  zip.file("01_신고증빙_요약서.html", summaryHtml);
  for (const entry of screenshotEntries) {
    zip.file(entry.path, entry.content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    fileName,
    fileCount: 1 + screenshotEntries.length,
  };
}
