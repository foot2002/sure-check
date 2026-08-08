/**
 * Separate discovered vs unreachable revalidation for final ops prep.
 * Usage: npx tsx scripts/test-collector-final-revalidate.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCollectorStorageConfigured } from "../lib/collector/config";
import {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_REVALIDATE_CONCURRENCY,
  COLLECTOR_REVALIDATE_DELAY_MS,
  COLLECTOR_REVALIDATE_MAX_RETRIES,
  COLLECTOR_UNREACHABLE_BATCH_SIZE,
} from "../lib/collector/opsPolicy";
import { revalidatePendingSurveyLinks } from "../lib/collector/revalidatePending";
import { getCollectorSummary } from "../lib/collector/queries";

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

function summarize(label: string, result: Awaited<ReturnType<typeof revalidatePendingSurveyLinks>>) {
  return {
    label,
    targeted: result.targeted,
    processed: result.processed,
    pageRequests: result.pageRequests,
    before: {
      discovered: result.before.discovered ?? 0,
      unreachable: result.before.unreachable ?? 0,
      active: result.before.active ?? 0,
      closed: result.before.closed ?? 0,
      restricted: result.before.restricted ?? 0,
      invalid: result.before.invalid ?? 0,
    },
    after: {
      discovered: result.after.discovered ?? 0,
      unreachable: result.after.unreachable ?? 0,
      active: result.after.active ?? 0,
      closed: result.after.closed ?? 0,
      restricted: result.after.restricted ?? 0,
      invalid: result.after.invalid ?? 0,
    },
    transitions: {
      toActive: result.transitions.filter((t) => t.to === "active").length,
      toClosed: result.transitions.filter((t) => t.to === "closed").length,
      toRestricted: result.transitions.filter((t) => t.to === "restricted").length,
      toInvalid: result.transitions.filter((t) => t.to === "invalid").length,
      toUnreachable: result.transitions.filter((t) => t.to === "unreachable").length,
      toDiscovered: result.transitions.filter((t) => t.to === "discovered").length,
      totalChanged: result.transitions.length,
    },
    errors: result.errors.slice(0, 10),
  };
}

async function main() {
  loadLocalEnvFiles();
  if (!isCollectorStorageConfigured()) {
    console.error("Supabase not configured");
    process.exit(1);
  }

  console.log("=== [1] discovered revalidate (full backlog this prep run) ===");
  const discovered = await revalidatePendingSurveyLinks({
    statuses: ["discovered"],
    concurrency: COLLECTOR_REVALIDATE_CONCURRENCY,
    delayMs: COLLECTOR_REVALIDATE_DELAY_MS,
    maxRetries: COLLECTOR_REVALIDATE_MAX_RETRIES,
    // Prep run: clear current backlog (66). Daily Cron should use BATCH_SIZE.
    limit: 500,
    oldestFirst: true,
  });

  console.log("=== [2] unreachable revalidate ===");
  const unreachable = await revalidatePendingSurveyLinks({
    statuses: ["unreachable"],
    concurrency: COLLECTOR_REVALIDATE_CONCURRENCY,
    delayMs: COLLECTOR_REVALIDATE_DELAY_MS,
    maxRetries: COLLECTOR_REVALIDATE_MAX_RETRIES,
    limit: 500,
    oldestFirst: true,
  });

  const summary = await getCollectorSummary();
  const report = {
    policyNote: {
      dailyDiscoveredBatch: COLLECTOR_DISCOVERED_BATCH_SIZE,
      dailyUnreachableBatch: COLLECTOR_UNREACHABLE_BATCH_SIZE,
      thisPrepRun: "full current backlog (not daily batch cap)",
    },
    discovered: summarize("discovered", discovered),
    unreachable: summarize("unreachable", unreachable),
    finalVerification: summary.verification,
    byPlatformAll: summary.byPlatformAll,
    byStatus: summary.byStatus,
    totalLinksAll: summary.totalLinksAll,
  };

  const out = resolve(process.cwd(), "scripts/tmp-final-revalidate.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
