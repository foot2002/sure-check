/**
 * Operating capacity for official-site crawl waves and auto-diagnosis workers.
 * Scale by adding waves, not by raising orgs-per-run or scanBatch.
 */

import { OFFICIAL_SITE_MAX_ORGS_PER_RUN } from "@/lib/collector/officialSiteCrawlPolicy";

/**
 * Hobby-safe once-daily expressions. Hourly or repeating-minute crons fail
 * Vercel Hobby deploys ("cron jobs that run more than once per day").
 */
export function hobbyOnceDailyHourlySchedules(minute: number): string[] {
  const m = Math.max(0, Math.min(59, Math.floor(minute)));
  return Array.from({ length: 24 }, (_, hour) => `${m} ${hour} * * *`);
}

/**
 * Never-crawled official-site sprint on Hobby: 24 once-daily hourly slots,
 * 8 orgs/run. Repeating-hour expressions fail Hobby deploys; keep one
 * expression per UTC hour. Naver A/B paused.
 * Keep 8 orgs/run; do not overlap waves (already_running skip).
 */
export const OFFICIAL_SITE_CRON_PATH = "/api/internal/collector/official-sites";
export const OFFICIAL_SITE_CRON_SCHEDULES = hobbyOnceDailyHourlySchedules(30);
export const OFFICIAL_SITE_CRON_SCHEDULE = OFFICIAL_SITE_CRON_SCHEDULES[0];
export const OFFICIAL_SITE_WAVES_PER_DAY = OFFICIAL_SITE_CRON_SCHEDULES.length;
export const OFFICIAL_SITE_TARGET_ORGS_PER_DAY =
  OFFICIAL_SITE_MAX_ORGS_PER_RUN * OFFICIAL_SITE_WAVES_PER_DAY;

/** Recover crawl_status=running leftover after a killed Vercel invocation. */
export const OFFICIAL_SITE_STALE_RUNNING_MS = 20 * 60 * 1000;

export const SCAN_WORKER_CRON_PATH = "/api/internal/jobs/run-next";
export const SCAN_WORKER_DEFAULT_BATCH = 3;
export const SCAN_WORKER_FUTURE_BATCH = 5;
/** Proven Hobby worker slots from production (22 once-daily expressions). */
export const SCAN_WORKER_CRON_SCHEDULES = [
  "15 0 * * *",
  "15 1 * * *",
  "15 2 * * *",
  "15 4 * * *",
  "15 5 * * *",
  "15 6 * * *",
  "15 8 * * *",
  "15 9 * * *",
  "15 10 * * *",
  "15 11 * * *",
  "45 0 * * *",
  "45 1 * * *",
  "45 2 * * *",
  "45 4 * * *",
  "45 5 * * *",
  "45 6 * * *",
  "45 8 * * *",
  "45 9 * * *",
  "45 10 * * *",
  "45 11 * * *",
  "30 14 * * *",
  "30 22 * * *",
] as const;
export const SCAN_WORKER_RUNS_PER_DAY = SCAN_WORKER_CRON_SCHEDULES.length;

export const DIAGNOSIS_DISPATCH_CRON_PATH =
  "/api/internal/collector/diagnosis-dispatch";
export const DIAGNOSIS_DISPATCH_CRON_SCHEDULES = [
  "0 0 * * *",
  "0 1 * * *",
  "0 2 * * *",
  "0 4 * * *",
  "0 5 * * *",
  "0 6 * * *",
  "0 8 * * *",
  "0 9 * * *",
  "0 10 * * *",
  "0 11 * * *",
] as const;
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
