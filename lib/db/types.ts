/**
 * SURE Check monitoring dashboard DB types.
 * Mirrors `db/migrations/001_monitoring_dashboard_schema.sql`.
 * Schema/types only — no repository or API wiring in this module.
 */

export type SourceKind = "url" | "file";

export type Platform =
  | "google_forms"
  | "naver_form"
  | "moaform"
  | "generic"
  | "wiseon_csap"
  | "unknown";

export type PublicPrivateType = "public" | "private" | "mixed" | "unknown";

export type SurveySubjectType =
  | "public_agency"
  | "private_company"
  | "public_commissioned_private"
  | "nonprofit"
  | "school_local"
  | "medical"
  | "unknown";

export type OverallRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "limited"
  | "unknown";

export type RiskGrade = "safe" | "caution" | "risk" | "high_risk";

export type ScanJobStatus =
  | "idle"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "limited"
  | "cancelled";

export type DiagnosisStatus = "completed" | "limited" | "blocked" | "failed";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export type ReviewStatus =
  | "none"
  | "pending"
  | "in_review"
  | "resolved"
  | "dismissed";

export type PublishStatus = "draft" | "internal" | "published" | "archived";

export type CheckDomain =
  | "notice"
  | "consent"
  | "retention"
  | "destruction"
  | "outsourcing"
  | "overseas_transfer"
  | "sensitive_data"
  | "high_risk_data"
  | "tool_governance"
  | "management"
  | "public_sector"
  | "contact"
  | "other";

export type ComplianceCheckStatus =
  | "compliant"
  | "insufficient"
  | "missing"
  | "needs_review"
  | "not_applicable"
  | "improvement_recommended";

export type FindingSeverity =
  | "info"
  | "improvement_recommended"
  | "needs_review"
  | "deficiency_suspected"
  | "violation_risk";

export type FindingType =
  | "personal_info_risk"
  | "sensitive_info_risk"
  | "high_risk_info"
  | "notice_gap"
  | "consent_gap"
  | "tool_governance"
  | "management_gap"
  | "operator_unclear"
  | "overseas_transfer"
  | "outsourcing"
  | "public_sector_cloud"
  | "limited_diagnosis"
  | "other";

export type FindingStatus = "open" | "acknowledged" | "mitigated" | "dismissed";

export type DataRiskCategory =
  | "direct_identifier"
  | "quasi_identifier"
  | "sensitive_info"
  | "high_risk_info"
  | "general_opinion"
  | "other";

export type DataRiskLevel = "D0" | "D1" | "D2" | "D3" | "D4" | "D5";

export type EvidenceType =
  | "key_screenshot"
  | "notice_screenshot"
  | "pii_question_screenshot"
  | "sensitive_question_screenshot"
  | "high_risk_question_screenshot"
  | "temporary_zip"
  | "summary_document"
  | "metadata";

export type RetentionLevel =
  | "none"
  | "temporary"
  | "short_term"
  | "key_evidence";

export type CaptureMode = "safe_public_only" | "evidence_full_walkthrough";

export type CaptureProvider = Platform;

export type CaptureJobStatus =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "timeout"
  | "skipped";

export type CaptureCompleteness = "complete" | "partial" | "failed";

export type CapturePathScope =
  | "traversed_path"
  | "single_page"
  | "partial_path"
  | "unknown";

export type OperatorMatchMethod =
  | "exact_list"
  | "alias"
  | "keyword_fallback"
  | "manual"
  | "none";

export type OrganizationSource =
  | "manual"
  | "public_institution_index"
  | "detected"
  | "user_confirmed";

export type ReviewPriority = "low" | "normal" | "high" | "urgent";

export type ReviewOutcome =
  | "needs_more_info"
  | "improvement_recommended"
  | "deficiency_suspected"
  | "violation_risk"
  | "no_action"
  | "dismissed";

/** publication_records.publish_status — public disclosure policy */
export type PublicationStatus =
  | "private"
  | "aggregate_only"
  | "public_anonymized"
  | "public_named"
  | "archived";

