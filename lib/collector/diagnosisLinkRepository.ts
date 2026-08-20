/**
 * survey_diagnosis_links repository — linkage only to scan_jobs / reports.
 */

import { classifyLimitedOutcome } from "@/lib/report/limitedOutcomeBuckets";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SurveyDiagnosisLinkStatus =
  | "queued"
  | "running"
  | "completed"
  | "limited"
  | "failed_retryable"
  | "failed_final"
  | "skipped"
  | "skipped_closed"
  | "skipped_restricted"
  | "timeout";

export const SURVEY_DIAGNOSIS_LINK_STATUSES: SurveyDiagnosisLinkStatus[] = [
  "queued",
  "running",
  "completed",
  "limited",
  "failed_retryable",
  "failed_final",
  "skipped",
  "skipped_closed",
  "skipped_restricted",
  "timeout",
];

/** Statuses that block automatic re-enqueue for the same survey_link. */
export const DIAGNOSIS_LINK_BLOCKING_STATUSES: SurveyDiagnosisLinkStatus[] = [
  "queued",
  "running",
  "completed",
  "limited",
  "failed_final",
  "skipped_closed",
  "skipped_restricted",
];

export function emptyDiagnosisLinkStatusCounts(): Record<
  SurveyDiagnosisLinkStatus,
  number
> {
  return {
    queued: 0,
    running: 0,
    completed: 0,
    limited: 0,
    failed_retryable: 0,
    failed_final: 0,
    skipped: 0,
    skipped_closed: 0,
    skipped_restricted: 0,
    timeout: 0,
  };
}

function fallbackLegacyStatus(
  status: SurveyDiagnosisLinkStatus,
): SurveyDiagnosisLinkStatus {
  if (status === "skipped_closed" || status === "skipped_restricted") {
    return "skipped";
  }
  if (status === "timeout") return "failed_retryable";
  return status;
}

export type SurveyDiagnosisLinkRow = {
  id: string;
  survey_link_id: string;
  diagnosis_job_id: string | null;
  report_id: string | null;
  canonical_url: string;
  scan_cache_key: string;
  status: SurveyDiagnosisLinkStatus;
  skip_reason: string | null;
  extractor_key: string | null;
  diagnosis_version: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function mapScanStatusToLinkage(
  apiStatus: string,
): SurveyDiagnosisLinkStatus | null {
  if (apiStatus === "pending" || apiStatus === "idle") return "queued";
  if (apiStatus === "running") return "running";
  if (apiStatus === "completed") return "completed";
  if (apiStatus === "limited") return "limited";
  if (apiStatus === "cancelled") return "failed_final";
  if (apiStatus === "failed") return "failed_retryable";
  return null;
}

/** Map a finished scan_job (+ limited reason) to the collector linkage status. */
export function linkageStatusFromScanOutcome(input: {
  scanStatus: string;
  errorMessage?: string | null;
  limitedReason?: string | null;
  summary?: string | null;
}): SurveyDiagnosisLinkStatus {
  const scanStatus = String(input.scanStatus || "");
  const text = [input.errorMessage, input.limitedReason, input.summary]
    .filter(Boolean)
    .join(" ");
  const bucket = classifyLimitedOutcome({
    scanStatus,
    limitedReason: input.limitedReason,
    errorMessage: input.errorMessage,
    summary: input.summary,
  });

  if (scanStatus === "pending" || scanStatus === "idle") return "queued";
  if (scanStatus === "running") return "running";
  if (scanStatus === "completed" && bucket === "normal_diagnosis") {
    return "completed";
  }
  if (bucket === "survey_closed") return "skipped_closed";
  if (bucket === "access_restricted") return "skipped_restricted";
  if (
    bucket === "system_failure" ||
    /timed?\s*out|시간이\s*초과|timeout/i.test(text)
  ) {
    return "timeout";
  }
  if (scanStatus === "cancelled") return "failed_final";
  if (scanStatus === "failed") return "failed_retryable";
  if (scanStatus === "limited" || bucket === "extraction_limited") {
    return "limited";
  }
  if (scanStatus === "completed") return "completed";
  return mapScanStatusToLinkage(scanStatus) ?? "failed_retryable";
}

function isTerminalLinkageStatus(status: SurveyDiagnosisLinkStatus): boolean {
  return (
    status === "completed" ||
    status === "limited" ||
    status === "failed_retryable" ||
    status === "failed_final" ||
    status === "skipped" ||
    status === "skipped_closed" ||
    status === "skipped_restricted" ||
    status === "timeout"
  );
}

function pickExtractorKey(
  job: { extraction_mode?: string | null } | null,
  reportJson: Record<string, unknown> | null,
): string | null {
  if (reportJson) {
    const candidates = [
      reportJson.extractor,
      reportJson.extractorKey,
      reportJson.extractor_key,
      (reportJson.meta as Record<string, unknown> | undefined)?.extractor,
      (reportJson.debug as Record<string, unknown> | undefined)?.extractor,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
  }
  const mode = job?.extraction_mode?.trim();
  return mode || null;
}

export async function findActiveDiagnosisLinkForSurvey(
  surveyLinkId: string,
): Promise<SurveyDiagnosisLinkRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_diagnosis_links")
    .select("*")
    .eq("survey_link_id", surveyLinkId)
    .in("status", DIAGNOSIS_LINK_BLOCKING_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[diagnosisLink] findActive", error.message);
    return null;
  }
  return (data as SurveyDiagnosisLinkRow | null) ?? null;
}

export async function findDiagnosisLinksBySurveyIds(
  surveyLinkIds: string[],
): Promise<Map<string, SurveyDiagnosisLinkRow>> {
  const map = new Map<string, SurveyDiagnosisLinkRow>();
  if (surveyLinkIds.length === 0) return map;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_diagnosis_links")
    .select("*")
    .in("survey_link_id", surveyLinkIds)
    .in("status", SURVEY_DIAGNOSIS_LINK_STATUSES)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[diagnosisLink] findBySurveyIds", error.message);
    return map;
  }
  for (const row of (data || []) as SurveyDiagnosisLinkRow[]) {
    if (!map.has(row.survey_link_id)) map.set(row.survey_link_id, row);
  }
  return map;
}

