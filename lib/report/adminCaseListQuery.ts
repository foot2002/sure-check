import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  adminFindingSearchOrFilter,
  adminScanReportJsonSearchOrFilter,
  adminScanReportSearchOrFilter,
  adminSurveyRecordSearchOrFilter,
} from "@/lib/report/adminCaseSearch";
import { normalizeAdminDashboardView } from "@/lib/report/adminDashboardViews";

export const ADMIN_CASE_LIST_PAGE_SIZE = 400;
export const ADMIN_IN_CHUNK = 150;

type Supabase = ReturnType<typeof createSupabaseServerClient>;

export function parseAdminListPage(query: {
  limit?: string | null;
  offset?: string | null;
}): { limit: number; offset: number } {
  const limitRaw = Number(query.limit);
  const offsetRaw = Number(query.offset);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(1000, Math.max(1, Math.floor(limitRaw)))
    : ADMIN_CASE_LIST_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0;
  return { limit, offset };
}

export async function selectInChunks<T extends Record<string, unknown>>(
  supabase: Supabase,
  table: string,
  columns: string,
  column: string,
  ids: string[],
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ADMIN_IN_CHUNK) {
    const slice = ids.slice(i, i + ADMIN_IN_CHUNK);
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(column, slice);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
  }
  return out;
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

export async function fetchAdminSearchSurveyIds(
  supabase: Supabase,
  rawQuery: string,
  from: string | null,
  to: string | null,
): Promise<string[]> {
  const surveyOr = adminSurveyRecordSearchOrFilter(rawQuery);
  const reportOr = adminScanReportSearchOrFilter(rawQuery);
  const reportJsonOr = adminScanReportJsonSearchOrFilter(rawQuery);
  const findingOr = adminFindingSearchOrFilter(rawQuery);

  let surveyQuery = surveyOr
    ? supabase.from("survey_records").select("id").or(surveyOr).limit(800)
    : null;
  if (surveyQuery && from) surveyQuery = surveyQuery.gte("observed_date_kst", from);
  if (surveyQuery && to) surveyQuery = surveyQuery.lte("observed_date_kst", to);

  let reportQuery = reportOr
    ? supabase.from("scan_reports").select("id").or(reportOr).limit(600)
    : null;
  if (reportQuery && from) reportQuery = reportQuery.gte("observed_date_kst", from);
  if (reportQuery && to) reportQuery = reportQuery.lte("observed_date_kst", to);

  let reportJsonQuery = reportJsonOr
    ? supabase.from("scan_reports").select("id").or(reportJsonOr).limit(600)
    : null;
  if (reportJsonQuery && from) {
    reportJsonQuery = reportJsonQuery.gte("observed_date_kst", from);
  }
  if (reportJsonQuery && to) {
    reportJsonQuery = reportJsonQuery.lte("observed_date_kst", to);
  }

  let findingQuery = findingOr
    ? supabase
        .from("survey_findings")
        .select("survey_record_id")
        .or(findingOr)
        .limit(800)
    : null;
  if (findingQuery && from) {
    findingQuery = findingQuery.gte("observed_date_kst", from);
  }
  if (findingQuery && to) findingQuery = findingQuery.lte("observed_date_kst", to);

  const [surveyRes, reportRes, reportJsonRes, findingRes] = await Promise.all([
    surveyQuery ?? Promise.resolve({ data: [], error: null }),
    reportQuery ?? Promise.resolve({ data: [], error: null }),
    reportJsonQuery ?? Promise.resolve({ data: [], error: null }),
    findingQuery ?? Promise.resolve({ data: [], error: null }),
  ]);
  if (surveyRes.error) {
    console.warn("[admin] search survey_records:", surveyRes.error.message);
  }
  if (reportRes.error) {
    console.warn("[admin] search scan_reports:", reportRes.error.message);
  }
  if (reportJsonRes.error) {
    console.warn("[admin] search report_json:", reportJsonRes.error.message);
  }
  if (findingRes.error) {
    console.warn("[admin] search survey_findings:", findingRes.error.message);
  }

  const reportIds = uniqueIds([
    ...((reportRes.data || []) as Array<{ id?: string }>).map((row) => row.id),
    ...((reportJsonRes.data || []) as Array<{ id?: string }>).map((row) => row.id),
  ]);
  const fromReports =
    reportIds.length > 0
      ? await selectInChunks<{ id: string }>(
          supabase,
          "survey_records",
          "id",
          "scan_report_id",
          reportIds,
        )
      : [];

  return uniqueIds([
    ...((surveyRes.data || []) as Array<{ id?: string }>).map((row) => row.id),
    ...fromReports.map((row) => row.id),
    ...((findingRes.data || []) as Array<{ survey_record_id?: string }>).map(
      (row) => row.survey_record_id,
    ),
  ]);
}

export async function fetchPublicCaseSurveyIds(
  supabase: Supabase,
  status: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("publication_records")
    .select("survey_record_id")
    .eq("public_case_status", status)
    .not("survey_record_id", "is", null)
    .limit(2000);
  if (error) {
    if (/public_case_status|public_id|schema cache|does not exist/i.test(error.message)) {
      return null;
    }
    throw new Error(`publications filter: ${error.message}`);
  }
  return uniqueIds((data || []).map((row) => String(row.survey_record_id || "")));
}