export interface OrganizationRow {
  id: string;
  name: string;
  name_normalized: string | null;
  public_private_type: PublicPrivateType;
  sector: string | null;
  industry: string | null;
  region: string | null;
  major_type: string | null;
  middle_type: string | null;
  aliases: string[];
  source: OrganizationSource;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceRuleRow {
  id: string;
  rule_code: string;
  label: string;
  short_title: string | null;
  description: string | null;
  check_domain: CheckDomain;
  legal_basis_code: string | null;
  severity_hint: FindingSeverity;
  applies_to: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ScanJobRow {
  id: string;
  external_scan_id: string | null;
  source_kind: SourceKind;
  form_url: string | null;
  file_name: string | null;
  url_host: string | null;
  form_url_hash: string | null;
  survey_url_hash: string | null;
  platform: Platform;
  status: ScanJobStatus;
  current_step: number;
  total_steps: number;
  step_label: string | null;
  error_message: string | null;
  observed_at: string;
  observed_date_kst: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanReportRow {
  id: string;
  scan_job_id: string;
  external_scan_id: string | null;
  diagnosis_status: DiagnosisStatus;
  confidence: ConfidenceLevel | null;
  overall_risk_level: OverallRiskLevel;
  risk_grade: RiskGrade | null;
  score: number | null;
  safety_type_id: string | null;
  user_decision_label: string;
  internal_verdict: string | null;
  summary: string | null;
  report_json: Record<string, unknown>;
  report_summary: Record<string, unknown> | null;
  disclaimer: string;
  limitation_reasons: string[];
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  has_quasi_identifiers: boolean;
  publish_status: PublishStatus;
  review_status: ReviewStatus;
  observed_at: string;
  observed_date_kst: string;
  generated_at: string;
  generated_at_kst: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyRecordRow {
  id: string;
  scan_job_id: string;
  scan_report_id: string | null;
  organization_id: string | null;
  survey_title: string | null;
  survey_url: string | null;
  final_url: string | null;
  url_host: string | null;
  form_url_hash: string | null;
  survey_url_hash: string | null;
  source_kind: SourceKind;
  platform: Platform;
  tool_name: string | null;
  operator_name: string | null;
  public_private_type: PublicPrivateType;
  subject_type: SurveySubjectType | null;
  sector: string | null;
  industry: string | null;
  region: string | null;
  overall_risk_level: OverallRiskLevel;
  user_decision_label: string | null;
  safety_type_id: string | null;
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  question_count: number;
  personal_info_question_count: number;
  sensitive_question_count: number;
  high_risk_question_count: number;
  review_status: ReviewStatus;
  publish_status: PublishStatus;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyQuestionRow {
  id: string;
  survey_record_id: string;
  question_key: string | null;
  question_number: string | null;
  page_number: number | null;
  question_label: string;
  question_type: string | null;
  is_required: boolean | null;
  data_risk_level: DataRiskLevel | null;
  risk_tags: string[];
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  sort_order: number;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionDataCategoryRow {
  id: string;
  survey_question_id: string;
  category_code: string;
  category_label: string;
  risk_category: DataRiskCategory;
  confidence: ConfidenceLevel | null;
  matched_keyword: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyComplianceCheckRow {
  id: string;
  survey_record_id: string;
  compliance_rule_id: string | null;
  check_domain: CheckDomain;
  check_item: string;
  status: ComplianceCheckStatus;
  status_label: string;
  evidence_note: string | null;
  legal_basis_code: string | null;
  /** Always false — auto-diagnosis never stores confirmed violations. */
  is_confirmed_violation: false;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyFindingRow {
  id: string;
  survey_record_id: string;
  finding_type: FindingType;
  check_domain: CheckDomain | null;
  severity: FindingSeverity;
  title: string;
  description: string | null;
  recommendation: string | null;
  evidence_note: string | null;
  legal_basis_codes: string[];
  status: FindingStatus;
  /** Always false — auto-diagnosis never stores confirmed violations. */
  is_confirmed_violation: false;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyIndexScoreRow {
  id: string;
  survey_record_id: string;
  overall_score: number | null;
  data_score: number | null;
  tool_score: number | null;
  notice_score: number | null;
  management_score: number | null;
  personal_info_score: number | null;
  sensitive_info_score: number | null;
  high_risk_info_score: number | null;
  compliance_gap_score: number | null;
  overall_risk_level: OverallRiskLevel;
  score_version: string;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface CaptureJobRow {
  id: string;
  scan_job_id: string;
  survey_record_id: string | null;
  capture_mode: CaptureMode | null;
  capture_provider: CaptureProvider | null;
  status: CaptureJobStatus;
  completeness: CaptureCompleteness | null;
  path_scope: CapturePathScope | null;
  expected_page_count: number | null;
  captured_page_count: number;
  key_evidence_count: number;
  temporary_answers_used: boolean;
  final_submit_detected: boolean;
  final_submit_clicked: boolean;
  stop_reason: string | null;
  stop_page: number | null;
  limitations: string[];
  observed_at: string;
  observed_date_kst: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceFileRow {
  id: string;
  survey_record_id: string | null;
  capture_job_id: string | null;
  scan_job_id: string | null;
  evidence_type: EvidenceType;
  is_key_evidence: boolean;
  retention_level: RetentionLevel;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  page_number: number | null;
  captured_url: string | null;
  label: string | null;
  expires_at: string | null;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyOperatorMatchRow {
  id: string;
  survey_record_id: string;
  organization_id: string | null;
  matched_name: string;
  operator_name: string | null;
  public_private_type: PublicPrivateType | null;
  sector: string | null;
  industry: string | null;
  region: string | null;
  match_method: OperatorMatchMethod;
  confidence: ConfidenceLevel | null;
  evidence_text: string | null;
  evidence_source: string | null;
  is_primary: boolean;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewCaseRow {
  id: string;
  survey_record_id: string;
  scan_report_id: string | null;
  review_status: ReviewStatus;
  priority: ReviewPriority;
  overall_risk_level: OverallRiskLevel | null;
  title: string;
  summary: string | null;
  reviewer_note: string | null;
  resolution_note: string | null;
  outcome: ReviewOutcome | null;
  assigned_to: string | null;
  observed_at: string;
  observed_date_kst: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicationRecordRow {
  id: string;
  survey_record_id: string;
  scan_report_id: string | null;
  publish_status: PublicationStatus;
  title: string | null;
  summary: string | null;
  published_by: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  observed_at: string;
  observed_date_kst: string;
  created_at: string;
  updated_at: string;
}

/** Dashboard view rows */

export interface DashboardDailyOverviewRow {
  observed_date_kst: string;
  survey_count: number;
  personal_info_count: number;
  sensitive_info_count: number;
  high_risk_info_count: number;
  high_or_critical_count: number;
  review_open_count: number;
  published_count: number;
  avg_overall_score: number | null;
}

export interface DashboardPlatformStatsRow {
  observed_date_kst: string;
  platform: Platform;
  survey_count: number;
  personal_info_count: number;
  sensitive_info_count: number;
  high_risk_info_count: number;
  high_or_critical_count: number;
  avg_overall_score: number | null;
  avg_notice_score: number | null;
  avg_tool_score: number | null;
}

export interface DashboardIssueStatsRow {
  observed_date_kst: string;
  finding_type: FindingType;
  check_domain: CheckDomain | null;
  severity: FindingSeverity;
  status: FindingStatus;
  finding_count: number;
}

export interface DashboardRecentHighRiskRow {
  survey_record_id: string;
  observed_at: string;
  observed_date_kst: string;
  platform: Platform;
  operator_name: string | null;
  public_private_type: PublicPrivateType;
  sector: string | null;
  industry: string | null;
  region: string | null;
  survey_title: string | null;
  survey_url: string | null;
  url_host: string | null;
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  overall_risk_level: OverallRiskLevel;
  user_decision_label: string | null;
  review_status: ReviewStatus;
  publish_status: PublishStatus;
  overall_score: number | null;
  data_score: number | null;
  notice_score: number | null;
  tool_score: number | null;
  management_score: number | null;
  key_evidence_count: number;
}

export interface DashboardOrgRiskStatsRow {
  observed_date_kst: string;
  organization_id: string | null;
  operator_name: string;
  public_private_type: PublicPrivateType;
  sector: string | null;
  industry: string | null;
  region: string | null;
  survey_count: number;
  personal_info_count: number;
  sensitive_info_count: number;
  high_risk_info_count: number;
  high_or_critical_count: number;
  avg_overall_score: number | null;
  review_open_count: number;
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: Partial<OrganizationRow> &
          Pick<OrganizationRow, "name"> & {
            public_private_type?: PublicPrivateType;
          };
        Update: Partial<OrganizationRow>;
      };
      compliance_rules: {
        Row: ComplianceRuleRow;
        Insert: Partial<ComplianceRuleRow> &
          Pick<ComplianceRuleRow, "rule_code" | "label" | "check_domain">;
        Update: Partial<ComplianceRuleRow>;
      };
      scan_jobs: {
        Row: ScanJobRow;
        Insert: Partial<ScanJobRow> &
          Pick<ScanJobRow, "source_kind" | "observed_date_kst">;
        Update: Partial<ScanJobRow>;
      };
      scan_reports: {
        Row: ScanReportRow;
        Insert: Partial<ScanReportRow> &
          Pick<
            ScanReportRow,
            | "scan_job_id"
            | "user_decision_label"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<ScanReportRow>;
      };
      survey_records: {
        Row: SurveyRecordRow;
        Insert: Partial<SurveyRecordRow> &
          Pick<
            SurveyRecordRow,
            "scan_job_id" | "source_kind" | "observed_at" | "observed_date_kst"
          >;
        Update: Partial<SurveyRecordRow>;
      };
      survey_questions: {
        Row: SurveyQuestionRow;
        Insert: Partial<SurveyQuestionRow> &
          Pick<
            SurveyQuestionRow,
            | "survey_record_id"
            | "question_label"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<SurveyQuestionRow>;
      };
      question_data_categories: {
        Row: QuestionDataCategoryRow;
        Insert: Partial<QuestionDataCategoryRow> &
          Pick<
            QuestionDataCategoryRow,
            | "survey_question_id"
            | "category_code"
            | "category_label"
            | "risk_category"
          >;
        Update: Partial<QuestionDataCategoryRow>;
      };
      survey_compliance_checks: {
        Row: SurveyComplianceCheckRow;
        Insert: Partial<SurveyComplianceCheckRow> &
          Pick<
            SurveyComplianceCheckRow,
            | "survey_record_id"
            | "check_domain"
            | "check_item"
            | "status"
            | "status_label"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<SurveyComplianceCheckRow>;
      };
      survey_findings: {
        Row: SurveyFindingRow;
        Insert: Partial<SurveyFindingRow> &
          Pick<
            SurveyFindingRow,
            | "survey_record_id"
            | "finding_type"
            | "title"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<SurveyFindingRow>;
      };
      survey_index_scores: {
        Row: SurveyIndexScoreRow;
        Insert: Partial<SurveyIndexScoreRow> &
          Pick<
            SurveyIndexScoreRow,
            "survey_record_id" | "observed_at" | "observed_date_kst"
          >;
        Update: Partial<SurveyIndexScoreRow>;
      };
      capture_jobs: {
        Row: CaptureJobRow;
        Insert: Partial<CaptureJobRow> &
          Pick<CaptureJobRow, "scan_job_id" | "observed_at" | "observed_date_kst">;
        Update: Partial<CaptureJobRow>;
      };
      evidence_files: {
        Row: EvidenceFileRow;
        Insert: Partial<EvidenceFileRow> &
          Pick<
            EvidenceFileRow,
            | "evidence_type"
            | "storage_path"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<EvidenceFileRow>;
      };
      survey_operator_matches: {
        Row: SurveyOperatorMatchRow;
        Insert: Partial<SurveyOperatorMatchRow> &
          Pick<
            SurveyOperatorMatchRow,
            | "survey_record_id"
            | "matched_name"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<SurveyOperatorMatchRow>;
      };
      review_cases: {
        Row: ReviewCaseRow;
        Insert: Partial<ReviewCaseRow> &
          Pick<
            ReviewCaseRow,
            | "survey_record_id"
            | "title"
            | "observed_at"
            | "observed_date_kst"
          >;
        Update: Partial<ReviewCaseRow>;
      };
      publication_records: {
        Row: PublicationRecordRow;
        Insert: Partial<PublicationRecordRow> &
          Pick<
            PublicationRecordRow,
            "survey_record_id" | "observed_at" | "observed_date_kst"
          >;
        Update: Partial<PublicationRecordRow>;
      };
    };
    Views: {
      v_dashboard_daily_overview: { Row: DashboardDailyOverviewRow };
      v_dashboard_platform_stats: { Row: DashboardPlatformStatsRow };
      v_dashboard_issue_stats: { Row: DashboardIssueStatsRow };
      v_dashboard_recent_high_risk: { Row: DashboardRecentHighRiskRow };
      v_dashboard_org_risk_stats: { Row: DashboardOrgRiskStatsRow };
    };
  };
}
