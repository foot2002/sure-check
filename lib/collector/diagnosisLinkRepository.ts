/**
 * survey_diagnosis_links repository — linkage only to scan_jobs / reports.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SurveyDiagnosisLinkStatus =
  | "queued"
  | "running"
  | "completed"
  | "limited"
  | "failed_retryable"
  | "failed_final"
  | "skipped";

/** Statuses that block automatic re-enqueue for the same survey_link. */
export const DIAGNOSIS_LINK_BLOCKING_STATUSES: SurveyDiagnosisLinkStatus[] = [
  "queued",
  "running",
  "completed",
  "limited",
  "failed_final",
];

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

function isTerminalLinkageStatus(status: SurveyDiagnosisLinkStatus): boolean {
  return (
    status === "completed" ||
    status === "limited" ||
    status === "failed_retryable" ||
    status === "failed_final" ||
    status === "skipped"
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
    .in("status", [
      "queued",
      "running",
      "completed",
      "limited",
      "failed_retryable",
      "failed_final",
      "skipped",
    ])
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
        input.status === "queued" ||
        input.status === "completed" ||
        input.status === "limited"
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
  if (error) console.error("[diagnosisLink] update", error.message);
}

export async function countDiagnosisLinksByStatus(): Promise<
  Record<SurveyDiagnosisLinkStatus, number>
> {
  const empty: Record<SurveyDiagnosisLinkStatus, number> = {
    queued: 0,
    running: 0,
    completed: 0,
    limited: 0,
    failed_retryable: 0,
    failed_final: 0,
    skipped: 0,
  };
  const supabase = createSupabaseServerClient();
  for (const status of Object.keys(empty) as SurveyDiagnosisLinkStatus[]) {
    const { count, error } = await supabase
      .from("survey_diagnosis_links")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (!error) empty[status] = count ?? 0;
  }
  return empty;
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

  const next = mapScanStatusToLinkage(String(job.status));
  if (!next) return null;

  let reportId: string | null = null;
  let reportJson: Record<string, unknown> | null = null;
  if (
    (next === "completed" || next === "limited" || next === "failed_retryable") &&
    job.id
  ) {
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

  const extractorKey = pickExtractorKey(
    job as { extraction_mode?: string | null },
    reportJson,
  );
  const errMsg =
    next === "limited" ||
    next === "failed_retryable" ||
    next === "failed_final"
      ? String(job.error_message || (next === "limited" ? "limited" : "scan failed"))
      : null;

  await updateDiagnosisLinkStatus({
    id: linkId,
    status: next,
    reportId,
    extractorKey,
    lastError: errMsg,
    skipReason: next === "limited" ? errMsg : undefined,
  });
  return next;
}