export async function insertDiagnosisLink(input: {
  surveyLinkId: string;
  diagnosisJobId: string | null;
  reportId?: string | null;
  canonicalUrl: string;
  scanCacheKey: string;
  status: SurveyDiagnosisLinkStatus;
  skipReason?: string | null;
  extractorKey?: string | null;
  lastError?: string | null;
  attempts?: number;
}): Promise<SurveyDiagnosisLinkRow | null> {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("survey_diagnosis_links")
    .insert({
      survey_link_id: input.surveyLinkId,
      diagnosis_job_id: input.diagnosisJobId,
      report_id: input.reportId ?? null,
      canonical_url: input.canonicalUrl,
      scan_cache_key: input.scanCacheKey,
      status: input.status,
      skip_reason: input.skipReason ?? null,
      extractor_key: input.extractorKey ?? null,
      diagnosis_version: "sure-check-v1",
      queued_at:
        input.status === "queued" || isTerminalLinkageStatus(input.status)
          ? now
          : null,
      started_at: null,
      completed_at: isTerminalLinkageStatus(input.status) ? now : null,
      attempts: input.attempts ?? (input.status === "queued" ? 1 : 0),
      last_error: input.lastError ?? null,
    })
    .select("*")
    .single();
  if (error) {
    const legacy = fallbackLegacyStatus(input.status);
    if (legacy !== input.status && /check|constraint|invalid/i.test(error.message)) {
      const retry = await supabase
        .from("survey_diagnosis_links")
        .insert({
          survey_link_id: input.surveyLinkId,
          diagnosis_job_id: input.diagnosisJobId,
          report_id: input.reportId ?? null,
          canonical_url: input.canonicalUrl,
          scan_cache_key: input.scanCacheKey,
          status: legacy,
          skip_reason: input.skipReason ?? input.status,
          extractor_key: input.extractorKey ?? null,
          diagnosis_version: "sure-check-v1",
          queued_at:
            input.status === "queued" || isTerminalLinkageStatus(input.status)
              ? now
              : null,
          started_at: null,
          completed_at: isTerminalLinkageStatus(input.status) ? now : null,
          attempts: input.attempts ?? (input.status === "queued" ? 1 : 0),
          last_error: input.lastError ?? null,
        })
        .select("*")
        .single();
      if (!retry.error) return retry.data as SurveyDiagnosisLinkRow;
    }
    console.error("[diagnosisLink] insert", error.message);
    return null;
  }
  return data as SurveyDiagnosisLinkRow;
}

