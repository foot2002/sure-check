import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertWeeklySnapshotSafe } from "@/lib/weekly/safety";
import type {
  WeeklyListCard,
  WeeklyReportRow,
  WeeklyReportSnapshot,
  WeeklyReportStatus,
} from "@/lib/weekly/types";

type DbRow = {
  id: string;
  week_id: string;
  week_label: string;
  period_start_kst: string;
  period_end_kst: string;
  generated_at: string;
  status: WeeklyReportStatus;
  summary_json: WeeklyReportSnapshot["summary"];
  metrics_json: WeeklyReportSnapshot["metrics"];
  trends_json: WeeklyReportSnapshot["trends"];
  platform_stats_json: WeeklyReportSnapshot["platformStats"];
  organization_stats_json: WeeklyReportSnapshot["organizationStats"];
  issue_stats_json: WeeklyReportSnapshot["issueTop5"];
  question_stats_json: WeeklyReportSnapshot["questionStats"];
  anonymous_cases_json: WeeklyReportSnapshot["anonymousCases"];
  insights_json: WeeklyReportSnapshot["insights"];
  press_summary_text: string;
  snapshot_json: WeeklyReportSnapshot;
};

function isMissingWeeklyTable(message: string): boolean {
  return /schema cache|does not exist|weekly_reports/i.test(message);
}

function mapRow(row: DbRow): WeeklyReportRow {
  const snapshot = row.snapshot_json;
  assertWeeklySnapshotSafe(snapshot);
  return {
    id: row.id,
    weekId: row.week_id,
    weekLabel: row.week_label,
    periodStartKst: row.period_start_kst,
    periodEndKst: row.period_end_kst,
    generatedAt: row.generated_at,
    status: row.status,
    snapshot,
  };
}

function toListCard(row: WeeklyReportRow): WeeklyListCard {
  const s = row.snapshot.summary;
  return {
    weekId: row.weekId,
    weekLabel: row.weekLabel,
    shortRange: row.snapshot.shortRange,
    headline: s.headline,
    analyzableCount: s.analyzableCount,
    personalInfoRate: s.personalInfoRate,
    attentionNeededRate: s.attentionNeededRate,
    avgScore: s.avgScore,
    grade: s.grade,
    publicExternalToolCount: s.publicExternalToolCount,
    isPartial: row.snapshot.isPartial,
    generatedAt: row.generatedAt,
    hasPublicIssue: s.publicExternalToolCount > 0,
    hasSchoolIssue: row.snapshot.organizationStats.some(
      (org) => org.typeLabel === "학교/교육기관" && org.surveyCount > 0,
    ),
    hasNoticeGap: row.snapshot.issueTop5.some((item) =>
      /고지|안내 미흡/.test(item.label),
    ),
    bullets: s.bullets,
  };
}

export async function listWeeklyReports(options?: {
  status?: WeeklyReportStatus | "all";
}): Promise<WeeklyReportRow[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .from("weekly_reports")
    .select(
      "id, week_id, week_label, period_start_kst, period_end_kst, generated_at, status, summary_json, metrics_json, trends_json, platform_stats_json, organization_stats_json, issue_stats_json, question_stats_json, anonymous_cases_json, insights_json, press_summary_text, snapshot_json",
    )
    .order("period_start_kst", { ascending: false });
  if (options?.status && options.status !== "all") {
    q = q.eq("status", options.status);
  }
  const { data, error } = await q;
  if (error) {
    if (isMissingWeeklyTable(error.message)) return [];
    throw new Error(`weekly_reports list: ${error.message}`);
  }
  return ((data || []) as DbRow[]).map(mapRow);
}

export async function listPublishedWeeklyCards(): Promise<WeeklyListCard[]> {
  const rows = await listWeeklyReports({ status: "published" });
  return rows.map(toListCard);
}

export async function getWeeklyReport(
  weekId: string,
): Promise<WeeklyReportRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(
      "id, week_id, week_label, period_start_kst, period_end_kst, generated_at, status, summary_json, metrics_json, trends_json, platform_stats_json, organization_stats_json, issue_stats_json, question_stats_json, anonymous_cases_json, insights_json, press_summary_text, snapshot_json",
    )
    .eq("week_id", weekId)
    .maybeSingle();
  if (error) {
    if (isMissingWeeklyTable(error.message)) return null;
    throw new Error(`weekly_reports get: ${error.message}`);
  }
  if (!data) return null;
  return mapRow(data as DbRow);
}

export async function getPublishedWeeklyReport(
  weekId: string,
): Promise<WeeklyReportRow | null> {
  const row = await getWeeklyReport(weekId);
  if (!row || row.status !== "published") return null;
  return row;
}

export async function upsertWeeklyReport(input: {
  snapshot: WeeklyReportSnapshot;
  status: WeeklyReportStatus;
}): Promise<WeeklyReportRow> {
  assertWeeklySnapshotSafe(input.snapshot);
  const supabase = createSupabaseServerClient();
  const snap = input.snapshot;
  const payload = {
    week_id: snap.weekId,
    week_label: snap.weekLabel,
    period_start_kst: snap.periodStartKst,
    period_end_kst: snap.periodEndKst,
    generated_at: snap.generatedAt,
    status: input.status,
    summary_json: snap.summary,
    metrics_json: snap.metrics,
    trends_json: snap.trends,
    platform_stats_json: snap.platformStats,
    organization_stats_json: snap.organizationStats,
    issue_stats_json: snap.issueTop5,
    question_stats_json: snap.questionStats,
    anonymous_cases_json: snap.anonymousCases,
    insights_json: snap.insights,
    press_summary_text: snap.pressSummary,
    snapshot_json: snap,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("weekly_reports")
    .upsert(payload, { onConflict: "week_id" })
    .select(
      "id, week_id, week_label, period_start_kst, period_end_kst, generated_at, status, summary_json, metrics_json, trends_json, platform_stats_json, organization_stats_json, issue_stats_json, question_stats_json, anonymous_cases_json, insights_json, press_summary_text, snapshot_json",
    )
    .single();
  if (error) throw new Error(`weekly_reports upsert: ${error.message}`);
  return mapRow(data as DbRow);
}

export async function updateWeeklyReportStatus(
  weekId: string,
  status: WeeklyReportStatus,
): Promise<WeeklyReportRow> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("weekly_reports")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("week_id", weekId)
    .select(
      "id, week_id, week_label, period_start_kst, period_end_kst, generated_at, status, summary_json, metrics_json, trends_json, platform_stats_json, organization_stats_json, issue_stats_json, question_stats_json, anonymous_cases_json, insights_json, press_summary_text, snapshot_json",
    )
    .single();
  if (error) throw new Error(`weekly_reports status: ${error.message}`);
  return mapRow(data as DbRow);
}
