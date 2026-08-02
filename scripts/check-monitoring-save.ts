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

async function main(): Promise<void> {
  loadLocalEnvFiles();

  console.log("[Monitoring Save Check]");

  const urlStatus = getSupabaseUrlStatus();
  const keyStatus = getSupabaseServiceRoleKeyStatus();
  console.log(`SUPABASE_URL: ${urlStatus}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${keyStatus}`);

  if (urlStatus !== "OK" || keyStatus !== "OK") {
    console.log("Result: FAIL (missing env)");
    process.exit(1);
  }

  const scanId = `scan_monitoring_check_${Date.now()}`;
  const formUrl =
    "https://docs.google.com/forms/d/e/monitoring-check-fixture/viewform";
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

  const keep = process.argv.includes("--keep");
  const repo = getSupabaseMonitoringRepository();

  try {
    // Clean any leftover with same external id (unlikely)
    await repo.deleteByExternalScanId(scanId).catch(() => 0);

    const saved = await saveMonitoringSnapshot(report);
    console.log("saveMonitoringSnapshot: OK");
    console.log(`  scanJobId: ${saved.scanJobId}`);
    console.log(`  surveyRecordId: ${saved.surveyRecordId}`);
    console.log(`  questions: ${saved.questionCount}`);

    const supabase = createSupabaseServerClient();

    const { data: job, error: jobError } = await supabase
      .from("scan_jobs")
      .select("id, external_scan_id, platform")
      .eq("id", saved.scanJobId)
      .single();
    assert(!jobError && job, `scan_jobs missing: ${jobError?.message}`);
    assert(job.external_scan_id === scanId, "external_scan_id mismatch");
    assert(job.platform === "google_forms", "platform should be google_forms");
    console.log("scan_jobs: OK");

    const { data: scanReport, error: reportError } = await supabase
      .from("scan_reports")
      .select("id, report_json, user_decision_label")
      .eq("id", saved.scanReportId)
      .single();
    assert(
      !reportError && scanReport,
      `scan_reports missing: ${reportError?.message}`,
    );
    assert(
      scanReport.report_json &&
        typeof scanReport.report_json === "object" &&
        (scanReport.report_json as { scanId?: string }).scanId === scanId,
      "report_json.scanId mismatch",
    );
    console.log("scan_reports: OK");

    const { data: survey, error: surveyError } = await supabase
      .from("survey_records")
      .select("id, has_personal_info, platform")
      .eq("id", saved.surveyRecordId)
      .single();
    assert(!surveyError && survey, `survey_records missing: ${surveyError?.message}`);
    assert(survey.has_personal_info === true, "expected personal info flag");
    console.log("survey_records: OK");

    const { count: questionCount, error: qError } = await supabase
      .from("survey_questions")
      .select("id", { count: "exact", head: true })
      .eq("survey_record_id", saved.surveyRecordId);
    assert(!qError, `survey_questions query failed: ${qError?.message}`);
    assert(
      (questionCount ?? 0) > 0,
      "survey_questions should have rows",
    );
    console.log(`survey_questions: OK (${questionCount})`);

    const { count: scoreCount, error: sError } = await supabase
      .from("survey_index_scores")
      .select("id", { count: "exact", head: true })
      .eq("survey_record_id", saved.surveyRecordId);
    assert(!sError, `survey_index_scores query failed: ${sError?.message}`);
    assert((scoreCount ?? 0) === 1, "survey_index_scores should have 1 row");
    console.log("survey_index_scores: OK");

    if (!keep) {
      const deleted = await repo.deleteByExternalScanId(scanId);
      assert(deleted >= 1, "failed to delete test scan_jobs row");
      console.log("cleanup: OK (deleted test rows)");
    } else {
      console.log("cleanup: SKIPPED (--keep)");
    }

    console.log("Result: PASS");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    try {
      await repo.deleteByExternalScanId(scanId);
    } catch {
      // ignore cleanup errors
    }
    console.log("Result: FAIL");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