export async function updateDiagnosisLinkStatus(input: {
  id: string;
  status: SurveyDiagnosisLinkStatus;
  reportId?: string | null;
  lastError?: string | null;
  diagnosisJobId?: string | null;
  extractorKey?: string | null;
  skipReason?: string | null;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    last_error: input.lastError ?? null,
  };
  if (input.reportId !== undefined) patch.report_id = input.reportId;
  if (input.diagnosisJobId !== undefined) {
    patch.diagnosis_job_id = input.diagnosisJobId;
  }
  if (input.extractorKey !== undefined) {
    patch.extractor_key = input.extractorKey;
  }
  if (input.skipReason !== undefined) patch.skip_reason = input.skipReason;
  if (input.status === "running") patch.started_at = now;
  if (isTerminalLinkageStatus(input.status)) {
    patch.completed_at = now;
  }
  const { error } = await supabase
    .from("survey_diagnosis_links")
    .update(patch)
    .eq("id", input.id);
  if (error) {
    const legacy = fallbackLegacyStatus(input.status);
    if (legacy !== input.status && /check|constraint|invalid/i.test(error.message)) {
      const retry = await supabase
        .from("survey_diagnosis_links")
        .update({
          ...patch,
          status: legacy,
          skip_reason: input.skipReason ?? input.status,
        })
        .eq("id", input.id);
      if (!retry.error) return;
    }
    console.error("[diagnosisLink] update", error.message);
  }
}

export async function countDiagnosisLinksByStatus(): Promise<
  Record<SurveyDiagnosisLinkStatus, number>
> {
  const empty = emptyDiagnosisLinkStatusCounts();
  const supabase = createSupabaseServerClient();
  for (const status of SURVEY_DIAGNOSIS_LINK_STATUSES) {
    const { count, error } = await supabase
      .from("survey_diagnosis_links")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (!error) empty[status] = count ?? 0;
  }
  return empty;
}

/** KST calendar day bounds as UTC instants (Asia/Seoul, UTC+9, no DST). */
export function getKstDayBounds(now: Date = new Date()): {
  kstDate: string;
  startUtcIso: string;
  endUtcIso: string;
} {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstAsUtc = new Date(kstMs);
  const y = kstAsUtc.getUTCFullYear();
  const m = kstAsUtc.getUTCMonth();
  const d = kstAsUtc.getUTCDate();
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  const kstDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    kstDate,
    startUtcIso: new Date(startUtcMs).toISOString(),
    endUtcIso: new Date(endUtcMs).toISOString(),
  };
}

/**
 * Count auto-diagnosis linkage rows created in the current KST day.
 * Manual SURE-Check scans do not write survey_diagnosis_links.
 */
export async function countDiagnosisLinksCreatedInKstDay(
  now: Date = new Date(),
): Promise<{
  kstDate: string;
  total: number;
  byStatus: Record<SurveyDiagnosisLinkStatus, number>;
}> {
  const { kstDate, startUtcIso, endUtcIso } = getKstDayBounds(now);
  const byStatus = emptyDiagnosisLinkStatusCounts();
  const supabase = createSupabaseServerClient();
  let total = 0;
  for (const status of SURVEY_DIAGNOSIS_LINK_STATUSES) {
    const { count, error } = await supabase
      .from("survey_diagnosis_links")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso);
    if (!error) {
      byStatus[status] = count ?? 0;
      total += byStatus[status];
    }
  }
  return { kstDate, total, byStatus };
}

/** Survey link IDs that already have a blocking auto-diagnosis linkage. */
export async function findSurveyIdsWithBlockingDiagnosis(
  surveyLinkIds: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (surveyLinkIds.length === 0) return blocked;
  const supabase = createSupabaseServerClient();
  const chunk = 200;
  for (let i = 0; i < surveyLinkIds.length; i += chunk) {
    const slice = surveyLinkIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("survey_diagnosis_links")
      .select("survey_link_id")
      .in("survey_link_id", slice)
      .in("status", DIAGNOSIS_LINK_BLOCKING_STATUSES);
    if (error) {
      console.error("[diagnosisLink] findBlocking", error.message);
      continue;
    }
    for (const row of data || []) {
      blocked.add(String(row.survey_link_id));
    }
  }
  return blocked;
}

