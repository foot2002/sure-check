import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getQueueCounts } from "@/lib/jobs/scanJobQueue";
import {
  classifyLimitedOutcome,
  isReportableAdminOutcome,
  type LimitedOutcomeBucket,
} from "@/lib/report/limitedOutcomeBuckets";
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
  /** Reportable diagnoses only (questions analyzable). */
  totalScans: number;
  /** Raw survey_records in range before reporting filter. */
  rawTotalScans: number;
  reviewPendingCount: number;
  highOrReportReviewCount: number;
  publicSectorReviewCount: number;
  evidenceCaptureCount: number;
  /** Non-reportable limited outcomes (ops reference, not a primary KPI). */
  limitedAnalysisCount: number;
  publicationCandidateCount: number;
  /** Outcome split for ops — extraction_limited is not a primary card. */
  outcomeBuckets: {
    normalDiagnosis: number;
    surveyClosed: number;
    accessRestricted: number;
    extractionLimited: number;
    systemFailure: number;
  };
  /** Counts excluded from general reporting stats / case list. */
  excludedFromReporting: {
    extractionLimited: number;
    surveyClosed: number;
    accessRestricted: number;
    systemFailure: number;
    total: number;
  };
}

export interface AdminQueueSummary {
  scanPending: number;
  scanRunning: number;
  scanFailed: number;
  scanLimited: number;
  capturePending: number;
  captureRunning: number;
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
  /** Latest capture job status for this survey, if any. */
  captureStatus: string | null;
  reviewStatus: ReviewStatus;
  publishStatus: PublishStatus;
  publicationStatus: PublicationStatus;
  diagnosisStatus: string | null;
}

export interface AdminRecentCollectItem {
  id: string;
  title: string | null;
  platform: string;
  status: string;
  discoveredAt: string | null;
  diagnosisStatus: string | null;
  url: string | null;
}

export interface AdminCaseListPayload {
  range: AdminRange;
  from: string | null;
  to: string | null;
  kpi: AdminKpi;
  queue: AdminQueueSummary;
  cases: AdminCaseListItem[];
  /** Newest collect + diagnosis snapshots for one-page ops view. */
  recentCollect: AdminRecentCollectItem[];
  recentDiagnosis: AdminCaseListItem[];
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
      "id, observed_at, observed_date_kst, overall_risk_level, user_decision_label, platform, operator_name, subject_type, survey_title, survey_url, has_personal_info, has_sensitive_info, has_high_risk_info, public_private_type, review_status, publish_status, scan_report_id, scan_job_id, question_count",
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

  const scanJobIds = rows
    .map((r) => r.scan_job_id as string | null | undefined)
    .filter((id): id is string => Boolean(id));

