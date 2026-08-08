/**
 * Measure one revalidate batch timing + propose daily capacity.
 * Does NOT change Cron schedules.
 *
 * Usage: npx tsx scripts/measure-revalidate-batch.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_REVALIDATE_CONCURRENCY,
  COLLECTOR_UNREACHABLE_BATCH_SIZE,
} from "../lib/collector/opsPolicy";
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

async function countStatus(status: string): Promise<number> {
  const sb = createSupabaseServerClient();
  const { count } = await sb
    .from("survey_links")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

async function main() {
  loadLocalEnvFiles();
  const beforeDiscovered = await countStatus("discovered");
  const beforeUnreachable = await countStatus("unreachable");

  const t0 = Date.now();
  const result = await revalidatePendingSurveyLinks({
    statuses: ["discovered"],
    limit: COLLECTOR_DISCOVERED_BATCH_SIZE,
    concurrency: COLLECTOR_REVALIDATE_CONCURRENCY,
    order: "newest",
    maxRetries: 2,
  });
  const elapsedMs = Date.now() - t0;
  const perUrlMs =
    result.processed > 0 ? elapsedMs / result.processed : elapsedMs;

  const afterDiscovered = await countStatus("discovered");
  const maxDurationMs = 120_000;
  const safeBatchAt70pct = Math.max(
    10,
    Math.floor((maxDurationMs * 0.7) / Math.max(perUrlMs, 1)),
  );
  // Assume org_v1.1 may add ~150–250 discovered/day if inline=40 and rest deferred
  const assumedDailyInflow = 200;
  const jobsNeeded = Math.ceil(assumedDailyInflow / safeBatchAt70pct);
  const proposed = {
    batchSize: Math.min(safeBatchAt70pct, 60),
    jobsPerDay: Math.max(jobsNeeded, 3),
    suggestedKstTimes: ["12:00", "16:00", "20:00"],
    note: "Cron not changed — proposal only",
  };

  const report = {
    measured: {
      batchLimit: COLLECTOR_DISCOVERED_BATCH_SIZE,
      concurrency: COLLECTOR_REVALIDATE_CONCURRENCY,
      elapsedMs,
      processed: result.processed,
      pageRequests: result.pageRequests,
      perUrlMs: Number(perUrlMs.toFixed(1)),
      beforeDiscovered,
      afterDiscovered,
      beforeUnreachable,
      transitions: result.transitions.length,
      byToStatus: result.byToStatus,
    },
    capacity: {
      vercelMaxDurationMs: maxDurationMs,
      safeBatchAt70pct,
      assumedDailyInflow,
      jobsNeededToDrainInflow: jobsNeeded,
      dailyCapacityAt3Jobs: proposed.batchSize * 3,
      proposed,
      unreachableBatchKeep: COLLECTOR_UNREACHABLE_BATCH_SIZE,
    },
  };

  const out = resolve(process.cwd(), "scripts/tmp-revalidate-batch-measure.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
