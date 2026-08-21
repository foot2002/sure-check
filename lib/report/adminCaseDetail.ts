import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mapPublicationToPublish,
  mapPublishToPublication,
} from "@/lib/report/adminCases";
import {
  buildEvidenceEmptyState,
  evidenceTypeLabel,
  loadAdminCaptureJobs,
  loadAdminEvidenceFiles,
  type EvidenceEmptyState,
} from "@/lib/report/adminEvidence";
import { summarizeEvidenceFiles } from "@/lib/report/adminOutreach";
import type {
  PublicationStatus,
  PublicCaseStatus,
  ReviewOutcome,
  ReviewStatus,
  UrlVisibility,
} from "@/lib/db/types";
import { normalizePublicCaseStatus } from "@/lib/report/publicCasePolicy";
import { normalizeUrlVisibility } from "@/lib/report/publicDisplayName";

export interface AdminCaseDetail {
  id: string;
  summary: {
    surveyTitle: string | null;
    surveyUrl: string | null;
    finalUrl: string | null;
    platform: string;
    operatorName: string | null;
    subjectType: string | null;
    publicPrivateType: string;
    overallRiskLevel: string;
    score: number | null;
    userDecisionLabel: string | null;
    diagnosisStatus: string | null;
    confidence: string | null;
    questionCount: number;
    personalInfoQuestionCount: number;
    sensitiveQuestionCount: number;
    highRiskQuestionCount: number;
    hasPersonalInfo: boolean;
    hasSensitiveInfo: boolean;
    hasHighRiskInfo: boolean;
    captureCompleteness: string | null;
    captureStatus: string | null;
    evidenceCount: number;
    reviewStatus: ReviewStatus;
    publishStatus: string;
    publicationStatus: PublicationStatus;
    observedAt: string;
    observedDateKst: string;
    scanReportId: string | null;
    scanJobId: string;
    externalScanId: string | null;
    hasTemporaryZip: boolean;
    hasScreenshots: boolean;
    downloadableEvidenceTypes: string[];
    temporaryZipId: string | null;
    screenshotFileIds: string[];
    publicCaseStatus: PublicCaseStatus;
    publicId: string | null;
  };
  publicCase: {
    publicId: string | null;
    status: PublicCaseStatus;
    publicDisplayName: string | null;
    publicSurveyTitle: string | null;
    publicSummary: string | null;
    publicProblemSummary: string | null;
    publicImprovementSummary: string | null;
    urlVisibility: UrlVisibility;
    publicSurveyUrl: string | null;
    publicUrlHost: string | null;
    selectedEvidenceFileIds: string[];
  } | null;
  performance: {
    extractionMode: string | null;
    browserUsed: boolean;
    browserReason: string | null;
    fastExtractorConfidence: string | null;
    fallbackTriggered: boolean;
    fallbackReason: string | null;
    totalDurationMs: number | null;
    extractDurationMs: number | null;
    analysisDurationMs: number | null;
    saveDurationMs: number | null;
  };
  findings: Array<{
    id: string;
    findingType: string;
    checkDomain: string | null;
    severity: string;
    title: string;
    description: string | null;
    recommendation: string | null;
    evidenceNote: string | null;
    legalBasisCodes: string[];
    status: string;
  }>;
  complianceChecks: Array<{
    id: string;
    checkDomain: string;
    checkItem: string;
    status: string;
    statusLabel: string;
    evidenceNote: string | null;
    legalBasisCode: string | null;
  }>;
  indexScores: {
    overallScore: number | null;
    dataScore: number | null;
    toolScore: number | null;
    noticeScore: number | null;
    managementScore: number | null;
    personalInfoScore: number | null;
    sensitiveInfoScore: number | null;
    highRiskInfoScore: number | null;
    complianceGapScore: number | null;
    overallRiskLevel: string | null;
  } | null;
  questions: Array<{
    id: string;
    questionNumber: string | null;
    pageNumber: number | null;
    questionLabel: string;
    questionType: string | null;
    isRequired: boolean | null;
    dataRiskLevel: string | null;
    hasPersonalInfo: boolean;
    hasSensitiveInfo: boolean;
    hasHighRiskInfo: boolean;
    categories: Array<{
      categoryCode: string;
      categoryLabel: string;
      riskCategory: string;
      matchedKeyword: string | null;
    }>;
  }>;
  captureJobs: Array<{
    id: string;
    captureMode: string | null;
    status: string;
    completeness: string | null;
    capturedPageCount: number;
    keyEvidenceCount: number;
    temporaryAnswersUsed: boolean;
    finalSubmitDetected: boolean;
    finalSubmitClicked: boolean;
    pathScope: string | null;
    stopReason: string | null;
    limitations: string[];
  }>;
  evidenceFiles: Array<{
    id: string;
    evidenceType: string;
    evidenceTypeLabel: string;
    isKeyEvidence: boolean;
    retentionLevel: string;
    mimeType: string | null;
    byteSize: number | null;
    sha256: string | null;
    label: string | null;
    expiresAt: string | null;
    pageNumber: number | null;
    // Intentionally omit storage_path from default payload listing —
    // signed URL endpoint resolves by evidence file id.
  }>;
  evidenceEmptyState: EvidenceEmptyState;
  reportJson: Record<string, unknown> | null;
  reviewCase: {
    id: string;
    reviewStatus: ReviewStatus;
    reviewerNote: string | null;
    resolutionNote: string | null;
    outcome: ReviewOutcome | null;
  } | null;
}

