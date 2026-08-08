/**
 * Dry-run both org_v1.2 partitions with live Naver API + phase timing.
 * Does not write survey_links. Does not change Production env.
 *
 * Usage: npx tsx scripts/test-collector-partitions-dryrun.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runOrgV11Collection } from "../lib/collector/runOrgV11Collection";
import {
  COLLECTOR_PARTITION_RUNTIME_MAX_MS,
  summarizePartitionQueries,
  type CollectorPartition,
} from "../lib/collector/searchPartitions";

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

async function runOne(partition: CollectorPartition) {
  const catalog = summarizePartitionQueries(partition);
  const started = Date.now();
  const result = await runOrgV11Collection({
    trigger: "admin",
    dryRun: true,
    partition,
  });
  const wallMs = Date.now() - started;
  if (!result.ok) {
    return { partition, ok: false as const, error: result.error, catalog, wallMs };
  }
  return {
    partition,
    ok: true as const,
    catalog,
    wallMs,
    apiCalls: result.stats.apiCalls,
    queriesCount: result.stats.queriesCount,
    resultsCount: result.stats.resultsCount,
    candidateCount: result.stats.candidateLinksCount,
    queueCounts: result.meta.queueCounts,
    cappedA: result.meta.cappedA,
    cappedB: result.meta.cappedB,
    elapsedMs: result.meta.elapsedMs,
    phaseTiming: result.meta.phaseTiming,
    topPhase: result.meta.topPhase,
    under75s: wallMs < COLLECTOR_PARTITION_RUNTIME_MAX_MS,
    under60s: wallMs < 60_000,
  };
}

async function main() {
  loadLocalEnvFiles();
  // Force canary caps for expected A/B reporting (local only)
  process.env.COLLECTOR_CANARY = "1";
  process.env.COLLECTOR_SEARCH_STRATEGY = "org_v1.2";

  const a = await runOne("a");
  const b = await runOne("b");

  const report = {
    mode: "partition dry-run (no DB writes)",
    partitionA: a,
    partitionB: b,
    combined: {
      apiCalls:
        (a.ok ? a.apiCalls || 0 : 0) + (b.ok ? b.apiCalls || 0 : 0),
      resultsCount:
        (a.ok ? a.resultsCount || 0 : 0) + (b.ok ? b.resultsCount || 0 : 0),
      candidateCount:
        (a.ok ? a.candidateCount || 0 : 0) + (b.ok ? b.candidateCount || 0 : 0),
      cappedAB:
        (a.ok ? (a.cappedA || 0) + (a.cappedB || 0) : 0) +
        (b.ok ? (b.cappedA || 0) + (b.cappedB || 0) : 0),
      note: "dry-run shared cap not persisted; Production uses getRemainingDailyAbCaps",
    },
    productionReady:
      a.ok &&
      b.ok &&
      (a as { under75s?: boolean }).under75s === true &&
      (b as { under75s?: boolean }).under75s === true,
    cronProposal: {
      note: "Do not apply until approved",
      collectA: { kst: "06:00", utc: "0 21 * * *", path: "/api/internal/collector/run?partition=a" },
      collectB: { kst: "06:20", utc: "20 21 * * *", path: "/api/internal/collector/run?partition=b" },
      revalidate: [
        { kst: "12:00", utc: "0 3 * * *", batch: 50 },
        { kst: "16:00", utc: "0 7 * * *", batch: 50, status: "proposed" },
        { kst: "20:00", utc: "0 11 * * *", batch: 50, status: "proposed" },
      ],
      backlogNote:
        "discovered≈196 → 3×50/day drains ~150; keep 12/16/20 if inflow≤150",
    },
  };

  const path = resolve(process.cwd(), "scripts/tmp-partition-dryrun.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path}`);
  if (!report.productionReady) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
