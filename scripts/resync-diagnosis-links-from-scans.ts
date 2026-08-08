/**
 * Re-sync survey_diagnosis_links from scan_jobs for a prior enqueue batch.
 * Requires migration 008.
 *
 * Usage:
 *   npx tsx scripts/resync-diagnosis-links-from-scans.ts --meta=scripts/tmp-diagnosis-enqueue-10.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { syncDiagnosisLinkFromScanJob } from "../lib/collector/diagnosisLinkRepository";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

async function main() {
  loadLocalEnvFiles();
  let metaPath = "scripts/tmp-diagnosis-enqueue-10.json";
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--meta=")) metaPath = arg.slice(7);
  }
  const meta = JSON.parse(
    readFileSync(resolve(process.cwd(), metaPath), "utf8"),
  );
  const outcomes = meta.outcomes as Array<{
    surveyLinkId: string;
    diagnosisJobId: string;
  }>;

  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error: probe } = await sb
    .from("survey_diagnosis_links")
    .select("id, extractor_key")
    .limit(1);
  if (probe) {
    console.log(
      JSON.stringify({
        ok: false,
        error: probe.message,
        action:
          "Apply db/migrations/008_survey_diagnosis_link_statuses.sql first",
      }),
    );
    process.exit(2);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const o of outcomes) {
    const { data: link } = await sb
      .from("survey_diagnosis_links")
      .select("id, status, report_id, last_error, extractor_key")
      .eq("survey_link_id", o.surveyLinkId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!link?.id || !o.diagnosisJobId) {
      rows.push({
        surveyLinkId: o.surveyLinkId,
        ok: false,
        error: "link_missing",
      });
      continue;
    }
    const next = await syncDiagnosisLinkFromScanJob(
      String(link.id),
      o.diagnosisJobId,
    );
    const { data: after } = await sb
      .from("survey_diagnosis_links")
      .select("id, status, report_id, last_error, extractor_key, skip_reason")
      .eq("id", link.id)
      .maybeSingle();
    rows.push({
      surveyLinkId: o.surveyLinkId,
      diagnosisJobId: o.diagnosisJobId,
      before: link.status,
      after: after?.status ?? next,
      report_id: after?.report_id ?? null,
      extractor_key: after?.extractor_key ?? null,
      last_error: after?.last_error ?? null,
    });
  }

  const payload = { done_at: new Date().toISOString(), rows };
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp-diagnosis-resync-10.json"),
    JSON.stringify(payload, null, 2),
  );
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
