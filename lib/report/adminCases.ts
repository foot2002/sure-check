import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  OverallRiskLevel,
  Platform,
  PublicationStatus,
  PublishStatus,
  ReviewStatus,
} from "@/lib/db/types";

export type AdminRange = "today" | "7d" | "30d" | "all";

export interface AdminCaseListQuery {
  range?: string | null;
  risk?: string | null;
  reviewStatus?: string | null;
  publicationStatus?: string | null;
  platform?: string | null;
  publicPrivate?: string | null;
  hasPersonalInfo?: string | null;
  hasSensitiveInfo?: string | null;
  hasHighRiskInfo?: string | null;
  hasEvidence?: string | null;
  limitedOnly?: string | null;
  q?: string | null;
}

export interface AdminKpi {
  totalScans: number;
  reviewPendingCount: number;
  highOrReportReviewCount: number;
  publicSectorReviewCount: number;
  evidenceCaptureCount: number;
  limitedAnalysisCount: number;
  publicationCandidateCount: number;
}

export interface AdminCaseListItem {
  id: string;
  observedAt: string;
  observedDateKst: string;
  overallRiskLevel: OverallRiskLevel;
  score: number | null;
  userDecisionLabel: string | null;
  platform: Platform;
  operatorName: string | null;
  subjectType: string | null;
  surveyTitle: string | null;
  surveyUrl: string | null;
  hasPersonalInfo: boolean;
  hasSensitiveInfo: boolean;
  hasHighRiskInfo: boolean;
  publicPrivateType: string;
  evidenceCount: number;
  reviewStatus: ReviewStatus;
  publishStatus: PublishStatus;
  publicationStatus: PublicationStatus;
  diagnosisStatus: string | null;
}

export interface AdminCaseListPayload {
  range: AdminRange;
  from: string | null;
  to: string | null;
  kpi: AdminKpi;
  cases: AdminCaseListItem[];
  generatedAt: string;
}

