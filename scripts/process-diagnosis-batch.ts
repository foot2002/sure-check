/**
 * Await processScanJob for each queued diagnosis from enqueue meta.
 * Usage: npx tsx scripts/process-diagnosis-batch.ts --meta=scripts/tmp-diagnosis-enqueue-10.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { processScanJob } from "../lib/jobs/processScanJob";
import { syncDiagnosisLinkFromScanJob } from "../lib/collector/diagnosisLinkRepository";
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

async function main() {
  loadLocalEnvFiles();
  const argv = process.argv.slice(2);
  let metaPath = "scripts/tmp-diagnosis-enqueue-10.json";
  let concurrency = 2;
  let outFile = "scripts/tmp-diagnosis-process-10.json";
  for (const arg of argv) {
    if (arg.startsWith("--meta=")) metaPath = arg.slice(7);
    else if (arg.startsWith("--concurrency="))
      concurrency = Math.max(1, Number(arg.slice(14)) || 2);
    else if (arg.startsWith("--out=")) outFile = arg.slice(6);
  }

  const meta = JSON.parse(
    readFileSync(resolve(process.cwd(), metaPath), "utf8"),
  );
  const items = (meta.outcomes || []).filter(
    (o: { outcome: string; diagnosisJobId?: string }) =>
      o.outcome === "queued" && o.diagnosisJobId,
  ) as Array<{
    surveyLinkId: string;
    diagnosisJobId: string;
    canonicalUrl: string;
    platform: string;
    organization: string;
    recency: string;
  }>;

  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const results: Array<Record<string, unknown>> = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i]!;
      const started = Date.now();
      console.log(
        JSON.stringify({
          event: "process_start",
          i: i + 1,
          total: items.length,
          scanId: item.diagnosisJobId,
        }),
      );
      let status: string | null = null;
      let error: string | null = null;
      try {
        const r = await processScanJob(
          item.diagnosisJobId,
          `bridge_batch_${process.pid}_${i}`,
        );
        status = r.status;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        status = "failed";
      }

      const { data: link } = await sb
        .from("survey_diagnosis_links")
        .select("id, status")
        .eq("survey_link_id", item.surveyLinkId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (link?.id) {
        await syncDiagnosisLinkFromScanJob(String(link.id), item.diagnosisJobId);
      }

      const row = {
        ...item,
        status,
        error,
        duration_ms: Date.now() - started,
      };
      results.push(row);
      console.log(JSON.stringify({ event: "process_done", ...row }));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  writeFileSync(
    resolve(process.cwd(), outFile),
    JSON.stringify({ done_at: new Date().toISOString(), results }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        summary: {
          total: results.length,
          completed: results.filter((r) => r.status === "completed").length,
          failed: results.filter((r) => r.status === "failed").length,
          other: results.filter(
            (r) => r.status !== "completed" && r.status !== "failed",
          ).length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
