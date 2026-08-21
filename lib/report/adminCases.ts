import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getQueueCounts } from "@/lib/jobs/scanJobQueue";
import {
  classifyLimitedOutcome,
  isReportableAdminOutcome,
  type LimitedOutcomeBucket,
} from "@/lib/report/limitedOutcomeBuckets";
import {
  classifyEvidenceStatusKo,
  classifyOutreachPriority,
  classifyOutreachUiStatus,
  formatDataCollectionSummary,
  isOutreachCandidate,
  isReportReviewDecision,
  pickIssueBadges,
  summarizeEvidenceFiles,
  type EvidenceStatusKo,
  type OutreachPriority,
  type OutreachUiStatus,
} from "@/lib/report/adminOutreach";
import type {
  OverallRiskLevel,
  Platform,
  PublicationStatus,
  PublicCaseStatus,
  PublishStatus,
  ReviewStatus,
} from "@/lib/db/types";
import { normalizePublicCaseStatus } from "@/lib/report/publicCasePolicy";
import {
  matchesAdminDashboardView,
  normalizeAdminDashboardView,
  pickTodayPriorityCases,
} from "@/lib/report/adminDashboardViews";

export type AdminRange = "today" | "7d" | "30d" | "all" | "custom";

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
  outreachOnly?: string | null;
  priority?: string | null;
  noticeGap?: string | null;
  reportReview?: string | null;
  outreachStatus?: string | null;
  publicCaseStatus?: string | null;
  view?: string | null;
  subjectType?: string | null;
  from?: string | null;
  to?: string | null;
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
  /** Individual public cases currently listed on /cases. */
  publishedCaseCount: number;
  unpublishedCaseCount: number;
  reviewingCaseCount: number;
  pausedCaseCount: number;
  evidenceMissingCount: number;
  captureNeededCount: number;
  summaryReportCount: number;
  detailReportCount: number;
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
  personalInfoQuestionCount: number;
  sensitiveQuestionCount: number;
  highRiskQuestionCount: number;
  categoryLabels: string[];
  issueBadges: string[];
  outreachPriority: OutreachPriority;
  outreachCandidate: boolean;
  outreachUiStatus: OutreachUiStatus;
  evidenceStatus: EvidenceStatusKo;
  dataSummary: string;
  hasTemporaryZip: boolean;
  temporaryZipId: string | null;
  hasScreenshots: boolean;
  screenshotFileIds: string[];
  downloadableEvidenceTypes: string[];
  publicCaseStatus: PublicCaseStatus;
  publicId: string | null;
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
  todayTasks: AdminCaseListItem[];
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

const KST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AdminRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminRangeError";
  }
}

export function parseAdminDate(value: string | null | undefined): string | null {
  const v = (value || "").trim();
  return KST_DATE_RE.test(v) ? v : null;
}

export function resolveAdminRange(
  rangeRaw?: string | null,
  fromRaw?: string | null,
  toRaw?: string | null,
): {
  range: AdminRange;
  from: string | null;
  to: string | null;
} {
  const customFrom = parseAdminDate(fromRaw);
  const customTo = parseAdminDate(toRaw);
  if (customFrom && customTo) {
    if (customFrom > customTo) {
      throw new AdminRangeError("시작일이 종료일보다 늦습니다.");
    }
    return { range: "custom", from: customFrom, to: customTo };
  }
  const today = kstToday();
  const value = (rangeRaw || "7d").toLowerCase();
  if (value === "all") return { range: "all", from: null, to: null };
  if (value === "today") return { range: "today", from: today, to: today };
  if (value === "30d") {
    return { range: "30d", from: addDaysKst(today, -29), to: today };
  }
  if (value === "custom") {
    throw new AdminRangeError("기간 설정에는 시작일과 종료일이 필요합니다.");
  }
  return { range: "7d", from: addDaysKst(today, -6), to: today };
}

