import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { NORMALIZED_FORM_FIXTURES } from "@/lib/fixtures/normalizedForms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSupabaseServiceRoleKeyStatus,
  getSupabaseUrlStatus,
} from "@/lib/supabase/server";
import {
  createSignedEvidenceUrl,
  deleteEvidenceFile,
  getEvidenceBucketName,
  sha256Buffer,
  uploadEvidenceFile,
} from "@/lib/storage/evidenceStorage";
import {
  getSupabaseMonitoringRepository,
  saveMonitoringSnapshot,
} from "@/lib/repositories/SupabaseMonitoringRepository";

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

function tinyPng(): Buffer {
  // 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W2/UAAAAASUVORK5CYII=",
    "base64",
  );
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  console.log("[Evidence Storage Check]");

  const urlStatus = getSupabaseUrlStatus();
  const keyStatus = getSupabaseServiceRoleKeyStatus();
  console.log(`SUPABASE_URL: ${urlStatus}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${keyStatus}`);
  console.log(`bucket: ${getEvidenceBucketName()}`);

  if (urlStatus !== "OK" || keyStatus !== "OK") {
    console.log("Result: FAIL (missing env)");
    process.exit(1);
  }

  const scanId = `scan_evidence_check_${Date.now()}`;
  const formUrl =
    "https://docs.google.com/forms/d/e/evidence-storage-check/viewform";
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
  const keep = process.argv.includes("--keep");
  const pngPath = `evidence/${scanId}/screenshots/page_01.png`;
  const zipPath = `evidence/${scanId}/package/sure-check-evidence.zip`;
  let captureJobId: string | null = null;

  try {
    await monitoring.deleteByExternalScanId(scanId).catch(() => 0);
    const saved = await saveMonitoringSnapshot(report);
    console.log("monitoring snapshot: OK");

    const png = tinyPng();
    const zip = Buffer.from("PK\u0005\u0006" + "\u0000".repeat(18)); // minimal empty zip EOCD
    const pngHash = sha256Buffer(png);
    console.log(`sha256Buffer: OK (${pngHash.slice(0, 12)}…)`);

    const pngUpload = await uploadEvidenceFile({
      path: pngPath,
      body: png,
      contentType: "image/png",
    });
    console.log("PNG upload: OK");

    const zipUpload = await uploadEvidenceFile({
      path: zipPath,
      body: zip,
      contentType: "application/zip",
    });
    console.log("ZIP upload: OK");

    const signed = await createSignedEvidenceUrl({
      path: pngPath,
      expiresInSeconds: 120,
    });
    assert(signed.startsWith("http"), "signed URL should be http(s)");
    console.log("signed URL: OK");

    const supabase = createSupabaseServerClient();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const observedAt = new Date().toISOString();
    const observedDateKst = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
    }).format(new Date());

    const { data: captureJob, error: captureError } = await supabase
      .from("capture_jobs")
      .insert({
        scan_job_id: saved.scanJobId,
        survey_record_id: saved.surveyRecordId,
        capture_mode: "evidence_full_walkthrough",
        capture_provider: "google_forms",
        status: "success",
        completeness: "complete",
        path_scope: "traversed_path",
        expected_page_count: 1,
        captured_page_count: 1,
        key_evidence_count: 1,
        temporary_answers_used: false,
        final_submit_detected: false,
        final_submit_clicked: false,
        limitations: [],
        observed_at: observedAt,
        observed_date_kst: observedDateKst,
        started_at: observedAt,
        completed_at: observedAt,
      })
      .select("id")
      .single();
    assert(!captureError && captureJob?.id, captureError?.message || "capture_jobs");
    captureJobId = captureJob.id as string;
    console.log("capture_jobs: OK");

    const { error: evidenceError } = await supabase.from("evidence_files").insert([
      {
        survey_record_id: saved.surveyRecordId,
        capture_job_id: captureJobId,
        scan_job_id: saved.scanJobId,
        evidence_type: "pii_question_screenshot",
        is_key_evidence: true,
        retention_level: "key_evidence",
        storage_bucket: pngUpload.bucket,
        storage_path: pngUpload.path,
        mime_type: pngUpload.contentType,
        byte_size: pngUpload.byteSize,
        sha256: pngUpload.sha256,
        page_number: 1,
        captured_url: formUrl,
        label: "test pii page",
        expires_at: null,
        observed_at: observedAt,
        observed_date_kst: observedDateKst,
      },
      {
        survey_record_id: saved.surveyRecordId,
        capture_job_id: captureJobId,
        scan_job_id: saved.scanJobId,
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
        label: "test zip",
        expires_at: expiresAt,
        observed_at: observedAt,
        observed_date_kst: observedDateKst,
      },
    ]);
    assert(!evidenceError, evidenceError?.message || "evidence_files");
    console.log("evidence_files metadata: OK");

    if (!keep) {
      await deleteEvidenceFile({ path: pngPath });
      await deleteEvidenceFile({ path: zipPath });
      const deleted = await monitoring.deleteByExternalScanId(scanId);
      assert(deleted >= 1, "cleanup scan_jobs failed");
      console.log("cleanup: OK");
    } else {
      console.log("cleanup: SKIPPED (--keep)");
    }

    console.log("Result: PASS");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    try {
      await deleteEvidenceFile({ path: pngPath }).catch(() => undefined);
      await deleteEvidenceFile({ path: zipPath }).catch(() => undefined);
      await monitoring.deleteByExternalScanId(scanId).catch(() => undefined);
    } catch {
      // ignore
    }
    console.log("Result: FAIL");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