export async function findDiagnosisLinkIdByExternalScanId(
  externalScanId: string,
): Promise<string | null> {
  if (!externalScanId) return null;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_diagnosis_links")
    .select("id")
    .eq("diagnosis_job_id", externalScanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[diagnosisLink] findByJob", error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

export async function syncDiagnosisLinkByExternalScanId(
  externalScanId: string,
): Promise<SurveyDiagnosisLinkStatus | null> {
  const linkId = await findDiagnosisLinkIdByExternalScanId(externalScanId);
  if (!linkId) return null;
  return syncDiagnosisLinkFromScanJob(linkId, externalScanId);
}

export async function syncDiagnosisLinksByExternalScanIds(
  externalScanIds: string[],
): Promise<void> {
  for (const id of externalScanIds) {
    if (!id) continue;
    await syncDiagnosisLinkByExternalScanId(id);
  }
}

export async function syncDiagnosisLinkFromScanJob(
  linkId: string,
  externalScanId: string,
): Promise<SurveyDiagnosisLinkStatus | null> {
  const supabase = createSupabaseServerClient();
  const { data: job, error } = await supabase
    .from("scan_jobs")
    .select("id, status, error_message, extraction_mode")
    .eq("external_scan_id", externalScanId)
    .maybeSingle();
  if (error || !job) return null;

  let reportId: string | null = null;
  let reportJson: Record<string, unknown> | null = null;
  if (job.id) {
    const { data: report } = await supabase
      .from("scan_reports")
      .select("id, report_json")
      .eq("scan_job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reportId = report?.id ? String(report.id) : null;
    reportJson = (report?.report_json as Record<string, unknown> | null) ?? null;
  }

  const limitedReason =
    (typeof reportJson?.limitedReason === "string"
      ? reportJson.limitedReason
      : null) ||
    (typeof (reportJson?.form as { limitedReason?: string } | undefined)
      ?.limitedReason === "string"
      ? (reportJson?.form as { limitedReason?: string }).limitedReason
      : null) ||
    null;
  const summary =
    typeof reportJson?.summary === "string" ? reportJson.summary : null;
  const next = linkageStatusFromScanOutcome({
    scanStatus: String(job.status),
    errorMessage: job.error_message ? String(job.error_message) : null,
    limitedReason,
    summary,
  });

  const extractorKey = pickExtractorKey(
    job as { extraction_mode?: string | null },
    reportJson,
  );
  const errMsg = isTerminalLinkageStatus(next)
    ? String(
        job.error_message ||
          limitedReason ||
          summary ||
          (next === "completed" ? "" : next),
      ) || null
    : null;
  const skipReason =
    next === "skipped_closed" ||
    next === "skipped_restricted" ||
    next === "limited" ||
    next === "timeout" ||
    next === "skipped"
      ? errMsg
      : undefined;

  await updateDiagnosisLinkStatus({
    id: linkId,
    status: next,
    reportId,
    extractorKey,
    lastError: next === "completed" ? null : errMsg,
    skipReason,
  });

  if (
    next === "limited" ||
    next === "skipped_closed" ||
    next === "skipped_restricted"
  ) {
    try {
      const { data: linkRow } = await supabase
        .from("survey_diagnosis_links")
        .select("survey_link_id")
        .eq("id", linkId)
        .maybeSingle();
      const surveyLinkId = linkRow?.survey_link_id
        ? String(linkRow.survey_link_id)
        : null;
      if (surveyLinkId) {
        const { feedbackCollectorStatusFromDiagnosisLink } = await import(
          "@/lib/collector/diagnosisStatusFeedback"
        );
        await feedbackCollectorStatusFromDiagnosisLink({
          surveyLinkId,
          linkageStatus: next,
          limitedReason: errMsg || limitedReason,
        });
      }
    } catch (err) {
      console.warn("[diagnosisLink] collector status feedback skipped:", err);
    }
  }

  return next;
}
