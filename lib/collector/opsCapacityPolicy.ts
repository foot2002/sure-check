/**
 * Operating capacity for official-site crawl waves and auto-diagnosis workers.
 * Scale by adding waves, not by raising orgs-per-run or scanBatch.
 */

import { OFFICIAL_SITE_MAX_ORGS_PER_RUN } from "@/lib/collector/officialSiteCrawlPolicy";

/** Six once-daily vercel.json entries (KST 00:30 / 03:30 / 06:30 / 12:30 / 18:30 / 21:30). */
export const OFFICIAL_SITE_CRON_PATH = "/api/internal/collector/official-sites";
export const OFFICIAL_SITE_CRON_SCHEDULES = [
  "30 3 * * *",
  "30 9 * * *",
  "30 12 * * *",
  "30 15 * * *",
  "30 18 * * *",
  "30 21 * * *",
] as const;
export const OFFICIAL_SITE_CRON_SCHEDULE = OFFICIAL_SITE_CRON_SCHEDULES[0];
export const OFFICIAL_SITE_WAVES_PER_DAY = 6;
export const OFFICIAL_SITE_TARGET_ORGS_PER_DAY =
  OFFICIAL_SITE_MAX_ORGS_PER_RUN * OFFICIAL_SITE_WAVES_PER_DAY;

/** Recover crawl_status=running leftover after a killed Vercel invocation. */
export const OFFICIAL_SITE_STALE_RUNNING_MS = 20 * 60 * 1000;

export const SCAN_WORKER_CRON_PATH = "/api/internal/jobs/run-next";
export const SCAN_WORKER_DEFAULT_BATCH = 3;
export const SCAN_WORKER_FUTURE_BATCH = 5;
export const SCAN_WORKER_RUNS_PER_DAY = 22;
export const DIAGNOSIS_COMPLETED_DAILY_TARGET = 100;

export const SOURCE_PAGE_URL_RATE_TARGET = 0.9;
export const DATE_EXTRACT_RATE_TARGET = 0.5;
export const DATE_UNKNOWN_HOLD_RATIO_TARGET = 0.3;
export const POSTED_DATE_EXTRACT_RATE_TARGET = 0.5;
export const PERIOD_EXTRACT_RATE_TARGET = 0.5;

export type VercelCronEntry = { path?: string; schedule?: string };

function cronFieldHits(field: string, min: number, max: number): number {
  const raw = (field || "*").trim();
  if (raw === "*") return max - min + 1;
  if (raw.startsWith("*/")) {
    const step = Number(raw.slice(2));
    if (!Number.isFinite(step) || step <= 0) return 0;
    let n = 0;
    for (let i = min; i <= max; i += step) n += 1;
    return n;
  }
  if (raw.includes(",")) {
    return raw.split(",").filter((part) => part.trim().length > 0).length;
  }
  return 1;
}

/** Daily fire count for a 5-field cron that uses `*` for day/month/dow. */
export function cronScheduleDailyFires(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return 0;
  return cronFieldHits(parts[0], 0, 59) * cronFieldHits(parts[1], 0, 23);
}

export function scheduleIsOnceDaily(schedule: string): boolean {
  return cronScheduleDailyFires(schedule) === 1 && !/,/.test(schedule);
}

export function hasMultiHourCronExpression(crons: VercelCronEntry[]): boolean {
  return crons.some((job) => /,/.test(job.schedule || ""));
}

export function countCronJobsForPath(
  crons: VercelCronEntry[],
  path: string,
): number {
  return crons.filter((job) => job.path === path).length;
}

export function officialSiteWavesPerDayFromCrons(
  crons: VercelCronEntry[],
): number {
  const jobs = crons.filter((job) => job.path === OFFICIAL_SITE_CRON_PATH);
  return jobs.reduce(
    (sum, job) => sum + cronScheduleDailyFires(job.schedule || ""),
    0,
  );
}

export function estimatedDiagnosisMaxPerDay(
  scanBatch = SCAN_WORKER_DEFAULT_BATCH,
  workerRunsPerDay = SCAN_WORKER_RUNS_PER_DAY,
): number {
  return Math.max(0, scanBatch) * Math.max(0, workerRunsPerDay);
}

export function estimatedOfficialSiteOrgsPerDay(
  orgsPerRun = OFFICIAL_SITE_MAX_ORGS_PER_RUN,
  wavesPerDay = OFFICIAL_SITE_WAVES_PER_DAY,
): number {
  return orgsPerRun * wavesPerDay;
}
