/**
 * org_v1.1 dry-run compare (no survey_links writes).
 * Usage: npx tsx scripts/test-collector-org-v11-dryrun.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runOrgV11Collection } from "../lib/collector/runOrgV11Collection";
import { summarizeSearchStrategy } from "../lib/collector/searchQueries";
import {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_ORG_RUNTIME_TARGET_MS,
} from "../lib/collector/opsPolicy";

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
  const catalog = summarizeSearchStrategy("org_v1");
  const t0 = Date.now();
  const result = await runOrgV11Collection({
    trigger: "admin",
    dryRun: true,
  });
  const elapsedMs = Date.now() - t0;

  if (!result.ok) {
    console.error(result);
    process.exit(1);
  }

  const sample = result.meta.sampleOrgReview;
  const sampleTotal = Object.values(sample).reduce((a, b) => a + b, 0) || 1;
  const official =
    (sample.public || 0) +
    (sample.company || 0) +
    (sample.university_official || 0);

  const report = {
    mode: "dryRun org_v1.1",
    catalog,
    ok: true,
    apiCalls: result.stats.apiCalls,
    resultsCount: result.stats.resultsCount,
    candidateLinksCount: result.stats.candidateLinksCount,
    estimatedNewSurveys: result.stats.newSurveysCount,
    duplicates: result.stats.duplicateSurveysCount,
    inlinePageValidates: result.meta.inlinePageValidates,
    inlineBudget: result.meta.inlineBudget,
    backlogDeferred: result.meta.deferredDiscovered,
    elapsedMs: result.meta.elapsedMs || elapsedMs,
    runtimeTargetMs: COLLECTOR_ORG_RUNTIME_TARGET_MS,
    underTarget: (result.meta.elapsedMs || elapsedMs) <= COLLECTOR_ORG_RUNTIME_TARGET_MS,
    sampleOrgReviewDuringSearch: sample,
    sampleOfficialPct: Number(((official / sampleTotal) * 100).toFixed(1)),
    sampleAcademicPct: Number(
      (((sample.individual_or_academic || 0) / sampleTotal) * 100).toFixed(1),
    ),
    proposedDailyBacklogJobs: {
      batchSize: COLLECTOR_DISCOVERED_BATCH_SIZE,
      timesKst: ["12:00", "16:00", "20:00"],
      dailyCapacity: COLLECTOR_DISCOVERED_BATCH_SIZE * 3,
      registeredInVercelJson: false,
    },
    productionJudgment: "pending_after_full_report",
  };

  const out = resolve(process.cwd(), "scripts/tmp-org-v11-dryrun.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
