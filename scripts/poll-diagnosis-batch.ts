/**
 * Poll survey_diagnosis_links + scan_jobs/reports for a batch of survey link IDs.
 * Usage: npx tsx scripts/poll-diagnosis-batch.ts --ids=id1,id2 --timeoutMs=900000
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadLocalEnvFiles();
  const argv = process.argv.slice(2);
  let ids: string[] = [];
  let timeoutMs = 15 * 60 * 1000;
  let outFile = "scripts/tmp-diagnosis-batch-result.json";
  let enqueueMetaPath: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--ids=")) ids = arg.slice(6).split(",").filter(Boolean);
    else if (arg.startsWith("--timeoutMs=")) timeoutMs = Number(arg.slice(12));
    else if (arg.startsWith("--out=")) outFile = arg.slice(6);
    else if (arg.startsWith("--meta=")) enqueueMetaPath = arg.slice(7);
  }
  if (enqueueMetaPath) {
    const meta = JSON.parse(
      readFileSync(resolve(process.cwd(), enqueueMetaPath), "utf8"),
    );
    ids = (meta.outcomes || [])
      .filter((o: { outcome: string }) => o.outcome === "queued")
      .map((o: { surveyLinkId: string }) => o.surveyLinkId);
  }
  if (ids.length === 0) throw new Error("no survey link ids");

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("supabase env missing");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const started = Date.now();
  let rows: unknown[] = [];

  while (Date.now() - started < timeoutMs) {
    const { data: links, error } = await sb
      .from("survey_diagnosis_links")
      .select("*")
      .in("survey_link_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const bySurvey = new Map<string, (typeof links)[number]>();
    for (const row of links || []) {
      const sid = String(row.survey_link_id);
      if (!bySurvey.has(sid)) bySurvey.set(sid, row);
    }

    const jobIds = [...bySurvey.values()]
      .map((r) => r.diagnosis_job_id)
      .filter(Boolean) as string[];

    const { data: jobs } = jobIds.length
      ? await sb
          .from("scan_jobs")
          .select(
            "id, external_scan_id, status, error_message, created_at, updated_at, started_at, completed_at, form_url, platform",
          )
          .in("external_scan_id", jobIds)
      : { data: [] as never[] };

    const jobByExt = new Map(
      (jobs || []).map((j) => [String(j.external_scan_id), j]),
    );
    const internalIds = (jobs || []).map((j) => j.id).filter(Boolean);

    const { data: reports } = internalIds.length
      ? await sb
          .from("scan_reports")
          .select(
            "id, scan_job_id, score, risk_level, grade, extractor_key, platform, created_at",
          )
          .in("scan_job_id", internalIds)
      : { data: [] as never[] };

    const reportByJob = new Map<string, (typeof reports)[number]>();
    for (const r of reports || []) {
      const jid = String(r.scan_job_id);
      if (!reportByJob.has(jid)) reportByJob.set(jid, r);
    }

    const { data: surveys } = await sb
      .from("survey_links")
      .select("id, canonical_url, platform, title, status")
      .in("id", ids);
    const surveyById = new Map(
      (surveys || []).map((s) => [String(s.id), s]),
    );

    rows = ids.map((id) => {
      const link = bySurvey.get(id);
      const job = link?.diagnosis_job_id
        ? jobByExt.get(String(link.diagnosis_job_id))
        : null;
      const report = job?.id ? reportByJob.get(String(job.id)) : null;
      const survey = surveyById.get(id);
      const startedAt = job?.started_at || link?.started_at || job?.created_at;
      const completedAt =
        job?.completed_at || link?.completed_at || report?.created_at;
      let durationMs: number | null = null;
      if (startedAt && completedAt) {
        durationMs =
          new Date(String(completedAt)).getTime() -
          new Date(String(startedAt)).getTime();
      }
      return {
        survey_link_id: id,
        url: survey?.canonical_url ?? link?.canonical_url ?? null,
        platform: survey?.platform ?? job?.platform ?? null,
        title: survey?.title ?? null,
        linkage_status: link?.status ?? null,
        scan_job_id: link?.diagnosis_job_id ?? null,
        scan_job_status: job?.status ?? null,
        report_id: report?.id ?? link?.report_id ?? null,
        score: report?.score ?? null,
        risk_level: report?.risk_level ?? null,
        grade: report?.grade ?? null,
        extractor: report?.extractor_key ?? null,
        duration_ms: durationMs,
        last_error: link?.last_error ?? job?.error_message ?? null,
        skip_reason: link?.skip_reason ?? null,
      };
    });

    const terminal = rows.every((r) => {
      const row = r as { linkage_status: string | null; scan_job_status: string | null };
      const ls = row.linkage_status;
      const js = row.scan_job_status;
      const linkDone =
        ls === "completed" || ls === "failed" || ls === "skipped";
      const jobDone =
        js === "completed" ||
        js === "failed" ||
        js === "limited" ||
        js === "cancelled";
      return linkDone || jobDone;
    });

    const summary = {
      elapsed_ms: Date.now() - started,
      total: rows.length,
      completed: rows.filter(
        (r) => (r as { scan_job_status: string | null }).scan_job_status === "completed",
      ).length,
      failed: rows.filter((r) => {
        const x = r as { scan_job_status: string | null; linkage_status: string | null };
        return x.scan_job_status === "failed" || x.linkage_status === "failed";
      }).length,
      pending: rows.filter((r) => {
        const x = r as { scan_job_status: string | null; linkage_status: string | null };
        return (
          !["completed", "failed", "limited", "cancelled"].includes(
            String(x.scan_job_status || ""),
          ) && !["completed", "failed", "skipped"].includes(String(x.linkage_status || ""))
        );
      }).length,
    };
    console.log(JSON.stringify({ poll: summary }));

    if (terminal) break;
    await sleep(8000);
  }

  // Sync linkage statuses from jobs before final write
  const { syncDiagnosisLinkFromScanJob } = await import(
    "../lib/collector/diagnosisLinkRepository"
  );
  const { data: finalLinks } = await sb
    .from("survey_diagnosis_links")
    .select("id, diagnosis_job_id, status, survey_link_id")
    .in("survey_link_id", ids);
  for (const link of finalLinks || []) {
    if (
      link.diagnosis_job_id &&
      (link.status === "queued" || link.status === "running")
    ) {
      await syncDiagnosisLinkFromScanJob(
        String(link.id),
        String(link.diagnosis_job_id),
      );
    }
  }

  // Re-fetch once after sync
  const { data: links2 } = await sb
    .from("survey_diagnosis_links")
    .select("*")
    .in("survey_link_id", ids);
  const bySurvey2 = new Map<string, (typeof links2)[number]>();
  for (const row of links2 || []) {
    const sid = String(row.survey_link_id);
    if (!bySurvey2.has(sid)) bySurvey2.set(sid, row);
  }
  for (const row of rows as Array<Record<string, unknown>>) {
    const link = bySurvey2.get(String(row.survey_link_id));
    if (link) {
      row.linkage_status = link.status;
      row.report_id = link.report_id || row.report_id;
      row.last_error = link.last_error || row.last_error;
    }
  }

  const payload = {
    done_at: new Date().toISOString(),
    elapsed_ms: Date.now() - started,
    rows,
  };
  writeFileSync(resolve(process.cwd(), outFile), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