export function appliedAdminRangeLabel(input: {
  range: AdminRange;
  from: string | null;
  to: string | null;
}): string {
  if (input.range === "today") return "오늘";
  if (input.range === "7d") return "최근 7일";
  if (input.range === "30d") return "최근 30일";
  if (input.range === "all") return "전체";
  if (input.from && input.to) return `${input.from} ~ ${input.to}`;
  return "기간 설정";
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

function parsePublicCaseStatusFilter(
  value: string | null | undefined,
): PublicCaseStatus | "all" {
  if (
    value === "private" ||
    value === "reviewing" ||
    value === "published" ||
    value === "paused" ||
    value === "archived"
  ) {
    return value;
  }
  return "all";
}

const ADMIN_SURVEY_SELECT =
  "id, observed_at, observed_date_kst, overall_risk_level, user_decision_label, platform, operator_name, subject_type, survey_title, survey_url, has_personal_info, has_sensitive_info, has_high_risk_info, public_private_type, review_status, publish_status, scan_report_id, scan_job_id, question_count, personal_info_question_count, sensitive_question_count, high_risk_question_count";

export async function listAdminCases(
  query: AdminCaseListQuery = {},
): Promise<AdminCaseListPayload> {
  const { range, from, to } = resolveAdminRange(query.range, query.from, query.to);
  const supabase = createSupabaseServerClient();

  let surveyQuery = supabase
    .from("survey_records")
    .select(ADMIN_SURVEY_SELECT)
    .order("observed_at", { ascending: false })
    .limit(range === "all" ? 3000 : 1500);

  if (from) surveyQuery = surveyQuery.gte("observed_date_kst", from);
  if (to) surveyQuery = surveyQuery.lte("observed_date_kst", to);

  if (query.limitedOnly === "true" || query.limitedOnly === "1") {
    surveyQuery = surveyQuery.eq("overall_risk_level", "limited");
  }

  const { data: surveys, error } = await surveyQuery;
  if (error) throw new Error(`survey_records: ${error.message}`);

  let rows = surveys || [];
  const publicCaseFilter = parsePublicCaseStatusFilter(query.publicCaseStatus);
  if (publicCaseFilter !== "all" && publicCaseFilter !== "private") {
    const { data: pubRows, error: pubFilterErr } = await supabase
      .from("publication_records")
      .select("survey_record_id")
      .eq("public_case_status", publicCaseFilter)
      .not("survey_record_id", "is", null)
      .limit(500);
    if (pubFilterErr) {
      const missingPublicCase =
        /public_case_status|public_id|schema cache|does not exist/i.test(
          pubFilterErr.message,
        );
      if (!missingPublicCase) {
        throw new Error(`publications filter: ${pubFilterErr.message}`);
      }
    } else {
      const have = new Set(rows.map((r) => r.id as string));
      const missing = [
        ...new Set(
          (pubRows || [])
            .map((r) => String(r.survey_record_id || ""))
            .filter(Boolean),
        ),
      ].filter((id) => !have.has(id));
      if (missing.length) {
        const extra = await supabase
          .from("survey_records")
          .select(ADMIN_SURVEY_SELECT)
          .in("id", missing);
        if (extra.error) {
          throw new Error(`survey_records public cases: ${extra.error.message}`);
        }
        rows = [...rows, ...(extra.data || [])];
      }
    }
  }

  const ids = rows.map((r) => r.id as string);
  const reportIds = rows
    .map((r) => r.scan_report_id as string | null)
    .filter((id): id is string => Boolean(id));

  const scanJobIds = rows
    .map((r) => r.scan_job_id as string | null | undefined)
    .filter((id): id is string => Boolean(id));

  const [scoresRes, evidenceRes, evidenceByScanRes, pubsQuery, reportsRes, capturesRes] =
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
            .select("id, survey_record_id, scan_job_id, evidence_type")
            .in("survey_record_id", ids)
        : Promise.resolve({ data: [], error: null }),
      scanJobIds.length
        ? supabase
            .from("evidence_files")
            .select("id, survey_record_id, scan_job_id, evidence_type")
            .in("scan_job_id", scanJobIds)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase
            .from("publication_records")
            .select(
              "survey_record_id, publish_status, public_case_status, public_id, updated_at",
            )
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
  let pubsRes: { data: Array<Record<string, unknown>> | null; error: { message: string } | null } =
    pubsQuery as {
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    };
  if (pubsRes.error) {
    const missingPublicCase =
      /public_case_status|public_id|schema cache|does not exist/i.test(
        pubsRes.error.message,
      );
    if (!missingPublicCase) {
      throw new Error(`publications: ${pubsRes.error.message}`);
    }
    console.warn(
      "[admin] publication_records public case columns missing — apply db/migrations/013_public_cases.sql",
    );
    const fallback = ids.length
      ? await supabase
          .from("publication_records")
          .select("survey_record_id, publish_status, updated_at")
          .in("survey_record_id", ids)
          .order("updated_at", { ascending: false })
      : { data: [], error: null };
    if (fallback.error) throw new Error(`publications: ${fallback.error.message}`);
    pubsRes = {
      data: (fallback.data as Array<Record<string, unknown>>) || [],
      error: fallback.error,
    };
  }
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

  const evidenceFilesBySurvey = new Map<
    string,
    Array<{ id: string; evidenceType: string }>
  >();
  const addEvidence = (
    surveyId: string | null | undefined,
    evidenceId: string,
    evidenceType: string,
  ) => {
    if (!surveyId || !evidenceId) return;
    const list = evidenceFilesBySurvey.get(surveyId) || [];
    if (list.some((f) => f.id === evidenceId)) return;
    list.push({ id: evidenceId, evidenceType: evidenceType || "" });
    evidenceFilesBySurvey.set(surveyId, list);
  };
  for (const row of [...(evidenceRes.data || []), ...(evidenceByScanRes.data || [])]) {
    const evidenceType = String(row.evidence_type || "");
    if (row.survey_record_id) {
      addEvidence(row.survey_record_id, row.id, evidenceType);
    } else if (row.scan_job_id) {
      addEvidence(
        surveyIdByScanJob.get(row.scan_job_id),
        row.id,
        evidenceType,
      );
    }
  }
  const publicationMap = new Map<string, PublicationStatus>();
  const publicCaseMap = new Map<
    string,
    { status: PublicCaseStatus; publicId: string | null }
  >();
  for (const row of pubsRes.data || []) {
    const surveyId = String(row.survey_record_id || "");
    if (!surveyId || publicationMap.has(surveyId)) continue;
    publicationMap.set(surveyId, row.publish_status as PublicationStatus);
    publicCaseMap.set(surveyId, {
      status: normalizePublicCaseStatus(
        row.public_case_status as string | null | undefined,
      ),
      publicId: (row.public_id as string | null) || null,
    });
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

  const categoryLabelsBySurvey = new Map<string, string[]>();
  try {
    if (ids.length > 0) {
      const { data: qrows } = await supabase
        .from("survey_questions")
        .select("id, survey_record_id, has_personal_info")
        .in("survey_record_id", ids.slice(0, 200))
        .eq("has_personal_info", true)
        .limit(600);
      const qids = (qrows || []).map((q) => String(q.id));
      if (qids.length > 0) {
        const { data: cats } = await supabase
          .from("question_data_categories")
          .select("survey_question_id, category_label")
          .in("survey_question_id", qids.slice(0, 400));
        const qToSurvey = new Map(
          (qrows || []).map((q) => [String(q.id), String(q.survey_record_id)]),
        );
        for (const cat of cats || []) {
          const surveyId = qToSurvey.get(String(cat.survey_question_id));
          if (!surveyId) continue;
          const label = String(cat.category_label || "").trim();
          if (!label) continue;
          const cur = categoryLabelsBySurvey.get(surveyId) || [];
          if (!cur.includes(label) && cur.length < 3) cur.push(label);
          categoryLabelsBySurvey.set(surveyId, cur);
        }
      }
    }
  } catch {
    /* optional category labels */
  }

  let cases: AdminCaseListItem[] = rows.map((row) => {
    const report = row.scan_report_id
      ? reportMap.get(row.scan_report_id as string)
      : undefined;
    const publicationStatus = mapPublishToPublication(
      row.publish_status as PublishStatus,
      publicationMap.get(row.id as string),
    );
    const personalCount = Number(row.personal_info_question_count) || 0;
    const sensitiveCount = Number(row.sensitive_question_count) || 0;
    const highRiskCount = Number(row.high_risk_question_count) || 0;
    const categoryLabels = categoryLabelsBySurvey.get(row.id as string) || [];
    const evidenceFiles = evidenceFilesBySurvey.get(row.id as string) || [];
    const evidenceSummary = summarizeEvidenceFiles(evidenceFiles);
    const evidenceCount = evidenceFiles.length;
    const captureStatus = captureStatusBySurvey.get(row.id as string) || null;
    const userDecisionLabel =
      (row.user_decision_label as string | null) ||
      report?.user_decision_label ||
      null;
    const issueBadges = pickIssueBadges({
      userDecisionLabel,
      findingTitles: report?.summary ? [report.summary] : [],
      hasSensitiveInfo: Boolean(row.has_sensitive_info),
      hasHighRiskInfo: Boolean(row.has_high_risk_info),
      isPublic: (row.public_private_type as string) === "public",
    });
    const outreachPriority = classifyOutreachPriority({
      publicPrivateType: row.public_private_type as string,
      hasPersonalInfo: Boolean(row.has_personal_info),
      hasSensitiveInfo: Boolean(row.has_sensitive_info),
      hasHighRiskInfo: Boolean(row.has_high_risk_info),
      overallRiskLevel: row.overall_risk_level as string,
      userDecisionLabel,
      evidenceCount,
      issueBadges,
    });
    const outreachCandidate = isOutreachCandidate(outreachPriority);
    return {
      id: row.id as string,
      observedAt: row.observed_at as string,
      observedDateKst: row.observed_date_kst as string,
      overallRiskLevel: (row.overall_risk_level || "unknown") as OverallRiskLevel,
      score:
        scoreMap.get(row.id as string) ??
        report?.score ??
        null,
      userDecisionLabel,
      platform: (row.platform || "unknown") as Platform,
      operatorName: (row.operator_name as string | null) || null,
      subjectType: (row.subject_type as string | null) || null,
      surveyTitle: (row.survey_title as string | null) || null,
      surveyUrl: (row.survey_url as string | null) || null,
      hasPersonalInfo: Boolean(row.has_personal_info),
      hasSensitiveInfo: Boolean(row.has_sensitive_info),
      hasHighRiskInfo: Boolean(row.has_high_risk_info),
      publicPrivateType: (row.public_private_type as string) || "unknown",
      evidenceCount,
      captureStatus,
      reviewStatus: (row.review_status || "none") as ReviewStatus,
      publishStatus: (row.publish_status || "draft") as PublishStatus,
      publicationStatus,
      diagnosisStatus: report?.diagnosis_status || null,
      personalInfoQuestionCount: personalCount,
      sensitiveQuestionCount: sensitiveCount,
      highRiskQuestionCount: highRiskCount,
      categoryLabels,
      issueBadges,
      outreachPriority,
      outreachCandidate,
      outreachUiStatus: classifyOutreachUiStatus({
        reviewStatus: (row.review_status || "none") as string,
        publicationStatus,
        outreachCandidate,
      }),
      evidenceStatus: classifyEvidenceStatusKo({
        evidenceCount,
        captureStatus,
      }),
      dataSummary: formatDataCollectionSummary({
        personalCount,
        sensitiveCount,
        highRiskCount,
        hasPersonalInfo: Boolean(row.has_personal_info),
        hasSensitiveInfo: Boolean(row.has_sensitive_info),
        hasHighRiskInfo: Boolean(row.has_high_risk_info),
        categoryLabels,
      }),
      hasTemporaryZip: evidenceSummary.hasTemporaryZip,
      temporaryZipId: evidenceSummary.temporaryZipId,
      hasScreenshots: evidenceSummary.hasScreenshots,
      screenshotFileIds: evidenceSummary.screenshotFileIds.slice(0, 12),
      downloadableEvidenceTypes: evidenceSummary.downloadableEvidenceTypes,
      publicCaseStatus: publicCaseMap.get(row.id as string)?.status || "private",
      publicId: publicCaseMap.get(row.id as string)?.publicId || null,
    };
  });

  const PRIORITY_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };
  cases.sort((a, b) => {
    const p =
      (PRIORITY_RANK[a.outreachPriority] ?? 9) -
      (PRIORITY_RANK[b.outreachPriority] ?? 9);
    if (p !== 0) return p;
    const riskDiff =
      (RISK_RANK[a.overallRiskLevel] ?? 99) - (RISK_RANK[b.overallRiskLevel] ?? 99);
    if (riskDiff !== 0) return riskDiff;
    const reportDiff =
      Number(isReportReviewDecision(b.userDecisionLabel)) -
      Number(isReportReviewDecision(a.userDecisionLabel));
    if (reportDiff !== 0) return reportDiff;
    const evidenceDiff =
      Number(a.evidenceStatus === "증거 확보") -
      Number(b.evidenceStatus === "증거 확보");
    if (evidenceDiff !== 0) return -evidenceDiff;
    const reviewDiff =
      Number(a.reviewStatus === "none" || a.reviewStatus === "pending") -
      Number(b.reviewStatus === "none" || b.reviewStatus === "pending");
    if (reviewDiff !== 0) return -reviewDiff;
    return b.observedAt.localeCompare(a.observedAt);
  });

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

  const scopedCases = cases;
  const todayTasks = pickTodayPriorityCases(scopedCases, 5);
  const kpi: AdminKpi = {
    totalScans: scopedCases.length,
    rawTotalScans: rawCaseCount,
    reviewPendingCount: scopedCases.filter(
      (c) => c.outreachUiStatus === "unreviewed",
    ).length,
    highOrReportReviewCount: scopedCases.filter(
      (c) =>
        c.overallRiskLevel === "high" ||
        c.overallRiskLevel === "critical" ||
        isReportReviewDecision(c.userDecisionLabel),
    ).length,
    publicSectorReviewCount: scopedCases.filter(
      (c) =>
        c.publicPrivateType === "public" &&
        c.hasPersonalInfo &&
        c.platform !== "wiseon_csap",
    ).length,
    evidenceCaptureCount: scopedCases.filter(
      (c) => c.evidenceStatus === "증거 확보" || c.evidenceStatus === "일부 확보",
    ).length,
    evidenceMissingCount: scopedCases.filter(
      (c) => c.evidenceStatus === "증거 부족" || c.evidenceStatus === "캡처 필요",
    ).length,
    captureNeededCount: scopedCases.filter((c) => c.evidenceStatus === "캡처 필요")
      .length,
    summaryReportCount: scopedCases.length,
    detailReportCount: scopedCases.length,
    limitedAnalysisCount: excludedFromReporting.total,
    publicationCandidateCount: scopedCases.filter(
      (c) => c.outreachUiStatus === "send" || c.outreachUiStatus === "candidate",
    ).length,
    publishedCaseCount: scopedCases.filter((c) => c.publicCaseStatus === "published")
      .length,
    unpublishedCaseCount: scopedCases.filter(
      (c) => c.publicCaseStatus === "private" || c.publicCaseStatus === "archived",
    ).length,
    reviewingCaseCount: scopedCases.filter((c) => c.publicCaseStatus === "reviewing")
      .length,
    pausedCaseCount: scopedCases.filter((c) => c.publicCaseStatus === "paused")
      .length,
    outcomeBuckets,
    excludedFromReporting,
  };

  const dashboardView = normalizeAdminDashboardView(query.view);
  if (dashboardView !== "all") {
    cases = cases.filter((c) => matchesAdminDashboardView(c, dashboardView));
  }
  if (query.publicationStatus && query.publicationStatus !== "all") {
    cases = cases.filter((c) => c.publicationStatus === query.publicationStatus);
  }
  const hasEvidence = parseBoolFlag(query.hasEvidence);
  if (hasEvidence === true) {
    cases = cases.filter(
      (c) => c.evidenceStatus === "증거 확보" || c.evidenceStatus === "일부 확보",
    );
  }
  if (hasEvidence === false) {
    cases = cases.filter(
      (c) => c.evidenceStatus === "증거 부족" || c.evidenceStatus === "캡처 필요",
    );
  }
  if (query.outreachOnly === "true" || query.outreachOnly === "1") {
    cases = cases.filter((c) => c.outreachCandidate);
  }
  if (query.priority && query.priority !== "all") {
    cases = cases.filter((c) => c.outreachPriority === query.priority);
  }
  if (query.noticeGap === "true" || query.noticeGap === "1") {
    cases = cases.filter((c) => c.issueBadges.length > 0);
  }
  if (query.reportReview === "true" || query.reportReview === "1") {
    cases = cases.filter((c) => isReportReviewDecision(c.userDecisionLabel));
  }
  if (query.outreachStatus && query.outreachStatus !== "all") {
    cases = cases.filter((c) => c.outreachUiStatus === query.outreachStatus);
  }
  if (publicCaseFilter !== "all") {
    cases = cases.filter((c) => c.publicCaseStatus === publicCaseFilter);
  }
  if (query.platform && query.platform !== "all") {
    cases = cases.filter((c) => c.platform === query.platform);
  }
  if (query.reviewStatus && query.reviewStatus !== "all") {
    cases = cases.filter((c) => c.reviewStatus === query.reviewStatus);
  }
  if (query.publicPrivate && query.publicPrivate !== "all") {
    cases = cases.filter((c) => c.publicPrivateType === query.publicPrivate);
  }
  if (query.risk && query.risk !== "all") {
    if (query.risk === "high") {
      cases = cases.filter(
        (c) => c.overallRiskLevel === "high" || c.overallRiskLevel === "critical",
      );
    } else {
      cases = cases.filter((c) => c.overallRiskLevel === query.risk);
    }
  }
  const personal = parseBoolFlag(query.hasPersonalInfo);
  if (personal != null) cases = cases.filter((c) => c.hasPersonalInfo === personal);
  const sensitive = parseBoolFlag(query.hasSensitiveInfo);
  if (sensitive != null) {
    cases = cases.filter((c) => c.hasSensitiveInfo === sensitive);
  }
  const highRisk = parseBoolFlag(query.hasHighRiskInfo);
  if (highRisk != null) {
    cases = cases.filter((c) => c.hasHighRiskInfo === highRisk);
  }
  if (query.subjectType && query.subjectType !== "all") {
    cases = cases.filter((c) => c.subjectType === query.subjectType);
  }
  const q = (query.q || "").trim().toLowerCase();
  if (q) {
    cases = cases.filter((c) =>
      [c.operatorName, c.surveyTitle, c.surveyUrl, c.userDecisionLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }

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
    todayTasks,
    recentCollect,
    recentDiagnosis,
    generatedAt: new Date().toISOString(),
  };
}