  const [scoresRes, evidenceRes, evidenceByScanRes, pubsRes, reportsRes, capturesRes] =
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
            .select("id, survey_record_id, scan_job_id")
            .in("survey_record_id", ids)
        : Promise.resolve({ data: [], error: null }),
      scanJobIds.length
        ? supabase
            .from("evidence_files")
            .select("id, survey_record_id, scan_job_id")
            .in("scan_job_id", scanJobIds)
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
            .select("id, diagnosis_status, score, user_decision_label, report_json")
            .in("id", reportIds)
        : Promise.resolve({ data: [], error: null }),
      from || to
        ? (() => {
            let cq = supabase
              .from("capture_jobs")
              .select("id, survey_record_id, scan_job_id, status, completeness, captured_page_count");
            if (from) cq = cq.gte("observed_date_kst", from);
            if (to) cq = cq.lte("observed_date_kst", to);
            return cq;
          })()
        : supabase
            .from("capture_jobs")
            .select("id, survey_record_id, scan_job_id, status, completeness, captured_page_count")
            .limit(2000),
    ]);

  if (scoresRes.error) throw new Error(`scores: ${scoresRes.error.message}`);
  if (evidenceRes.error) throw new Error(`evidence: ${evidenceRes.error.message}`);
  if (evidenceByScanRes.error) {
    throw new Error(`evidence by scan: ${evidenceByScanRes.error.message}`);
  }
  if (pubsRes.error) throw new Error(`publications: ${pubsRes.error.message}`);
  if (reportsRes.error) throw new Error(`reports: ${reportsRes.error.message}`);
  if (capturesRes.error) throw new Error(`captures: ${capturesRes.error.message}`);

  const scoreMap = new Map<string, number | null>();
  for (const row of scoresRes.data || []) {
    scoreMap.set(row.survey_record_id, row.overall_score);
  }

  const surveyIdByScanJob = new Map<string, string>();
  for (const row of rows) {
    if (row.scan_job_id) {
      surveyIdByScanJob.set(row.scan_job_id as string, row.id as string);
    }
  }

  const evidenceIdsBySurvey = new Map<string, Set<string>>();
  const addEvidence = (surveyId: string | null | undefined, evidenceId: string) => {
    if (!surveyId) return;
    const set = evidenceIdsBySurvey.get(surveyId) || new Set<string>();
    set.add(evidenceId);
    evidenceIdsBySurvey.set(surveyId, set);
  };
  for (const row of [...(evidenceRes.data || []), ...(evidenceByScanRes.data || [])]) {
    if (row.survey_record_id) {
      addEvidence(row.survey_record_id, row.id);
    } else if (row.scan_job_id) {
      addEvidence(surveyIdByScanJob.get(row.scan_job_id), row.id);
    }
  }
  const evidenceCountMap = new Map<string, number>();
  for (const [surveyId, set] of evidenceIdsBySurvey.entries()) {
    evidenceCountMap.set(surveyId, set.size);
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
    {
      diagnosis_status: string | null;
      score: number | null;
      user_decision_label: string | null;
      limited_reason: string | null;
      summary: string | null;
    }
  >();
  for (const row of reportsRes.data || []) {
    const rj = (row.report_json as Record<string, unknown> | null) || null;
    const form = (rj?.form as Record<string, unknown> | undefined) || undefined;
    const limitedReason =
      (typeof rj?.limitedReason === "string" && rj.limitedReason) ||
      (typeof form?.limitedReason === "string" && form.limitedReason) ||
      null;
    const summary = typeof rj?.summary === "string" ? rj.summary : null;
    reportMap.set(row.id, {
      diagnosis_status: row.diagnosis_status,
      score: row.score,
      user_decision_label: row.user_decision_label,
      limited_reason: limitedReason,
      summary,
    });
  }

  const captures = capturesRes.data || [];
  const captureStatusBySurvey = new Map<string, string>();
  for (const c of captures) {
    const surveyId =
      (c.survey_record_id as string | null) ||
      (c.scan_job_id
        ? surveyIdByScanJob.get(c.scan_job_id as string)
        : null);
    if (!surveyId) continue;
    const status = (c.status as string) || "unknown";
    const prev = captureStatusBySurvey.get(surveyId);
    const rank = (s: string) =>
      s === "success" || s === "partial"
        ? 0
        : s === "running" || s === "pending"
          ? 1
          : 2;
    if (!prev || rank(status) < rank(prev)) {
      captureStatusBySurvey.set(surveyId, status);
    }
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
      captureStatus: captureStatusBySurvey.get(row.id as string) || null,
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

  const evidenceCaptureCount = captures.filter(
    (c) =>
      c.status === "success" ||
      c.status === "partial" ||
      c.completeness === "complete" ||
      c.completeness === "partial" ||
      (c.captured_page_count || 0) > 0,
  ).length;

  const outcomeBuckets = {
    normalDiagnosis: 0,
    surveyClosed: 0,
    accessRestricted: 0,
    extractionLimited: 0,
    systemFailure: 0,
  };
  const bucketByCaseId = new Map<string, LimitedOutcomeBucket>();
  for (const row of rows) {
    const report = row.scan_report_id
      ? reportMap.get(row.scan_report_id as string)
      : undefined;
    const bucket = classifyLimitedOutcome({
      overallRiskLevel: row.overall_risk_level as string | null,
      diagnosisStatus: report?.diagnosis_status || null,
      userDecisionLabel:
        (row.user_decision_label as string | null) ||
        report?.user_decision_label ||
        null,
      limitedReason: report?.limited_reason || null,
      summary: report?.summary || null,
    });
    bucketByCaseId.set(row.id as string, bucket);
    if (bucket === "normal_diagnosis") outcomeBuckets.normalDiagnosis += 1;
    else if (bucket === "survey_closed") outcomeBuckets.surveyClosed += 1;
    else if (bucket === "access_restricted") outcomeBuckets.accessRestricted += 1;
    else if (bucket === "system_failure") outcomeBuckets.systemFailure += 1;
    else outcomeBuckets.extractionLimited += 1;
  }

  const showOpsLimited =
    query.limitedOnly === "true" || query.limitedOnly === "1";
  const rawCaseCount = cases.length;
  // General reporting: only analyzable diagnoses. Ops filter can still list limited.
  if (!showOpsLimited) {
    cases = cases.filter((c) =>
      isReportableAdminOutcome(
        bucketByCaseId.get(c.id) || "extraction_limited",
      ),
    );
  }

  const excludedFromReporting = {
    extractionLimited: outcomeBuckets.extractionLimited,
    surveyClosed: outcomeBuckets.surveyClosed,
    accessRestricted: outcomeBuckets.accessRestricted,
    systemFailure: outcomeBuckets.systemFailure,
    total:
      outcomeBuckets.extractionLimited +
      outcomeBuckets.surveyClosed +
      outcomeBuckets.accessRestricted +
      outcomeBuckets.systemFailure,
  };

  const kpi: AdminKpi = {
    totalScans: showOpsLimited
      ? rawCaseCount
      : outcomeBuckets.normalDiagnosis,
    rawTotalScans: rawCaseCount,
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
    limitedAnalysisCount: excludedFromReporting.total,
    publicationCandidateCount: cases.filter(
      (c) =>
        c.publicationStatus === "aggregate_only" ||
        c.publicationStatus === "public_anonymized" ||
        (c.reviewStatus === "resolved" && c.publicationStatus === "private"),
    ).length,
    outcomeBuckets,
    excludedFromReporting,
  };

  let queue: AdminQueueSummary = {
    scanPending: 0,
    scanRunning: 0,
    scanFailed: 0,
    scanLimited: 0,
    capturePending: 0,
    captureRunning: 0,
  };
  try {
    queue = await getQueueCounts();
  } catch (err) {
    console.warn("[admin] getQueueCounts failed:", err);
  }

  let recentCollect: AdminRecentCollectItem[] = [];
  try {
    const { data: collectRows, error: collectErr } = await supabase
      .from("survey_links")
      .select(
        "id, title, platform, status, first_discovered_at, last_discovered_at, canonical_url",
      )
      .order("last_discovered_at", { ascending: false })
      .limit(8);
    if (collectErr) {
      console.warn("[admin] recentCollect:", collectErr.message);
    } else {
      const ids = (collectRows || []).map((r) => r.id as string);
      const diagnosisByLink = new Map<string, string>();
      if (ids.length > 0) {
        const { data: diagRows } = await supabase
          .from("survey_diagnosis_links")
          .select("survey_link_id, status, updated_at")
          .in("survey_link_id", ids)
          .order("updated_at", { ascending: false });
        for (const d of diagRows || []) {
          const linkId = d.survey_link_id as string;
          if (!diagnosisByLink.has(linkId)) {
            diagnosisByLink.set(linkId, (d.status as string) || "unknown");
          }
        }
      }
      recentCollect = (collectRows || []).map((row) => ({
        id: row.id as string,
        title: (row.title as string | null) || null,
        platform: (row.platform as string) || "unknown",
        status: (row.status as string) || "unknown",
        discoveredAt:
          (row.last_discovered_at as string | null) ||
          (row.first_discovered_at as string | null) ||
          null,
        diagnosisStatus: diagnosisByLink.get(row.id as string) || null,
        url: (row.canonical_url as string | null) || null,
      }));
    }
  } catch (err) {
    console.warn("[admin] recentCollect failed:", err);
  }

  const recentDiagnosis = [...cases]
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .slice(0, 8);

  return {
    range,
    from,
    to,
    kpi,
    queue,
    cases,
    recentCollect,
    recentDiagnosis,
    generatedAt: new Date().toISOString(),
  };
}
