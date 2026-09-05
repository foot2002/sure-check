/**
 * Official-site daily capacity: 8 orgs/run × 96 fifteen-minute waves = 768/day.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cronScheduleDailyFires,
  countCronJobsForPath,
  estimatedOfficialSiteOrgsPerDay,
  hasMultiHourCronExpression,
  OFFICIAL_SITE_CRON_PATH,
  OFFICIAL_SITE_CRON_SCHEDULES,
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
  assert.equal(OFFICIAL_SITE_WAVES_PER_DAY, 96);
  assert.equal(OFFICIAL_SITE_TARGET_ORGS_PER_DAY, 768);
  assert.equal(estimatedOfficialSiteOrgsPerDay(), 768);
  console.log("  PASS  8 orgs/run × 96 waves = 768 orgs/day");
}

{
  const vercel = JSON.parse(source("vercel.json")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const crons = vercel.crons || [];
  assert.ok(crons.length <= 100, `too many crons: ${crons.length}`);
  assert.equal(hasMultiHourCronExpression(crons), false);
  assert.equal(countCronJobsForPath(crons, OFFICIAL_SITE_CRON_PATH), 4);
  const jobs = crons.filter((c) => c.path === OFFICIAL_SITE_CRON_PATH);
  const schedules = jobs.map((job) => job.schedule || "").sort();
  assert.deepEqual(schedules, [...OFFICIAL_SITE_CRON_SCHEDULES].sort());
  for (const job of jobs) {
    assert.equal((job.schedule || "").includes(","), false, job.schedule);
    assert.equal(cronScheduleDailyFires(job.schedule || ""), 24, job.schedule);
  }
  assert.equal(officialSiteWavesPerDayFromCrons(crons), 96);
  console.log("  PASS  four hourly official-site crons (15-minute cadence, no comma hours)");
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
  assert.ok(view.includes("공공 사이트 수집 기관 수"));
  assert.ok(view.includes("15분 간격 24시간"));
  assert.ok(view.includes("회당 최대"));
  assert.ok(view.includes("8기관"));
  console.log("  PASS  collector dashboard shows official-site daily capacity");
}

console.log("\nofficial-site-daily-capacity-check: ok");