export async function getAdminCaseDetail(id: string): Promise<AdminCaseDetail> {
  const supabase = createSupabaseServerClient();

  const { data: survey, error: surveyError } = await supabase
    .from("survey_records")
    .select(
      "id, survey_title, survey_url, final_url, platform, operator_name, subject_type, public_private_type, overall_risk_level, user_decision_label, review_status, publish_status, question_count, personal_info_question_count, sensitive_question_count, high_risk_question_count, has_personal_info, has_sensitive_info, has_high_risk_info, observed_at, observed_date_kst, scan_report_id, scan_job_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (surveyError) throw new Error(`survey: ${surveyError.message}`);
  if (!survey) {
    const err = new Error("NOT_FOUND");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const [
    findingsRes,
    complianceRes,
    scoresRes,
    questionsRes,
    reportRes,
    reviewRes,
    pubsQuery,
  ] = await Promise.all([
    supabase
      .from("survey_findings")
      .select(
        "id, finding_type, check_domain, severity, title, description, recommendation, evidence_note, legal_basis_codes, status",
      )
      .eq("survey_record_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("survey_compliance_checks")
      .select(
        "id, check_domain, check_item, status, status_label, evidence_note, legal_basis_code",
      )
      .eq("survey_record_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("survey_index_scores")
      .select(
        "overall_score, data_score, tool_score, notice_score, management_score, personal_info_score, sensitive_info_score, high_risk_info_score, compliance_gap_score, overall_risk_level",
      )
      .eq("survey_record_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("survey_questions")
      .select(
        "id, question_number, page_number, question_label, question_type, is_required, data_risk_level, has_personal_info, has_sensitive_info, has_high_risk_info, sort_order",
      )
      .eq("survey_record_id", id)
      .order("sort_order", { ascending: true }),
    survey.scan_report_id
      ? supabase
          .from("scan_reports")
          .select("id, diagnosis_status, confidence, score, report_json, user_decision_label")
          .eq("id", survey.scan_report_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("review_cases")
      .select("id, review_status, reviewer_note, resolution_note, outcome, updated_at")
      .eq("survey_record_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("publication_records")
      .select(
        "publish_status, public_id, public_case_status, public_display_name, public_survey_title, public_summary, public_problem_summary, public_improvement_summary, url_visibility, public_survey_url, public_url_host, selected_evidence_file_ids, updated_at",
      )
      .eq("survey_record_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Evidence linking may use survey_record_id and/or scan_job_id / capture_job_id.
  const captureRows = await loadAdminCaptureJobs(
    supabase,
    id,
    (survey.scan_job_id as string | null) || null,
  );
  const evidenceRows = await loadAdminEvidenceFiles(
    supabase,
    id,
    (survey.scan_job_id as string | null) || null,
    captureRows.map((row) => row.id),
  );

  if (findingsRes.error) throw new Error(findingsRes.error.message);
  if (complianceRes.error) throw new Error(complianceRes.error.message);
  if (scoresRes.error) throw new Error(scoresRes.error.message);
  if (questionsRes.error) throw new Error(questionsRes.error.message);

  let pubsRes: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  } = pubsQuery as {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
  if (pubsRes.error) {
    const missingPublicCase =
      /public_case_status|public_id|schema cache|does not exist/i.test(
        pubsRes.error.message,
      );
    if (!missingPublicCase) throw new Error(pubsRes.error.message);
    console.warn(
      "[admin] publication_records public case columns missing — apply db/migrations/013_public_cases.sql",
    );
    const fallback = await supabase
      .from("publication_records")
      .select("publish_status, updated_at")
      .eq("survey_record_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    pubsRes = {
      data: (fallback.data as Record<string, unknown> | null) || null,
      error: fallback.error,
    };
  }
  let scanJobPerf: Record<string, unknown> | null = null;
  if (survey.scan_job_id) {
    const { data: jobRow } = await supabase
      .from("scan_jobs")
      .select(
        "external_scan_id, extraction_mode, browser_used, browser_reason, fast_extractor_confidence, fallback_triggered, fallback_reason, total_duration_ms, extract_duration_ms, analysis_duration_ms, save_duration_ms",
      )
      .eq("id", survey.scan_job_id)
      .maybeSingle();
    scanJobPerf = (jobRow as Record<string, unknown> | null) || null;
  }
  const reportJsonDebug = (
    reportRes.data?.report_json as { debug?: Record<string, unknown> } | null
  )?.debug;
  if (reportRes.error) throw new Error(reportRes.error.message);
  if (reviewRes.error) throw new Error(reviewRes.error.message);

  const questions = questionsRes.data || [];
  const questionIds = questions.map((q) => q.id as string);
  const categoriesRes = questionIds.length
    ? await supabase
        .from("question_data_categories")
        .select(
          "survey_question_id, category_code, category_label, risk_category, matched_keyword",
        )
        .in("survey_question_id", questionIds)
    : { data: [], error: null };
  if (categoriesRes.error) throw new Error(categoriesRes.error.message);

  const categoriesByQuestion = new Map<
    string,
    Array<{
      categoryCode: string;
      categoryLabel: string;
      riskCategory: string;
      matchedKeyword: string | null;
    }>
  >();
  for (const row of categoriesRes.data || []) {
    const list = categoriesByQuestion.get(row.survey_question_id) || [];
    list.push({
      categoryCode: row.category_code,
      categoryLabel: row.category_label,
      riskCategory: row.risk_category,
      matchedKeyword: row.matched_keyword,
    });
    categoriesByQuestion.set(row.survey_question_id, list);
  }

  const report = reportRes.data;
  const capture = captureRows[0] || null;
  const publicationStatus = mapPublishToPublication(
    survey.publish_status,
    pubsRes.data?.publish_status as PublicationStatus | undefined,
  );
  const publicCaseStatus = normalizePublicCaseStatus(
    pubsRes.data?.public_case_status as string | undefined,
  );
  const publicCase = pubsRes.data
    ? {
        publicId: (pubsRes.data.public_id as string | null) || null,
        status: publicCaseStatus,
        publicDisplayName:
          (pubsRes.data.public_display_name as string | null) || null,
        publicSurveyTitle:
          (pubsRes.data.public_survey_title as string | null) || null,
        publicSummary: (pubsRes.data.public_summary as string | null) || null,
        publicProblemSummary:
          (pubsRes.data.public_problem_summary as string | null) || null,
        publicImprovementSummary:
          (pubsRes.data.public_improvement_summary as string | null) || null,
        urlVisibility: normalizeUrlVisibility(
          pubsRes.data.url_visibility as string | null,
        ),
        publicSurveyUrl:
          (pubsRes.data.public_survey_url as string | null) || null,
        publicUrlHost: (pubsRes.data.public_url_host as string | null) || null,
        selectedEvidenceFileIds: Array.isArray(
          pubsRes.data.selected_evidence_file_ids,
        )
          ? (pubsRes.data.selected_evidence_file_ids as string[])
          : [],
      }
    : null;
  const evidenceEmptyState = buildEvidenceEmptyState({
    captureJobCount: captureRows.length,
    evidenceFileCount: evidenceRows.length,
  });
  const evidenceSummary = summarizeEvidenceFiles(
    evidenceRows.map((e) => ({
      id: e.id as string,
      evidenceType: (e.evidence_type as string | null) || null,
    })),
  );

  return {
    id: survey.id,
    summary: {
      surveyTitle: survey.survey_title,
      surveyUrl: survey.survey_url,
      finalUrl: survey.final_url,
      platform: survey.platform,
      operatorName: survey.operator_name,
      subjectType: survey.subject_type,
      publicPrivateType: survey.public_private_type,
      overallRiskLevel: survey.overall_risk_level,
      score: scoresRes.data?.overall_score ?? report?.score ?? null,
      userDecisionLabel:
        survey.user_decision_label || report?.user_decision_label || null,
      diagnosisStatus: report?.diagnosis_status || null,
      confidence: report?.confidence || null,
      questionCount: survey.question_count || 0,
      personalInfoQuestionCount: survey.personal_info_question_count || 0,
      sensitiveQuestionCount: survey.sensitive_question_count || 0,
      highRiskQuestionCount: survey.high_risk_question_count || 0,
      hasPersonalInfo: Boolean(survey.has_personal_info),
      hasSensitiveInfo: Boolean(survey.has_sensitive_info),
      hasHighRiskInfo: Boolean(survey.has_high_risk_info),
      captureCompleteness: capture?.completeness || null,
      captureStatus: capture?.status || null,
      evidenceCount: evidenceRows.length,
      reviewStatus: (survey.review_status || "none") as ReviewStatus,
      publishStatus: survey.publish_status,
      publicationStatus,
      observedAt: survey.observed_at,
      observedDateKst: survey.observed_date_kst,
      scanReportId: survey.scan_report_id,
      scanJobId: survey.scan_job_id,
      externalScanId:
        (scanJobPerf?.external_scan_id as string | null) || null,
      hasTemporaryZip: evidenceSummary.hasTemporaryZip,
      hasScreenshots: evidenceSummary.hasScreenshots,
      downloadableEvidenceTypes: evidenceSummary.downloadableEvidenceTypes,
      temporaryZipId: evidenceSummary.temporaryZipId,
      screenshotFileIds: evidenceSummary.screenshotFileIds,
      publicCaseStatus,
      publicId: publicCase?.publicId || null,
    },
    publicCase,
    performance: {
      extractionMode:
        (scanJobPerf?.extraction_mode as string | null) ||
        (reportJsonDebug?.extractionMode as string | null) ||
        null,
      browserUsed: Boolean(
        scanJobPerf?.browser_used ?? reportJsonDebug?.browserUsed ?? false,
      ),
      browserReason:
        (scanJobPerf?.browser_reason as string | null) ||
        (reportJsonDebug?.browserReason as string | null) ||
        null,
      fastExtractorConfidence:
        (scanJobPerf?.fast_extractor_confidence as string | null) ||
        (reportJsonDebug?.fastExtractorConfidence as string | null) ||
        null,
      fallbackTriggered: Boolean(
        scanJobPerf?.fallback_triggered ??
          reportJsonDebug?.fallbackTriggered ??
          false,
      ),
      fallbackReason:
        (scanJobPerf?.fallback_reason as string | null) ||
        (reportJsonDebug?.fallbackReason as string | null) ||
        null,
      totalDurationMs:
        (scanJobPerf?.total_duration_ms as number | null) ??
        (reportJsonDebug?.totalDurationMs as number | null) ??
        null,
      extractDurationMs:
        (scanJobPerf?.extract_duration_ms as number | null) ??
        (reportJsonDebug?.extractDurationMs as number | null) ??
        null,
      analysisDurationMs:
        (scanJobPerf?.analysis_duration_ms as number | null) ??
        (reportJsonDebug?.analysisDurationMs as number | null) ??
        null,
      saveDurationMs:
        (scanJobPerf?.save_duration_ms as number | null) ??
        (reportJsonDebug?.saveDurationMs as number | null) ??
        null,
    },
    findings: (findingsRes.data || []).map((f) => ({
      id: f.id,
      findingType: f.finding_type,
      checkDomain: f.check_domain,
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
      evidenceNote: f.evidence_note,
      legalBasisCodes: f.legal_basis_codes || [],
      status: f.status,
    })),
    complianceChecks: (complianceRes.data || []).map((c) => ({
      id: c.id,
      checkDomain: c.check_domain,
      checkItem: c.check_item,
      status: c.status,
      statusLabel: c.status_label,
      evidenceNote: c.evidence_note,
      legalBasisCode: c.legal_basis_code,
    })),
    indexScores: scoresRes.data
      ? {
          overallScore: scoresRes.data.overall_score,
          dataScore: scoresRes.data.data_score,
          toolScore: scoresRes.data.tool_score,
          noticeScore: scoresRes.data.notice_score,
          managementScore: scoresRes.data.management_score,
          personalInfoScore: scoresRes.data.personal_info_score,
          sensitiveInfoScore: scoresRes.data.sensitive_info_score,
          highRiskInfoScore: scoresRes.data.high_risk_info_score,
          complianceGapScore: scoresRes.data.compliance_gap_score,
          overallRiskLevel: scoresRes.data.overall_risk_level,
        }
      : null,
    questions: questions.map((q) => ({
      id: q.id,
      questionNumber: q.question_number,
      pageNumber: q.page_number,
      questionLabel: q.question_label,
      questionType: q.question_type,
      isRequired: q.is_required,
      dataRiskLevel: q.data_risk_level,
      hasPersonalInfo: Boolean(q.has_personal_info),
      hasSensitiveInfo: Boolean(q.has_sensitive_info),
      hasHighRiskInfo: Boolean(q.has_high_risk_info),
      categories: categoriesByQuestion.get(q.id) || [],
    })),
    captureJobs: captureRows.map((c) => ({
      id: c.id,
      captureMode: c.capture_mode,
      status: c.status,
      completeness: c.completeness,
      capturedPageCount: c.captured_page_count || 0,
      keyEvidenceCount: c.key_evidence_count || 0,
      temporaryAnswersUsed: Boolean(c.temporary_answers_used),
      finalSubmitDetected: Boolean(c.final_submit_detected),
      finalSubmitClicked: Boolean(c.final_submit_clicked),
      pathScope: c.path_scope,
      stopReason: c.stop_reason,
      limitations: c.limitations || [],
    })),
    evidenceFiles: evidenceRows.map((e) => ({
      id: e.id,
      evidenceType: e.evidence_type,
      evidenceTypeLabel: evidenceTypeLabel(e.evidence_type),
      isKeyEvidence: Boolean(e.is_key_evidence),
      retentionLevel: e.retention_level,
      mimeType: e.mime_type,
      byteSize: e.byte_size,
      sha256: e.sha256,
      label: e.label,
      expiresAt: e.expires_at,
      pageNumber: e.page_number,
    })),
    evidenceEmptyState,
    reportJson: (report?.report_json as Record<string, unknown> | null) || null,
    reviewCase: reviewRes.data
      ? {
          id: reviewRes.data.id,
          reviewStatus: reviewRes.data.review_status as ReviewStatus,
          reviewerNote: reviewRes.data.reviewer_note,
          resolutionNote: reviewRes.data.resolution_note,
          outcome: reviewRes.data.outcome as ReviewOutcome | null,
        }
      : null,
  };
}

export async function updateAdminCaseReview(input: {
  id: string;
  reviewStatus: ReviewStatus;
  reviewerNote?: string | null;
  resolutionNote?: string | null;
  outcome?: ReviewOutcome | null;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: survey, error: surveyError } = await supabase
    .from("survey_records")
    .select("id, scan_report_id, survey_title, overall_risk_level, observed_at, observed_date_kst")
    .eq("id", input.id)
    .maybeSingle();
  if (surveyError) throw new Error(surveyError.message);
  if (!survey) {
    const err = new Error("NOT_FOUND");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const closed =
    input.reviewStatus === "resolved" || input.reviewStatus === "dismissed"
      ? new Date().toISOString()
      : null;

  const { error: srErr } = await supabase
    .from("survey_records")
    .update({ review_status: input.reviewStatus })
    .eq("id", input.id);
  if (srErr) throw new Error(srErr.message);

  if (survey.scan_report_id) {
    const { error: reportErr } = await supabase
      .from("scan_reports")
      .update({ review_status: input.reviewStatus })
      .eq("id", survey.scan_report_id);
    if (reportErr) throw new Error(reportErr.message);
  }

  const { data: existing } = await supabase
    .from("review_cases")
    .select("id")
    .eq("survey_record_id", input.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("review_cases")
      .update({
        review_status: input.reviewStatus,
        reviewer_note: input.reviewerNote ?? null,
        resolution_note: input.resolutionNote ?? null,
        outcome: input.outcome ?? null,
        closed_at: closed,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("review_cases").insert({
      survey_record_id: input.id,
      scan_report_id: survey.scan_report_id,
      review_status: input.reviewStatus,
      title: survey.survey_title || "검토 케이스",
      overall_risk_level: survey.overall_risk_level,
      reviewer_note: input.reviewerNote ?? null,
      resolution_note: input.resolutionNote ?? null,
      outcome: input.outcome ?? null,
      observed_at: survey.observed_at,
      observed_date_kst: survey.observed_date_kst,
      closed_at: closed,
    });
    if (error) throw new Error(error.message);
  }
}

export async function updateAdminCasePublication(input: {
  id: string;
  publicationStatus: PublicationStatus;
  allowNamed?: boolean;
}): Promise<void> {
  if (input.publicationStatus === "public_named" && !input.allowNamed) {
    const err = new Error(
      "public_named requires explicit confirmation (allowNamed=true)",
    );
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const supabase = createSupabaseServerClient();
  const { data: survey, error: surveyError } = await supabase
    .from("survey_records")
    .select(
      "id, scan_report_id, survey_title, review_status, observed_at, observed_date_kst",
    )
    .eq("id", input.id)
    .maybeSingle();
  if (surveyError) throw new Error(surveyError.message);
  if (!survey) {
    const err = new Error("NOT_FOUND");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  if (
    input.publicationStatus === "public_named" &&
    survey.review_status !== "resolved"
  ) {
    const err = new Error(
      "public_named은 검토 상태가 resolved인 경우에만 선택할 수 있습니다.",
    );
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const publishStatus = mapPublicationToPublish(input.publicationStatus);
  const now = new Date().toISOString();

  const { error: srErr } = await supabase
    .from("survey_records")
    .update({ publish_status: publishStatus })
    .eq("id", input.id);
  if (srErr) throw new Error(srErr.message);

  if (survey.scan_report_id) {
    const { error: reportErr } = await supabase
      .from("scan_reports")
      .update({ publish_status: publishStatus })
      .eq("id", survey.scan_report_id);
    if (reportErr) throw new Error(reportErr.message);
  }

  const { data: existing } = await supabase
    .from("publication_records")
    .select("id")
    .eq("survey_record_id", input.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("publication_records")
      .update({
        publish_status: input.publicationStatus,
        published_at:
          input.publicationStatus === "public_anonymized" ||
          input.publicationStatus === "public_named"
            ? now
            : null,
        unpublished_at:
          input.publicationStatus === "private" ||
          input.publicationStatus === "archived"
            ? now
            : null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("publication_records").insert({
      survey_record_id: input.id,
      scan_report_id: survey.scan_report_id,
      publish_status: input.publicationStatus,
      title: survey.survey_title,
      observed_at: survey.observed_at,
      observed_date_kst: survey.observed_date_kst,
      published_at:
        input.publicationStatus === "public_anonymized" ||
        input.publicationStatus === "public_named"
          ? now
          : null,
    });
    if (error) throw new Error(error.message);
  }
}
