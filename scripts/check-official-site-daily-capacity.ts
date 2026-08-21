/**
 * Official-site daily capacity: 8 orgs/run × 4 waves = 32/day, one cron entry.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cronScheduleDailyFires,
  countCronJobsForPath,
  estimatedOfficialSiteOrgsPerDay,
  OFFICIAL_SITE_CRON_PATH,
  OFFICIAL_SITE_CRON_SCHEDULE,
  OFFICIAL_SITE_TARGET_ORGS_PER_DAY,
  OFFICIAL_SITE_WAVES_PER_DAY,
  officialSiteWavesPerDayFromCrons,
} from "../lib/collector/opsCapacityPolicy";
import { OFFICIAL_SITE_MAX_ORGS_PER_RUN } from "../lib/collector/officialSiteCrawlPolicy";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Daily Capacity Check]\n");

{
  assert.equal(OFFICIAL_SITE_MAX_ORGS_PER_RUN, 8);
  assert.equal(OFFICIAL_SITE_WAVES_PER_DAY, 4);
  assert.equal(OFFICIAL_SITE_TARGET_ORGS_PER_DAY, 32);
  assert.equal(estimatedOfficialSiteOrgsPerDay(), 32);
  console.log("  PASS  8 orgs/run × 4 waves = 32 orgs/day");
}

{
  const vercel = JSON.parse(source("vercel.json")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const crons = vercel.crons || [];
  assert.ok(crons.length <= 40, `too many crons: ${crons.length}`);
  assert.equal(countCronJobsForPath(crons, OFFICIAL_SITE_CRON_PATH), 1);
  const job = crons.find((c) => c.path === OFFICIAL_SITE_CRON_PATH);
  assert.equal(job?.schedule, OFFICIAL_SITE_CRON_SCHEDULE);
  assert.equal(cronScheduleDailyFires(job?.schedule || ""), 4);
  assert.equal(officialSiteWavesPerDayFromCrons(crons), 4);
  console.log("  PASS  one official-site cron fires 4 times/day (no extra cron entries)");
}

{
  const run = source("lib/collector/runOfficialSiteCollection.ts");
  assert.ok(run.includes("OFFICIAL_SITE_MAX_ORGS_PER_RUN"));
  assert.ok(!/limit\s*=\s*(20|32|50)/.test(run));
  const repo = source("lib/collector/officialSiteRepository.ts");
  assert.ok(repo.includes("OFFICIAL_SITE_MAX_ORGS_PER_RUN"));
  console.log("  PASS  per-run org cap stays 8");
}

{
  const view = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(view.includes("공식 사이트 수집 기관 수"));
  assert.ok(view.includes("런당"));
  console.log("  PASS  collector dashboard shows official-site daily capacity");
}

console.log("\nofficial-site-daily-capacity-check: ok");
