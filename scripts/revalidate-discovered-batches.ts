/**
 * Drain discovered backlog in safe batches (no new search).
 * Usage: npx tsx scripts/revalidate-discovered-batches.ts [--batches=3]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTOR_DISCOVERED_BATCH_SIZE } from "../lib/collector/opsPolicy";
import {
  finishCollectionRun,
  recoverStaleCollectionRuns,
  tryStartCollectionRun,
} from "../lib/collector/repository";
import { revalidatePendingSurveyLinks } from "../lib/collector/revalidatePending";
import { createSupabaseServerClient } from "../lib/supabase/server";

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

async function statusCounts() {
  const sb = createSupabaseServerClient();
  const statuses = [
    "discovered",
    "active",
    "closed",
    "restricted",
    "unreachable",
    "invalid",
  ] as const;
  const out: Record<string, number> = {};
  for (const s of statuses) {
    const { count } = await sb
      .from("survey_links")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    out[s] = count ?? 0;
  }
  return out;
}

async function main() {
  loadLocalEnvFiles();
  await recoverStaleCollectionRuns(1);
  const batchesArg = process.argv.find((a) => a.startsWith("--batches="));
  const batches = Math.max(
    1,
    Math.min(12, Number(batchesArg?.split("=")[1] || 3)),
  );

  const before = await statusCounts();
  const runs: Array<Record<string, unknown>> = [];

  for (let i = 0; i < batches; i += 1) {
    const lock = await tryStartCollectionRun("admin");
    if (!lock.ok) {
      runs.push({ batch: i + 1, error: lock.reason });
      break;
    }
    const t0 = Date.now();
    try {
      const result = await revalidatePendingSurveyLinks({
        statuses: ["discovered"],
        limit: COLLECTOR_DISCOVERED_BATCH_SIZE,
        order: i === 0 ? "newest" : "oldest",
        concurrency: 3,
        maxRetries: 2,
      });
      const elapsedMs = Date.now() - t0;
      await finishCollectionRun({
        runId: lock.run.id,
        status: result.errors.length ? "partial" : "completed",
        queriesCount: 0,
        resultsCount: result.pageRequests,
        candidateLinksCount: result.targeted,
        newSurveysCount: result.transitions.filter((t) => t.to === "active")
          .length,
        duplicateSurveysCount: result.transitions.filter(
          (t) => t.to === "closed" || t.to === "restricted",
        ).length,
        errorCount: result.errors.length,
        errorSummary: `[revalidate-batch ${i + 1}/${batches}] processed=${result.processed} elapsedMs=${elapsedMs}\n${JSON.stringify(result.byToStatus)}`.slice(
          0,
          4000,
        ),
      });
      runs.push({
        batch: i + 1,
        order: i === 0 ? "newest" : "oldest",
        elapsedMs,
        processed: result.processed,
        byToStatus: result.byToStatus,
        transitions: result.transitions.length,
      });
      if (result.processed === 0) break;
    } catch (e) {
      await finishCollectionRun({
        runId: lock.run.id,
        status: "failed",
        queriesCount: 0,
        resultsCount: 0,
        candidateLinksCount: 0,
        newSurveysCount: 0,
        duplicateSurveysCount: 0,
        errorCount: 1,
        errorSummary: String(e),
      });
      runs.push({
        batch: i + 1,
        error: e instanceof Error ? e.message : String(e),
      });
      break;
    }
  }

  const after = await statusCounts();
  const report = { before, after, delta: {}, runs };
  for (const k of Object.keys(before)) {
    (report.delta as Record<string, number>)[k] =
      (after[k] || 0) - (before[k] || 0);
  }

  const out = resolve(
    process.cwd(),
    "scripts/tmp-revalidate-discovered-batches.json",
  );
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