export function intersectIds(
  current: string[] | null,
  next: string[] | null,
): string[] | null {
  if (next == null) return current;
  if (current == null) return next;
  const set = new Set(next);
  return current.filter((id) => set.has(id));
}

type FilterQuery = {
  risk?: string | null;
  reviewStatus?: string | null;
  platform?: string | null;
  publicPrivate?: string | null;
  hasPersonalInfo?: string | null;
  hasSensitiveInfo?: string | null;
  hasHighRiskInfo?: string | null;
  limitedOnly?: string | null;
  reportReview?: string | null;
  outreachStatus?: string | null;
  priority?: string | null;
  view?: string | null;
  subjectType?: string | null;
  outreachOnly?: string | null;
  noticeGap?: string | null;
};

function flag(value: string | null | undefined): boolean | null {
  if (value == null || value === "" || value === "all") return null;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return null;
}

export function applyAdminSurveyColumnFilters<
  T extends {
    eq: (c: string, v: unknown) => T;
    neq: (c: string, v: unknown) => T;
    in: (c: string, v: string[]) => T;
    or: (v: string) => T;
  },
>(query: T, input: FilterQuery): T {
  let next = query;
  const showLimited = input.limitedOnly === "true" || input.limitedOnly === "1";
  if (showLimited || input.risk === "limited") {
    next = next.eq("overall_risk_level", "limited");
  } else {
    next = next.neq("overall_risk_level", "limited");
  }

  if (input.risk && input.risk !== "all" && input.risk !== "limited") {
    if (input.risk === "high") {
      next = next.in("overall_risk_level", ["high", "critical"]);
    } else {
      next = next.eq("overall_risk_level", input.risk);
    }
  }
  if (input.platform && input.platform !== "all") {
    next = next.eq("platform", input.platform);
  }
  if (input.publicPrivate && input.publicPrivate !== "all") {
    next = next.eq("public_private_type", input.publicPrivate);
  }
  if (input.subjectType && input.subjectType !== "all") {
    next = next.eq("subject_type", input.subjectType);
  }
  if (input.reviewStatus && input.reviewStatus !== "all") {
    next = next.eq("review_status", input.reviewStatus);
  }
  const personal = flag(input.hasPersonalInfo);
  if (personal != null) next = next.eq("has_personal_info", personal);
  const sensitive = flag(input.hasSensitiveInfo);
  if (sensitive != null) next = next.eq("has_sensitive_info", sensitive);
  const highRisk = flag(input.hasHighRiskInfo);
  if (highRisk != null) next = next.eq("has_high_risk_info", highRisk);

  if (input.reportReview === "true" || input.reportReview === "1") {
    next = next.or(
      "user_decision_label.ilike.%응답 거부%,user_decision_label.ilike.%신고 검토%,user_decision_label.ilike.%REPORT_OR_INQUIRE%,user_decision_label.ilike.%DO_NOT_RESPOND%",
    );
  }

  if (input.outreachStatus === "unreviewed") {
    next = next.in("review_status", ["none", "pending"]);
  } else if (input.outreachStatus === "in_review") {
    next = next.eq("review_status", "in_review");
  } else if (input.outreachStatus === "done") {
    next = next.eq("review_status", "resolved");
  } else if (input.outreachStatus === "hold") {
    next = next.eq("review_status", "dismissed");
  } else if (input.outreachStatus === "exclude") {
    next = next.eq("publish_status", "archived");
  } else if (
    input.outreachStatus === "candidate" ||
    input.outreachStatus === "send" ||
    input.outreachOnly === "true" ||
    input.outreachOnly === "1"
  ) {
    next = next.eq("has_personal_info", true);
  }

  if (input.priority === "A") {
    next = next.or(
      "has_sensitive_info.eq.true,has_high_risk_info.eq.true,overall_risk_level.eq.critical,overall_risk_level.eq.high,user_decision_label.ilike.%신고 검토%,user_decision_label.ilike.%응답 거부%",
    );
  } else if (input.priority === "B") {
    next = next.eq("has_personal_info", true);
  }

  if (input.noticeGap === "true" || input.noticeGap === "1") {
    next = next.or(
      "user_decision_label.ilike.%고지%,user_decision_label.ilike.%보유%,user_decision_label.ilike.%파기%,user_decision_label.ilike.%안내%,user_decision_label.ilike.%CSAP%",
    );
  }

  const view = normalizeAdminDashboardView(input.view);
  if (view === "unreviewed") next = next.in("review_status", ["none", "pending"]);
  if (view === "highOrReport") {
    next = next.or(
      "overall_risk_level.eq.high,overall_risk_level.eq.critical,user_decision_label.ilike.%신고 검토%,user_decision_label.ilike.%응답 거부%",
    );
  }
  if (view === "publicSector" || view === "publicInstitutions") {
    next = next.eq("public_private_type", "public");
  }
  if (view === "publicSector") next = next.eq("has_personal_info", true);
  if (view === "outreach") next = next.eq("has_personal_info", true);

  return next;
}
