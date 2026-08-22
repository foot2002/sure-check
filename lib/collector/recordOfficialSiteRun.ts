/**
 * Persist official-site crawl runs into collection_runs without taking the
 * Naver collector "one running" lock. Rows are inserted already finished.
 */

import { getKstDayBounds } from "@/lib/collector/diagnosisLinkRepository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OfficialSiteRunTrigger = "cron" | "manual" | "test" | "admin";

export const OFFICIAL_SITE_RUN_MARKER = "[official_site]";

export type OfficialSiteRunRecord = {
  runTrigger: OfficialSiteRunTrigger;
  startedAt: Date | string;
  completedAt: Date | string;
  institutionsCrawled: number;
  pagesFetched: number;
  surveysFound: number;
  errorCount?: number;
  status?: "completed" | "failed" | "partial";
};

export function collectionTriggerForOfficialSite(
  runTrigger: OfficialSiteRunTrigger,
): "cron" | "admin" {
  return runTrigger === "cron" ? "cron" : "admin";
}

export function buildOfficialSiteRunSummary(input: OfficialSiteRunRecord): string {
  return [
    OFFICIAL_SITE_RUN_MARKER,
    `run_trigger=${input.runTrigger}`,
    "run_source=official_site",
    `institutions_crawled=${Math.max(0, input.institutionsCrawled)}`,
    `pages_fetched=${Math.max(0, input.pagesFetched)}`,
    `surveys_found=${Math.max(0, input.surveysFound)}`,
  ].join(" ");
}

export function parseOfficialSiteRunSummary(summary: string | null | undefined): {
  runTrigger: OfficialSiteRunTrigger | null;
  institutionsCrawled: number;
  pagesFetched: number;
  surveysFound: number;
} | null {
  const text = String(summary || "");
  if (!text.includes(OFFICIAL_SITE_RUN_MARKER)) return null;
  const triggerMatch = text.match(/run_trigger=(cron|manual|test|admin)/);
  const inst = Number(text.match(/institutions_crawled=(\d+)/)?.[1] || 0);
  const pages = Number(text.match(/pages_fetched=(\d+)/)?.[1] || 0);
  const surveys = Number(text.match(/surveys_found=(\d+)/)?.[1] || 0);
  const trigger = triggerMatch?.[1] as OfficialSiteRunTrigger | undefined;
  return {
    runTrigger: trigger || null,
    institutionsCrawled: Number.isFinite(inst) ? inst : 0,
    pagesFetched: Number.isFinite(pages) ? pages : 0,
    surveysFound: Number.isFinite(surveys) ? surveys : 0,
  };
}

export function isRegularOfficialSiteTrigger(
  trigger: OfficialSiteRunTrigger | null,
): boolean {
  return trigger === "cron";
}

export async function recordOfficialSiteCollectionRun(
  input: OfficialSiteRunRecord,
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    const started =
      input.startedAt instanceof Date
        ? input.startedAt.toISOString()
        : new Date(input.startedAt).toISOString();
    const completed =
      input.completedAt instanceof Date
        ? input.completedAt.toISOString()
        : new Date(input.completedAt).toISOString();
    const errorCount = input.errorCount || 0;
    const status =
      input.status ||
      (errorCount === 0
        ? "completed"
        : input.institutionsCrawled > 0
          ? "partial"
          : "failed");
    const { error } = await supabase.from("collection_runs").insert({
      trigger: collectionTriggerForOfficialSite(input.runTrigger),
      status,
      started_at: started,
      completed_at: completed,
      queries_count: 0,
      results_count: Math.max(0, input.pagesFetched),
      candidate_links_count: Math.max(0, input.institutionsCrawled),
      new_surveys_count: Math.max(0, input.surveysFound),
      duplicate_surveys_count: 0,
      error_count: errorCount,
      error_summary: buildOfficialSiteRunSummary(input),
    });
    if (error) {
      console.warn("[collector] official-site run record skipped:", error.message);
    }
  } catch (error) {
    console.warn(
      "[collector] official-site run record failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function countOfficialSiteRunsToday(
  now: Date = new Date(),
): Promise<{
  cronInstitutions: number;
  manualInstitutions: number;
  runCount: number;
  hasRunRecords: boolean;
}> {
  const empty = {
    cronInstitutions: 0,
    manualInstitutions: 0,
    runCount: 0,
    hasRunRecords: false,
  };
  try {
    const bounds = getKstDayBounds(now);
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("collection_runs")
      .select("error_summary, candidate_links_count, trigger")
      .gte("started_at", bounds.startUtcIso)
      .lt("started_at", bounds.endUtcIso)
      .like("error_summary", `${OFFICIAL_SITE_RUN_MARKER}%`)
      .limit(80);
    if (error || !data) return empty;
    let cronInstitutions = 0;
    let manualInstitutions = 0;
    for (const row of data) {
      const parsed = parseOfficialSiteRunSummary(String(row.error_summary || ""));
      const n =
        parsed?.institutionsCrawled || Number(row.candidate_links_count || 0);
      const trigger = parsed?.runTrigger || (row.trigger === "cron" ? "cron" : "admin");
      if (isRegularOfficialSiteTrigger(trigger)) cronInstitutions += n;
      else manualInstitutions += n;
    }
    return {
      cronInstitutions,
      manualInstitutions,
      runCount: data.length,
      hasRunRecords: data.length > 0,
    };
  } catch {
    return empty;
  }
}
