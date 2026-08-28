/**
 * Official-site crawl waves must stay sequential: 8 orgs, no parallel collector.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OFFICIAL_SITE_MAX_CONCURRENCY,
  OFFICIAL_SITE_RUN_BUDGET_MS,
  OFFICIAL_SITE_RUN_FINISH_RESERVE_MS,
  shouldDeferOfficialSiteOrg,
} from "../lib/collector/officialSiteCrawlPolicy";
import {
  countCronJobsForPath,
  OFFICIAL_SITE_CRON_PATH,
  scheduleIsOnceDaily,
} from "../lib/collector/opsCapacityPolicy";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Crawl Wave Check]\n");

{
  assert.equal(OFFICIAL_SITE_MAX_CONCURRENCY, 1);
  console.log("  PASS  max concurrency is 1");
}

{
  const run = source("lib/collector/runOfficialSiteCollection.ts");
  assert.ok(run.includes("already_running"));
  assert.ok(run.includes("skippedParallel"));
  assert.ok(run.includes("claimOfficialSiteCrawl"));
  assert.ok(run.includes("recoverStaleOfficialSiteRunning"));
  assert.ok(run.includes("countOfficialSitesRunning"));
  assert.ok(run.includes("releaseOfficialSiteCrawlClaim"));
  assert.ok(run.includes("shouldDeferOfficialSiteOrg"));
  assert.ok(run.includes("budgetMs"));
  assert.ok(!run.includes("Promise.all("));
  assert.ok(run.includes("for (const row of claimed)"));
  console.log("  PASS  wave runner claims orgs and skips if another wave is running");
}

{
  const vercel = JSON.parse(source("vercel.json")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const jobs = (vercel.crons || []).filter((c) => c.path === OFFICIAL_SITE_CRON_PATH);
  assert.equal(countCronJobsForPath(vercel.crons || [], OFFICIAL_SITE_CRON_PATH), 6);
  for (const job of jobs) {
    assert.equal(scheduleIsOnceDaily(job.schedule || ""), true, job.schedule);
    assert.equal((job.schedule || "").includes(","), false);
  }
  console.log("  PASS  six staggered once-daily official-site crons (not one multi-hour job)");
}

{
  const admin = source("app/api/report/admin/collector/official-sites/route.ts");
  const internal = source("app/api/internal/collector/official-sites/route.ts");
  assert.ok(admin.includes("OFFICIAL_SITE_MAX_ORGS_PER_RUN"));
  assert.ok(internal.includes("OFFICIAL_SITE_MAX_ORGS_PER_RUN"));
  assert.ok(admin.includes("skippedParallel"));
  console.log("  PASS  HTTP wrappers keep per-run cap and parallel skip");
}

{
  assert.ok(OFFICIAL_SITE_RUN_BUDGET_MS > 240_000);
  assert.ok(OFFICIAL_SITE_RUN_BUDGET_MS + OFFICIAL_SITE_RUN_FINISH_RESERVE_MS <= 300_000);
  assert.equal(
    shouldDeferOfficialSiteOrg({
      startedAtMs: 0,
      nowMs: OFFICIAL_SITE_RUN_BUDGET_MS - OFFICIAL_SITE_RUN_FINISH_RESERVE_MS,
    }),
    true,
  );
  assert.equal(
    shouldDeferOfficialSiteOrg({
      startedAtMs: 0,
      nowMs: OFFICIAL_SITE_RUN_BUDGET_MS - OFFICIAL_SITE_RUN_FINISH_RESERVE_MS - 1,
    }),
    false,
  );
  const repo = source("lib/collector/officialSiteRepository.ts");
  assert.ok(repo.includes("releaseOfficialSiteCrawlClaim"));
  assert.ok(repo.includes('crawl_status: "idle"'));
  console.log("  PASS  overtime orgs are deferred, not marked failed");
}

console.log("\nofficial-site-crawl-wave-check: ok");
