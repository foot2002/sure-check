import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function isDryRun(argv: string[]): boolean {
  return argv.includes("--dry-run") || argv.includes("-n");
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const dryRun = isDryRun(process.argv.slice(2));
  const supabase = createSupabaseServerClient();

  console.log(`[Evidence Link Backfill] dryRun=${dryRun}`);

  const { data: surveys, error: surveyError } = await supabase
    .from("survey_records")
    .select("id, scan_job_id")
    .not("scan_job_id", "is", null)
    .limit(5000);
  if (surveyError) throw new Error(surveyError.message);

  const surveyByScanJob = new Map<string, string>();
  for (const row of surveys || []) {
    if (row.scan_job_id && row.id) {
      // Prefer first (oldest) if duplicates; later we can overwrite with latest.
      if (!surveyByScanJob.has(row.scan_job_id)) {
        surveyByScanJob.set(row.scan_job_id, row.id);
      }
    }
  }
  // Prefer newest survey_record per scan_job_id
  for (const row of [...(surveys || [])].reverse()) {
    if (row.scan_job_id && row.id) {
      surveyByScanJob.set(row.scan_job_id, row.id);
    }
  }

  const { data: orphanEvidence, error: evidenceError } = await supabase
    .from("evidence_files")
    .select("id, scan_job_id, survey_record_id")
    .is("survey_record_id", null)
    .not("scan_job_id", "is", null)
    .limit(5000);
  if (evidenceError) throw new Error(evidenceError.message);

  let evidenceUpdated = 0;
  let evidenceSkipped = 0;
  for (const row of orphanEvidence || []) {
    const surveyId = row.scan_job_id
      ? surveyByScanJob.get(row.scan_job_id)
      : null;
    if (!surveyId) {
      evidenceSkipped += 1;
      continue;
    }
    if (dryRun) {
      evidenceUpdated += 1;
      continue;
    }
    const { error } = await supabase
      .from("evidence_files")
      .update({ survey_record_id: surveyId })
      .eq("id", row.id)
      .is("survey_record_id", null);
    if (error) throw new Error(`evidence update ${row.id}: ${error.message}`);
    evidenceUpdated += 1;
  }

  const { data: orphanCaptures, error: captureError } = await supabase
    .from("capture_jobs")
    .select("id, scan_job_id, survey_record_id")
    .is("survey_record_id", null)
    .not("scan_job_id", "is", null)
    .limit(5000);
  if (captureError) throw new Error(captureError.message);

  let captureUpdated = 0;
  let captureSkipped = 0;
  for (const row of orphanCaptures || []) {
    const surveyId = row.scan_job_id
      ? surveyByScanJob.get(row.scan_job_id)
      : null;
    if (!surveyId) {
      captureSkipped += 1;
      continue;
    }
    if (dryRun) {
      captureUpdated += 1;
      continue;
    }
    const { error } = await supabase
      .from("capture_jobs")
      .update({ survey_record_id: surveyId })
      .eq("id", row.id)
      .is("survey_record_id", null);
    if (error) throw new Error(`capture update ${row.id}: ${error.message}`);
    captureUpdated += 1;
  }

  console.log(
    `evidence_files: ${evidenceUpdated} ${dryRun ? "would update" : "updated"}, ${evidenceSkipped} skipped (no survey match)`,
  );
  console.log(
    `capture_jobs: ${captureUpdated} ${dryRun ? "would update" : "updated"}, ${captureSkipped} skipped (no survey match)`,
  );
  console.log("Result: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.log("Result: FAIL");
  process.exit(1);
});