const RISK_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  limited: 2,
  medium: 3,
  low: 4,
  unknown: 5,
};

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysKst(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function resolveAdminRange(rangeRaw: string | null | undefined): {
  range: AdminRange;
  from: string | null;
  to: string | null;
} {
  const today = kstToday();
  const value = (rangeRaw || "7d").toLowerCase();
  if (value === "all") return { range: "all", from: null, to: null };
  if (value === "today") return { range: "today", from: today, to: today };
  if (value === "30d") {
    return { range: "30d", from: addDaysKst(today, -29), to: today };
  }
  return { range: "7d", from: addDaysKst(today, -6), to: today };
}

export function mapPublishToPublication(
  publishStatus: PublishStatus | string | null | undefined,
  publicationStatus?: PublicationStatus | string | null,
): PublicationStatus {
  if (
    publicationStatus === "private" ||
    publicationStatus === "aggregate_only" ||
    publicationStatus === "public_anonymized" ||
    publicationStatus === "public_named" ||
    publicationStatus === "archived"
  ) {
    return publicationStatus;
  }
  switch (publishStatus) {
    case "internal":
      return "aggregate_only";
    case "published":
      return "public_anonymized";
    case "archived":
      return "archived";
    case "draft":
    default:
      return "private";
  }
}

export function mapPublicationToPublish(
  publicationStatus: PublicationStatus,
): PublishStatus {
  switch (publicationStatus) {
    case "aggregate_only":
      return "internal";
    case "public_anonymized":
    case "public_named":
      return "published";
    case "archived":
      return "archived";
    case "private":
    default:
      return "draft";
  }
}

function parseBoolFlag(value: string | null | undefined): boolean | null {
  if (value == null || value === "" || value === "all") return null;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return null;
}

export async function listAdminCases(
  query: AdminCaseListQuery = {},
): Promise<AdminCaseListPayload> {
  const { range, from, to } = resolveAdminRange(query.range);
  const supabase = createSupabaseServerClient();

  let surveyQuery = supabase
    .from("survey_records")
    .select(
      "id, observed_at, observed_date_kst, overall_risk_level, user_decision_label, platform, operator_name, subject_type, survey_title, survey_url, has_personal_info, has_sensitive_info, has_high_risk_info, public_private_type, review_status, publish_status, scan_report_id, question_count",
    )
    .order("observed_at", { ascending: false })
    .limit(500);

  if (from) surveyQuery = surveyQuery.gte("observed_date_kst", from);
  if (to) surveyQuery = surveyQuery.lte("observed_date_kst", to);

  if (query.platform && query.platform !== "all") {
    surveyQuery = surveyQuery.eq("platform", query.platform);
  }
  if (query.reviewStatus && query.reviewStatus !== "all") {
    surveyQuery = surveyQuery.eq("review_status", query.reviewStatus);
  }
  if (query.publicPrivate && query.publicPrivate !== "all") {
    surveyQuery = surveyQuery.eq("public_private_type", query.publicPrivate);
  }
  if (query.risk && query.risk !== "all") {
    if (query.risk === "high") {
      surveyQuery = surveyQuery.in("overall_risk_level", ["high", "critical"]);
    } else {
      surveyQuery = surveyQuery.eq("overall_risk_level", query.risk);
    }
  }

  const personal = parseBoolFlag(query.hasPersonalInfo);
  if (personal != null) surveyQuery = surveyQuery.eq("has_personal_info", personal);
  const sensitive = parseBoolFlag(query.hasSensitiveInfo);
  if (sensitive != null) {
    surveyQuery = surveyQuery.eq("has_sensitive_info", sensitive);
  }
  const highRisk = parseBoolFlag(query.hasHighRiskInfo);
  if (highRisk != null) {
    surveyQuery = surveyQuery.eq("has_high_risk_info", highRisk);
  }
  if (query.limitedOnly === "true" || query.limitedOnly === "1") {
    surveyQuery = surveyQuery.eq("overall_risk_level", "limited");
  }

  const q = (query.q || "").trim();
  if (q) {
    surveyQuery = surveyQuery.or(
      `operator_name.ilike.%${q}%,survey_title.ilike.%${q}%,survey_url.ilike.%${q}%,user_decision_label.ilike.%${q}%`,
    );
  }

  const { data: surveys, error } = await surveyQuery;
  if (error) throw new Error(`survey_records: ${error.message}`);

  const rows = surveys || [];
  const ids = rows.map((r) => r.id as string);
  const reportIds = rows
    .map((r) => r.scan_report_id as string | null)
    .filter((id): id is string => Boolean(id));

  const [scoresRes, evidenceRes, pubsRes, reportsRes, capturesRes] =
    await Promise.all([
      ids.length
        ? supabase
            .from("survey_index_scores")
            .select("survey_record_id, overall_score")
            .in("survey_record_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase
            .from("evidence_files")
            .select("survey_record_id")
            .in("survey_record_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase
            .from("publication_records")
            .select("survey_record_id, publish_status, updated_at")
            .in("survey_record_id", ids)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      reportIds.length
        ? supabase
            .from("scan_reports")
            .select("id, diagnosis_status, score, user_decision_label")
            .in("id", reportIds)
        : Promise.resolve({ data: [], error: null }),
      from || to
        ? (() => {
            let cq = supabase
              .from("capture_jobs")
              .select("id, survey_record_id, status, completeness, captured_page_count");
            if (from) cq = cq.gte("observed_date_kst", from);
            if (to) cq = cq.lte("observed_date_kst", to);
            return cq;
          })()
        : supabase
            .from("capture_jobs")
            .select("id, survey_record_id, status, completeness, captured_page_count")
            .limit(2000),
    ]);

  if (scoresRes.error) throw new Error(`scores: ${scoresRes.error.message}`);
  if (evidenceRes.error) throw new Error(`evidence: ${evidenceRes.error.message}`);
  if (pubsRes.error) throw new Error(`publications: ${pubsRes.error.message}`);
  if (reportsRes.error) throw new Error(`reports: ${reportsRes.error.message}`);
  if (capturesRes.error) throw new Error(`captures: ${capturesRes.error.message}`);

  const scoreMap = new Map<string, number | null>();
  for (const row of scoresRes.data || []) {
    scoreMap.set(row.survey_record_id, row.overall_score);
  }
  const evidenceCountMap = new Map<string, number>();
  for (const row of evidenceRes.data || []) {
    if (!row.survey_record_id) continue;
    evidenceCountMap.set(
      row.survey_record_id,
      (evidenceCountMap.get(row.survey_record_id) || 0) + 1,
    );
  }
  const publicationMap = new Map<string, PublicationStatus>();
  for (const row of pubsRes.data || []) {
    if (publicationMap.has(row.survey_record_id)) continue;
    publicationMap.set(
      row.survey_record_id,
      row.publish_status as PublicationStatus,
    );
  }
  const reportMap = new Map<
    string,
    { diagnosis_status: string | null; score: number | null; user_decision_label: string | null }
  >();
  for (const row of reportsRes.data || []) {
    reportMap.set(row.id, {
      diagnosis_status: row.diagnosis_status,
      score: row.score,
      user_decision_label: row.user_decision_label,
    });
  }

  let cases: AdminCaseListItem[] = rows.map((row) => {
    const report = row.scan_report_id
      ? reportMap.get(row.scan_report_id as string)
      : undefined;
    const publicationStatus = mapPublishToPublication(
      row.publish_status as PublishStatus,
      publicationMap.get(row.id as string),
    );
    return {
      id: row.id as string,
      observedAt: row.observed_at as string,
      observedDateKst: row.observed_date_kst as string,
      overallRiskLevel: (row.overall_risk_level || "unknown") as OverallRiskLevel,
      score:
        scoreMap.get(row.id as string) ??
        report?.score ??
        null,
      userDecisionLabel:
        (row.user_decision_label as string | null) ||
        report?.user_decision_label ||
        null,
      platform: (row.platform || "unknown") as Platform,
      operatorName: (row.operator_name as string | null) || null,
      subjectType: (row.subject_type as string | null) || null,
      surveyTitle: (row.survey_title as string | null) || null,
      surveyUrl: (row.survey_url as string | null) || null,
      hasPersonalInfo: Boolean(row.has_personal_info),
      hasSensitiveInfo: Boolean(row.has_sensitive_info),
      hasHighRiskInfo: Boolean(row.has_high_risk_info),
      publicPrivateType: (row.public_private_type as string) || "unknown",
      evidenceCount: evidenceCountMap.get(row.id as string) || 0,
      reviewStatus: (row.review_status || "none") as ReviewStatus,
      publishStatus: (row.publish_status || "draft") as PublishStatus,
      publicationStatus,
      diagnosisStatus: report?.diagnosis_status || null,
    };
  });

  const publicationFilter = query.publicationStatus;
  if (publicationFilter && publicationFilter !== "all") {
    cases = cases.filter((c) => c.publicationStatus === publicationFilter);
  }

  const hasEvidence = parseBoolFlag(query.hasEvidence);
  if (hasEvidence === true) cases = cases.filter((c) => c.evidenceCount > 0);
  if (hasEvidence === false) cases = cases.filter((c) => c.evidenceCount === 0);

  cases.sort((a, b) => {
    const riskDiff =
      (RISK_RANK[a.overallRiskLevel] ?? 99) - (RISK_RANK[b.overallRiskLevel] ?? 99);
    if (riskDiff !== 0) return riskDiff;
    const evidenceDiff = Number(b.evidenceCount > 0) - Number(a.evidenceCount > 0);
    if (evidenceDiff !== 0) return evidenceDiff;
    return b.observedAt.localeCompare(a.observedAt);
  });

  const captures = capturesRes.data || [];
  const evidenceCaptureCount = captures.filter(
    (c) =>
      c.status === "success" ||
      c.status === "partial" ||
      c.completeness === "complete" ||
      c.completeness === "partial" ||
      (c.captured_page_count || 0) > 0,
  ).length;

  const kpi: AdminKpi = {
    totalScans: cases.length,
    reviewPendingCount: cases.filter(
      (c) => c.reviewStatus === "pending" || c.reviewStatus === "none",
    ).length,
    highOrReportReviewCount: cases.filter(
      (c) =>
        c.overallRiskLevel === "high" ||
        c.overallRiskLevel === "critical" ||
        /거부|신고/.test(c.userDecisionLabel || ""),
    ).length,
    publicSectorReviewCount: cases.filter(
      (c) =>
        c.publicPrivateType === "public" &&
        c.hasPersonalInfo &&
        c.platform !== "wiseon_csap",
    ).length,
    evidenceCaptureCount,
    limitedAnalysisCount: cases.filter(
      (c) =>
        c.overallRiskLevel === "limited" ||
        c.diagnosisStatus === "limited" ||
        /문항 분석 불가/.test(c.userDecisionLabel || ""),
    ).length,
    publicationCandidateCount: cases.filter(
      (c) =>
        c.publicationStatus === "aggregate_only" ||
        c.publicationStatus === "public_anonymized" ||
        (c.reviewStatus === "resolved" && c.publicationStatus === "private"),
    ).length,
  };

  return {
    range,
    from,
    to,
    kpi,
    cases,
    generatedAt: new Date().toISOString(),
  };
}
