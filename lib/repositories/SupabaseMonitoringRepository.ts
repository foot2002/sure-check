import type { ScanReport } from "@/lib/types/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  reportToMonitoringRows,
  type MonitoringCategoryInsert,
  type MonitoringComplianceCheckInsert,
  type MonitoringFindingInsert,
  type MonitoringIndexScoreInsert,
  type MonitoringQuestionInsert,
  type MonitoringScanJobInsert,
  type MonitoringScanReportInsert,
  type MonitoringSnapshotRows,
  type MonitoringSurveyRecordInsert,
} from "@/lib/monitoring/reportToMonitoringRows";

export interface MonitoringSaveResult {
  scanJobId: string;
  scanReportId: string;
  surveyRecordId: string;
  questionCount: number;
  findingCount: number;
  complianceCheckCount: number;
}

function throwOnError(label: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

export class SupabaseMonitoringRepository {
  async saveScanJob(row: MonitoringScanJobInsert): Promise<string> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("scan_jobs")
      .insert(row)
      .select("id")
      .single();
    throwOnError("saveScanJob", error);
    if (!data?.id) throw new Error("saveScanJob: missing id");
    return data.id as string;
  }

  async saveScanReport(
    scanJobId: string,
    row: MonitoringScanReportInsert,
  ): Promise<string> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("scan_reports")
      .insert({ ...row, scan_job_id: scanJobId })
      .select("id")
      .single();
    throwOnError("saveScanReport", error);
    if (!data?.id) throw new Error("saveScanReport: missing id");
    return data.id as string;
  }

  async saveSurveyRecord(
    scanJobId: string,
    scanReportId: string,
    row: MonitoringSurveyRecordInsert,
  ): Promise<string> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("survey_records")
      .insert({
        ...row,
        scan_job_id: scanJobId,
        scan_report_id: scanReportId,
      })
      .select("id")
      .single();
    throwOnError("saveSurveyRecord", error);
    if (!data?.id) throw new Error("saveSurveyRecord: missing id");
    return data.id as string;
  }

  async saveSurveyQuestions(
    surveyRecordId: string,
    questions: MonitoringQuestionInsert[],
  ): Promise<Array<{ id: string; question_key: string }>> {
    if (questions.length === 0) return [];
    const supabase = createSupabaseServerClient();
    const payload = questions.map((q) => ({
      survey_record_id: surveyRecordId,
      question_key: q.question_key,
      question_number: q.question_number,
      page_number: q.page_number,
      question_label: q.question_label,
      question_type: q.question_type,
      is_required: q.is_required,
      data_risk_level: q.data_risk_level,
      risk_tags: q.risk_tags,
      has_personal_info: q.has_personal_info,
      has_sensitive_info: q.has_sensitive_info,
      has_high_risk_info: q.has_high_risk_info,
      sort_order: q.sort_order,
      observed_at: q.observed_at,
    }));
    const { data, error } = await supabase
      .from("survey_questions")
      .insert(payload)
      .select("id, question_key");
    throwOnError("saveSurveyQuestions", error);
    return (data || []) as Array<{ id: string; question_key: string }>;
  }

  async saveQuestionDataCategories(
    questionIdByKey: Map<string, string>,
    questions: MonitoringQuestionInsert[],
  ): Promise<number> {
    const rows: Array<MonitoringCategoryInsert & { survey_question_id: string }> =
      [];
    for (const question of questions) {
      const surveyQuestionId = questionIdByKey.get(question.question_key);
      if (!surveyQuestionId) continue;
      for (const category of question.categories) {
        rows.push({
          survey_question_id: surveyQuestionId,
          ...category,
        });
      }
    }
    if (rows.length === 0) return 0;
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("question_data_categories")
      .insert(rows);
    throwOnError("saveQuestionDataCategories", error);
    return rows.length;
  }

  async saveComplianceChecks(
    surveyRecordId: string,
    checks: MonitoringComplianceCheckInsert[],
  ): Promise<number> {
    if (checks.length === 0) return 0;
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("survey_compliance_checks").insert(
      checks.map((check) => ({
        survey_record_id: surveyRecordId,
        ...check,
      })),
    );
    throwOnError("saveComplianceChecks", error);
    return checks.length;
  }

  async saveFindings(
    surveyRecordId: string,
    findings: MonitoringFindingInsert[],
  ): Promise<number> {
    if (findings.length === 0) return 0;
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("survey_findings").insert(
      findings.map((finding) => ({
        survey_record_id: surveyRecordId,
        ...finding,
      })),
    );
    throwOnError("saveFindings", error);
    return findings.length;
  }

  async saveIndexScores(
    surveyRecordId: string,
    scores: MonitoringIndexScoreInsert,
  ): Promise<string> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("survey_index_scores")
      .insert({
        survey_record_id: surveyRecordId,
        ...scores,
      })
      .select("id")
      .single();
    throwOnError("saveIndexScores", error);
    if (!data?.id) throw new Error("saveIndexScores: missing id");
    return data.id as string;
  }

  /**
   * Persist a completed diagnosis snapshot into monitoring tables.
   * Order: jobs → reports → records → questions → categories → checks → findings → scores
   */
  async saveMonitoringSnapshot(
    report: ScanReport,
    rows?: MonitoringSnapshotRows,
  ): Promise<MonitoringSaveResult> {
    const snapshot = rows ?? reportToMonitoringRows(report);

    const existing = await this.findMonitoringIdsByExternalScanId(report.scanId);
    if (existing?.scanJobId) {
      return this.finalizeMonitoringSnapshotForJob(
        existing.scanJobId,
        report,
        snapshot,
      );
    }

    const scanJobId = await this.saveScanJob(snapshot.scanJob);
    return this.insertMonitoringChildren(scanJobId, snapshot);
  }

  /**
   * Update an already-queued scan_jobs row, then insert report/survey children.
   * Used by the async job worker so we do not create duplicate scan_jobs.
   */
  async finalizeMonitoringSnapshotForJob(
    scanJobId: string,
    report: ScanReport,
    rows?: MonitoringSnapshotRows,
  ): Promise<MonitoringSaveResult> {
    const snapshot = rows ?? reportToMonitoringRows(report);
    const supabase = createSupabaseServerClient();

    const { error: updateError } = await supabase
      .from("scan_jobs")
      .update({
        form_url: snapshot.scanJob.form_url,
        file_name: snapshot.scanJob.file_name,
        url_host: snapshot.scanJob.url_host,
        form_url_hash: snapshot.scanJob.form_url_hash,
        survey_url_hash: snapshot.scanJob.survey_url_hash,
        platform: snapshot.scanJob.platform,
        status: snapshot.scanJob.status,
        current_step: snapshot.scanJob.current_step,
        total_steps: snapshot.scanJob.total_steps,
        step_label: snapshot.scanJob.step_label,
        error_message: snapshot.scanJob.error_message,
        started_at: snapshot.scanJob.started_at,
        completed_at: snapshot.scanJob.completed_at,
        monitoring_saved: true,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scanJobId);
    if (updateError) {
      // Migration 002 may not be applied yet — retry without queue columns.
      const { error: retryError } = await supabase
        .from("scan_jobs")
        .update({
          form_url: snapshot.scanJob.form_url,
          file_name: snapshot.scanJob.file_name,
          url_host: snapshot.scanJob.url_host,
          form_url_hash: snapshot.scanJob.form_url_hash,
          survey_url_hash: snapshot.scanJob.survey_url_hash,
          platform: snapshot.scanJob.platform,
          status: snapshot.scanJob.status,
          current_step: snapshot.scanJob.current_step,
          total_steps: snapshot.scanJob.total_steps,
          step_label: snapshot.scanJob.step_label,
          error_message: snapshot.scanJob.error_message,
          started_at: snapshot.scanJob.started_at,
          completed_at: snapshot.scanJob.completed_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", scanJobId);
      throwOnError("finalizeMonitoringSnapshotForJob.update", retryError);
    } else {
      // ok
    }

    const { data: existingReport } = await supabase
      .from("scan_reports")
      .select("id")
      .eq("scan_job_id", scanJobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingReport?.id) {
      const { data: survey } = await supabase
        .from("survey_records")
        .select("id")
        .eq("scan_job_id", scanJobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        scanJobId,
        scanReportId: existingReport.id as string,
        surveyRecordId: (survey?.id as string | undefined) || "",
        questionCount: 0,
        findingCount: 0,
        complianceCheckCount: 0,
      };
    }

    return this.insertMonitoringChildren(scanJobId, snapshot);
  }

  private async insertMonitoringChildren(
    scanJobId: string,
    snapshot: MonitoringSnapshotRows,
  ): Promise<MonitoringSaveResult> {
    const scanReportId = await this.saveScanReport(
      scanJobId,
      snapshot.scanReport,
    );
    const surveyRecordId = await this.saveSurveyRecord(
      scanJobId,
      scanReportId,
      snapshot.surveyRecord,
    );

    const savedQuestions = await this.saveSurveyQuestions(
      surveyRecordId,
      snapshot.questions,
    );
    const questionIdByKey = new Map(
      savedQuestions.map((q) => [q.question_key, q.id]),
    );
    await this.saveQuestionDataCategories(questionIdByKey, snapshot.questions);

    const complianceCheckCount = await this.saveComplianceChecks(
      surveyRecordId,
      snapshot.complianceChecks,
    );
    const findingCount = await this.saveFindings(
      surveyRecordId,
      snapshot.findings,
    );
    await this.saveIndexScores(surveyRecordId, snapshot.indexScores);

    return {
      scanJobId,
      scanReportId,
      surveyRecordId,
      questionCount: savedQuestions.length,
      findingCount,
      complianceCheckCount,
    };
  }

  /**
   * Resolve monitoring row ids from URL scan id (scan_jobs.external_scan_id).
   */
  async findMonitoringIdsByExternalScanId(
    externalScanId: string,
  ): Promise<{ scanJobId: string; surveyRecordId: string | null } | null> {
    const supabase = createSupabaseServerClient();
    const { data: job, error: jobError } = await supabase
      .from("scan_jobs")
      .select("id")
      .eq("external_scan_id", externalScanId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError("findMonitoringIdsByExternalScanId.scan_jobs", jobError);
    if (!job?.id) return null;

    const { data: survey, error: surveyError } = await supabase
      .from("survey_records")
      .select("id")
      .eq("scan_job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOnError("findMonitoringIdsByExternalScanId.survey_records", surveyError);

    return {
      scanJobId: job.id as string,
      surveyRecordId: (survey?.id as string | undefined) ?? null,
    };
  }

  /** Cascade-delete monitoring rows for a test/external scan id. */
  async deleteByExternalScanId(externalScanId: string): Promise<number> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("scan_jobs")
      .delete()
      .eq("external_scan_id", externalScanId)
      .select("id");
    throwOnError("deleteByExternalScanId", error);
    return data?.length ?? 0;
  }
}

let monitoringRepo: SupabaseMonitoringRepository | null = null;

export function getSupabaseMonitoringRepository(): SupabaseMonitoringRepository {
  if (!monitoringRepo) {
    monitoringRepo = new SupabaseMonitoringRepository();
  }
  return monitoringRepo;
}

export async function saveMonitoringSnapshot(
  report: ScanReport,
): Promise<MonitoringSaveResult> {
  return getSupabaseMonitoringRepository().saveMonitoringSnapshot(report);
}

export async function finalizeMonitoringSnapshotForJob(
  scanJobId: string,
  report: ScanReport,
): Promise<MonitoringSaveResult> {
  return getSupabaseMonitoringRepository().finalizeMonitoringSnapshotForJob(
    scanJobId,
    report,
  );
}
