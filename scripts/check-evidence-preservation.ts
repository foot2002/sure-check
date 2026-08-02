/**
 * Evidence preservation check — Storage/ZIP/metadata/signed URL/final_submit_clicked.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import type {
  AutoScreenshotPayload,
  CapturePageMeta,
  CaptureSurveyResult,
} from "@/lib/evidence/capture/captureTypes";
import { NORMALIZED_FORM_FIXTURES } from "@/lib/fixtures/normalizedForms";
import { persistCaptureEvidence } from "@/lib/monitoring/persistCaptureEvidence";
import {
  getSupabaseMonitoringRepository,
  saveMonitoringSnapshot,
} from "@/lib/repositories/SupabaseMonitoringRepository";
import {
  createSignedEvidenceUrl,
  deleteEvidenceFile,
  getEvidenceBucketName,
  sha256Buffer,
  uploadEvidenceFile,
} from "@/lib/storage/evidenceStorage";
import {
  createSupabaseServerClient,
  getSupabaseServiceRoleKeyStatus,
  getSupabaseUrlStatus,
} from "@/lib/supabase/server";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]?.trim()) {
        process.env[key] = value;
      }
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function tinyPngBase64(): string {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W2/UAAAAASUVORK5CYII=";
}

function shot(
  pageNumber: number,
  label: string,
  fileName: string,
): AutoScreenshotPayload {
  const base64 = tinyPngBase64();
  const now = new Date().toISOString();
  return {
    id: `shot_${pageNumber}`,
    label,
    fileName,
    mimeType: "image/png",
    capturedAt: now,
    capturedAtKst: now,
    capturedUrl: "https://example.com/form",
    finalUrl: "https://example.com/form",
    viewport: { width: 1280, height: 720 },
    pageTitle: label,
    source: "auto_browser_capture",
    base64,
    size: Buffer.from(base64, "base64").length,
    pageNumber,
    mode: "evidence_full_walkthrough",
  };
}

function pageMeta(
  pageNumber: number,
  title: string,
  opts: Partial<CapturePageMeta> = {},
): CapturePageMeta {
  const now = new Date().toISOString();
  return {
    pageNumber,
    pageTitle: title,
    capturedUrl: "https://example.com/form",
    capturedAt: now,
    screenshotFileName: `page_${pageNumber}.png`,
    provider: "google_forms",
    detectedQuestions: opts.detectedQuestions || [],
    personalInfoQuestions: opts.personalInfoQuestions || [],
    sensitiveInfoQuestions: opts.sensitiveInfoQuestions || [],
    highRiskQuestions: opts.highRiskQuestions || [],
    temporaryAnswersUsed: false,
    temporaryAnswerTypes: [],
    finalSubmitDetected: Boolean(opts.finalSubmitDetected),
    finalSubmitClicked: false,
    ...opts,
  };
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  console.log("[Evidence Preservation Result]\n");

  const urlStatus = getSupabaseUrlStatus();
  const keyStatus = getSupabaseServiceRoleKeyStatus();
  if (urlStatus !== "OK" || keyStatus !== "OK") {
    console.log("- capture job: FAIL (missing supabase env)");
    console.log("- result: FAIL");
    process.exit(1);
  }

  const scanId = `scan_evidence_pres_${Date.now()}`;
  const formUrl =
    "https://docs.google.com/forms/d/e/evidence-preservation-check/viewform";
  const form = {
    ...NORMALIZED_FORM_FIXTURES.google_public_high_risk,
    url: formUrl,
    metadata: {
      ...(NORMALIZED_FORM_FIXTURES.google_public_high_risk.metadata || {}),
      source: { kind: "url" as const },
    },
  };
  const report = analyzeForm(
    form,
    scanId,
    formUrl,
    "google_public_high_risk",
  );

  const monitoring = getSupabaseMonitoringRepository();
  await monitoring.deleteByExternalScanId(scanId).catch(() => 0);
  await saveMonitoringSnapshot(report);

  const captureResult: CaptureSurveyResult = {
    success: true,
    status: "success",
    mode: "evidence_full_walkthrough",
    captureProvider: "google_forms",
    screenshots: [
      shot(1, "첫 페이지", "page_01.png"),
      shot(2, "개인정보 고지", "page_02_notice.png"),
      shot(3, "개인정보 문항", "page_03_pii.png"),
    ],
    pageMetas: [
      pageMeta(1, "첫 페이지"),
      pageMeta(2, "개인정보 수집 이용 안내", {
        detectedQuestions: ["개인정보 수집 이용에 동의합니다"],
      }),
      pageMeta(3, "연락처", {
        personalInfoQuestions: ["휴대폰 번호"],
        detectedQuestions: ["휴대폰 번호"],
      }),
    ],
    temporaryAnswersUsed: false,
    limitations: [],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    finalSubmitDetected: true,
    finalSubmitClicked: false,
    captureCompleteness: "complete",
    expectedPageCount: 3,
    expectedCapturablePageCount: 3,
  };

  const persisted = await persistCaptureEvidence({
    diagnosisId: scanId,
    result: captureResult,
  });

  assert(persisted.captureJobId, "capture job missing");
  console.log(`- capture job: OK (${persisted.captureJobId})`);

  assert(persisted.evidenceStored, "evidence not stored");
  assert(persisted.zipPath, "temporary zip missing");
  console.log(`- temporary zip: OK (${persisted.zipPath})`);

  assert(persisted.keyScreenshotCount > 0, "key screenshots missing");
  console.log(`- key screenshots: OK (${persisted.keyScreenshotCount})`);

  const supabase = createSupabaseServerClient();
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence_files")
    .select("id, evidence_type, storage_path, capture_job_id")
    .eq("capture_job_id", persisted.captureJobId);
  assert(!evidenceError, evidenceError?.message || "evidence query failed");
  assert((evidenceRows || []).length > 0, "evidence_files empty");
  console.log(`- evidence_files metadata: OK (${evidenceRows!.length})`);

  const { data: captureJob } = await supabase
    .from("capture_jobs")
    .select("final_submit_clicked, status")
    .eq("id", persisted.captureJobId)
    .maybeSingle();
  assert(captureJob, "capture_jobs row missing");
  assert(
    captureJob.final_submit_clicked === false,
    "final_submit_clicked must be false",
  );
  console.log("- final_submit_clicked false: OK");

  const sample = evidenceRows![0];
  const signed = await createSignedEvidenceUrl({
    path: sample.storage_path as string,
    expiresInSeconds: 60,
  });
  assert(signed.startsWith("http"), "signed URL missing");
  console.log("- signed URL: OK");

  const path = `evidence/${scanId}/preservation-probe.txt`;
  const body = Buffer.from("preservation-ok");
  await uploadEvidenceFile({
    path,
    body,
    contentType: "text/plain",
    upsert: true,
  });
  assert(sha256Buffer(body).length === 64, "sha256 failed");
  await deleteEvidenceFile(path);

  await monitoring.deleteByExternalScanId(scanId);

  console.log(`- bucket: ${getEvidenceBucketName()}`);
  console.log("- result: PASS");
}

main().catch((err) => {
  console.error(err);
  console.log("- result: FAIL");
  process.exit(1);
});
