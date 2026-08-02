-- =============================================================================
-- SURE Check — Monitoring Dashboard Schema (001)
-- Purpose: operational + analytics tables for /report monitoring dashboard
--
-- Principles:
-- - Store automatic diagnosis as risk / deficiency / needs_review / improvement
--   guidance — NEVER as confirmed legal violations ("위반 확정" 금지).
-- - Do NOT store respondent-entered answers.
-- - Do NOT store original uploaded survey files.
-- - Do NOT store full capture image sets long-term; keep key-evidence screens only.
-- - Full evidence ZIP is temporary (retention_level + expires_at).
-- - Image/ZIP binaries live in Supabase Storage; DB stores paths/metadata only.
-- - RLS enabled on all tables; no public policies (service role only).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reference / catalog
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text,
  public_private_type text NOT NULL DEFAULT 'unknown'
    CHECK (public_private_type IN ('public', 'private', 'mixed', 'unknown')),
  sector text,
  industry text,
  region text,
  major_type text,
  middle_type text,
  aliases text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'public_institution_index', 'detected', 'user_confirmed')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX organizations_name_normalized_uidx
  ON public.organizations (name_normalized)
  WHERE name_normalized IS NOT NULL;

CREATE INDEX organizations_sector_region_idx
  ON public.organizations (sector, region);

CREATE INDEX organizations_public_private_type_idx
  ON public.organizations (public_private_type);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL UNIQUE,
  label text NOT NULL,
  short_title text,
  description text,
  check_domain text NOT NULL
    CHECK (check_domain IN (
      'notice',
      'consent',
      'retention',
      'destruction',
      'outsourcing',
      'overseas_transfer',
      'sensitive_data',
      'high_risk_data',
      'tool_governance',
      'management',
      'public_sector',
      'contact',
      'other'
    )),
  legal_basis_code text,
  severity_hint text NOT NULL DEFAULT 'needs_review'
    CHECK (severity_hint IN (
      'info',
      'improvement_recommended',
      'needs_review',
      'deficiency_suspected',
      'violation_risk'
    )),
  applies_to text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX compliance_rules_check_domain_idx
  ON public.compliance_rules (check_domain);

CREATE TRIGGER compliance_rules_set_updated_at
  BEFORE UPDATE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Scan job / report (operational)
-- ---------------------------------------------------------------------------

CREATE TABLE public.scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_scan_id text UNIQUE,
  source_kind text NOT NULL
    CHECK (source_kind IN ('url', 'file')),
  form_url text,
  file_name text,
  url_host text,
  form_url_hash text,
  survey_url_hash text,
  platform text NOT NULL DEFAULT 'unknown'
    CHECK (platform IN (
      'google_forms',
      'naver_form',
      'moaform',
      'generic',
      'wiseon_csap',
      'unknown'
    )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'idle',
      'pending',
      'running',
      'completed',
      'failed',
      'limited',
      'cancelled'
    )),
  current_step integer NOT NULL DEFAULT 0,
  total_steps integer NOT NULL DEFAULT 0,
  step_label text,
  error_message text,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT scan_jobs_no_original_file_blob CHECK (true)
);

CREATE INDEX scan_jobs_observed_date_kst_idx
  ON public.scan_jobs (observed_date_kst DESC);

CREATE INDEX scan_jobs_platform_status_idx
  ON public.scan_jobs (platform, status);

CREATE INDEX scan_jobs_source_kind_idx
  ON public.scan_jobs (source_kind);

CREATE INDEX scan_jobs_url_host_idx
  ON public.scan_jobs (url_host);

CREATE INDEX scan_jobs_form_url_hash_idx
  ON public.scan_jobs (form_url_hash);

CREATE INDEX scan_jobs_survey_url_hash_idx
  ON public.scan_jobs (survey_url_hash);

CREATE TRIGGER scan_jobs_set_updated_at
  BEFORE UPDATE ON public.scan_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.scan_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.scan_jobs (id) ON DELETE CASCADE,
  external_scan_id text,
  diagnosis_status text NOT NULL DEFAULT 'completed'
    CHECK (diagnosis_status IN ('completed', 'limited', 'blocked', 'failed')),
  confidence text
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low', 'none')),
  overall_risk_level text NOT NULL DEFAULT 'unknown'
    CHECK (overall_risk_level IN (
      'low',
      'medium',
      'high',
      'critical',
      'limited',
      'unknown'
    )),
  risk_grade text
    CHECK (risk_grade IS NULL OR risk_grade IN ('safe', 'caution', 'risk', 'high_risk')),
  score numeric(5, 2),
  safety_type_id text,
  user_decision_label text NOT NULL,
  internal_verdict text,
  summary text,
  -- Full diagnosis payload for re-analysis / verification / dashboard reprocessing
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_summary jsonb,
  disclaimer text NOT NULL DEFAULT
    '자동 진단 결과이며 법률 자문이 아닙니다. 위반 확정이 아닙니다.',
  limitation_reasons text[] NOT NULL DEFAULT '{}',
  has_personal_info boolean NOT NULL DEFAULT false,
  has_sensitive_info boolean NOT NULL DEFAULT false,
  has_high_risk_info boolean NOT NULL DEFAULT false,
  has_quasi_identifiers boolean NOT NULL DEFAULT false,
  publish_status text NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'internal', 'published', 'archived')),
  review_status text NOT NULL DEFAULT 'none'
    CHECK (review_status IN (
      'none',
      'pending',
      'in_review',
      'resolved',
      'dismissed'
    )),
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  generated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  generated_at_kst text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (scan_job_id)
);

CREATE INDEX scan_reports_observed_date_kst_idx
  ON public.scan_reports (observed_date_kst DESC);

CREATE INDEX scan_reports_overall_risk_level_idx
  ON public.scan_reports (overall_risk_level);

CREATE INDEX scan_reports_review_publish_idx
  ON public.scan_reports (review_status, publish_status);

CREATE INDEX scan_reports_flags_idx
  ON public.scan_reports (has_personal_info, has_sensitive_info, has_high_risk_info);

CREATE INDEX scan_reports_report_json_gin_idx
  ON public.scan_reports USING gin (report_json);

CREATE TRIGGER scan_reports_set_updated_at
  BEFORE UPDATE ON public.scan_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Survey entity (canonical monitored survey)
-- ---------------------------------------------------------------------------

CREATE TABLE public.survey_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.scan_jobs (id) ON DELETE CASCADE,
  scan_report_id uuid REFERENCES public.scan_reports (id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  survey_title text,
  survey_url text,
  final_url text,
  url_host text,
  form_url_hash text,
  survey_url_hash text,
  source_kind text NOT NULL
    CHECK (source_kind IN ('url', 'file')),
  platform text NOT NULL DEFAULT 'unknown'
    CHECK (platform IN (
      'google_forms',
      'naver_form',
      'moaform',
      'generic',
      'wiseon_csap',
      'unknown'
    )),
  tool_name text,
  operator_name text,
  public_private_type text NOT NULL DEFAULT 'unknown'
    CHECK (public_private_type IN ('public', 'private', 'mixed', 'unknown')),
  subject_type text
    CHECK (subject_type IS NULL OR subject_type IN (
      'public_agency',
      'private_company',
      'public_commissioned_private',
      'nonprofit',
      'school_local',
      'medical',
      'unknown'
    )),
  sector text,
  industry text,
  region text,
  overall_risk_level text NOT NULL DEFAULT 'unknown'
    CHECK (overall_risk_level IN (
      'low',
      'medium',
      'high',
      'critical',
      'limited',
      'unknown'
    )),
  user_decision_label text,
  safety_type_id text,
  has_personal_info boolean NOT NULL DEFAULT false,
  has_sensitive_info boolean NOT NULL DEFAULT false,
  has_high_risk_info boolean NOT NULL DEFAULT false,
  question_count integer NOT NULL DEFAULT 0,
  personal_info_question_count integer NOT NULL DEFAULT 0,
  sensitive_question_count integer NOT NULL DEFAULT 0,
  high_risk_question_count integer NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'none'
    CHECK (review_status IN (
      'none',
      'pending',
      'in_review',
      'resolved',
      'dismissed'
    )),
  publish_status text NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'internal', 'published', 'archived')),
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT survey_records_no_respondent_answers CHECK (true),
  CONSTRAINT survey_records_no_original_upload CHECK (true)
);

CREATE INDEX survey_records_observed_date_kst_idx
  ON public.survey_records (observed_date_kst DESC);

CREATE INDEX survey_records_platform_idx
  ON public.survey_records (platform);

CREATE INDEX survey_records_operator_name_idx
  ON public.survey_records (operator_name);

CREATE INDEX survey_records_org_idx
  ON public.survey_records (organization_id);

CREATE INDEX survey_records_url_host_idx
  ON public.survey_records (url_host);

CREATE INDEX survey_records_form_url_hash_idx
  ON public.survey_records (form_url_hash);

CREATE INDEX survey_records_survey_url_hash_idx
  ON public.survey_records (survey_url_hash);

CREATE INDEX survey_records_risk_flags_idx
  ON public.survey_records (
    overall_risk_level,
    has_personal_info,
    has_sensitive_info,
    has_high_risk_info
  );

CREATE INDEX survey_records_public_private_sector_idx
  ON public.survey_records (public_private_type, sector, region);

CREATE INDEX survey_records_review_publish_idx
  ON public.survey_records (review_status, publish_status);

CREATE TRIGGER survey_records_set_updated_at
  BEFORE UPDATE ON public.survey_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  question_key text,
  question_number text,
  page_number integer,
  question_label text NOT NULL,
  question_type text,
  is_required boolean,
  data_risk_level text
    CHECK (data_risk_level IS NULL OR data_risk_level IN ('D0', 'D1', 'D2', 'D3', 'D4', 'D5')),
  risk_tags text[] NOT NULL DEFAULT '{}',
  has_personal_info boolean NOT NULL DEFAULT false,
  has_sensitive_info boolean NOT NULL DEFAULT false,
  has_high_risk_info boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX survey_questions_survey_record_idx
  ON public.survey_questions (survey_record_id);

CREATE INDEX survey_questions_flags_idx
  ON public.survey_questions (
    has_personal_info,
    has_sensitive_info,
    has_high_risk_info
  );

CREATE TRIGGER survey_questions_set_updated_at
  BEFORE UPDATE ON public.survey_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.question_data_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_question_id uuid NOT NULL REFERENCES public.survey_questions (id) ON DELETE CASCADE,
  category_code text NOT NULL,
  category_label text NOT NULL,
  risk_category text NOT NULL
    CHECK (risk_category IN (
      'direct_identifier',
      'quasi_identifier',
      'sensitive_info',
      'high_risk_info',
      'general_opinion',
      'other'
    )),
  confidence text
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low', 'none')),
  matched_keyword text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (survey_question_id, category_code)
);

CREATE INDEX question_data_categories_risk_category_idx
  ON public.question_data_categories (risk_category);

CREATE INDEX question_data_categories_category_code_idx
  ON public.question_data_categories (category_code);

CREATE TRIGGER question_data_categories_set_updated_at
  BEFORE UPDATE ON public.question_data_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Compliance checks / findings / scores
-- ---------------------------------------------------------------------------

CREATE TABLE public.survey_compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  compliance_rule_id uuid REFERENCES public.compliance_rules (id) ON DELETE SET NULL,
  check_domain text NOT NULL
    CHECK (check_domain IN (
      'notice',
      'consent',
      'retention',
      'destruction',
      'outsourcing',
      'overseas_transfer',
      'sensitive_data',
      'high_risk_data',
      'tool_governance',
      'management',
      'public_sector',
      'contact',
      'other'
    )),
  check_item text NOT NULL,
  status text NOT NULL
    CHECK (status IN (
      'compliant',
      'insufficient',
      'missing',
      'needs_review',
      'not_applicable',
      'improvement_recommended'
    )),
  status_label text NOT NULL,
  evidence_note text,
  legal_basis_code text,
  -- Explicit: not a confirmed violation ("위반 확정" 금지)
  is_confirmed_violation boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT survey_compliance_checks_no_confirmed_violation
    CHECK (is_confirmed_violation = false)
);

CREATE INDEX survey_compliance_checks_survey_idx
  ON public.survey_compliance_checks (survey_record_id);

CREATE INDEX survey_compliance_checks_domain_status_idx
  ON public.survey_compliance_checks (check_domain, status);

CREATE INDEX survey_compliance_checks_observed_date_idx
  ON public.survey_compliance_checks (observed_date_kst DESC);

CREATE TRIGGER survey_compliance_checks_set_updated_at
  BEFORE UPDATE ON public.survey_compliance_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.survey_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  finding_type text NOT NULL
    CHECK (finding_type IN (
      'personal_info_risk',
      'sensitive_info_risk',
      'high_risk_info',
      'notice_gap',
      'consent_gap',
      'tool_governance',
      'management_gap',
      'operator_unclear',
      'overseas_transfer',
      'outsourcing',
      'public_sector_cloud',
      'limited_diagnosis',
      'other'
    )),
  check_domain text
    CHECK (check_domain IS NULL OR check_domain IN (
      'notice',
      'consent',
      'retention',
      'destruction',
      'outsourcing',
      'overseas_transfer',
      'sensitive_data',
      'high_risk_data',
      'tool_governance',
      'management',
      'public_sector',
      'contact',
      'other'
    )),
  severity text NOT NULL DEFAULT 'needs_review'
    CHECK (severity IN (
      'info',
      'improvement_recommended',
      'needs_review',
      'deficiency_suspected',
      'violation_risk'
    )),
  title text NOT NULL,
  description text,
  recommendation text,
  evidence_note text,
  legal_basis_codes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'mitigated', 'dismissed')),
  is_confirmed_violation boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT survey_findings_no_confirmed_violation
    CHECK (is_confirmed_violation = false)
);

CREATE INDEX survey_findings_survey_idx
  ON public.survey_findings (survey_record_id);

CREATE INDEX survey_findings_type_severity_idx
  ON public.survey_findings (finding_type, severity);

CREATE INDEX survey_findings_domain_idx
  ON public.survey_findings (check_domain);

CREATE INDEX survey_findings_observed_date_idx
  ON public.survey_findings (observed_date_kst DESC);

CREATE TRIGGER survey_findings_set_updated_at
  BEFORE UPDATE ON public.survey_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.survey_index_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  overall_score numeric(5, 2),
  data_score numeric(5, 2),
  tool_score numeric(5, 2),
  notice_score numeric(5, 2),
  management_score numeric(5, 2),
  personal_info_score numeric(5, 2),
  sensitive_info_score numeric(5, 2),
  high_risk_info_score numeric(5, 2),
  compliance_gap_score numeric(5, 2),
  overall_risk_level text NOT NULL DEFAULT 'unknown'
    CHECK (overall_risk_level IN (
      'low',
      'medium',
      'high',
      'critical',
      'limited',
      'unknown'
    )),
  score_version text NOT NULL DEFAULT '1.0',
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (survey_record_id, score_version)
);

CREATE INDEX survey_index_scores_observed_date_idx
  ON public.survey_index_scores (observed_date_kst DESC);

CREATE INDEX survey_index_scores_overall_risk_idx
  ON public.survey_index_scores (overall_risk_level);

CREATE TRIGGER survey_index_scores_set_updated_at
  BEFORE UPDATE ON public.survey_index_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Capture / evidence (Storage paths only; key evidence preferred)
-- ---------------------------------------------------------------------------

CREATE TABLE public.capture_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.scan_jobs (id) ON DELETE CASCADE,
  survey_record_id uuid REFERENCES public.survey_records (id) ON DELETE SET NULL,
  capture_mode text
    CHECK (capture_mode IS NULL OR capture_mode IN (
      'safe_public_only',
      'evidence_full_walkthrough'
    )),
  capture_provider text
    CHECK (capture_provider IS NULL OR capture_provider IN (
      'google_forms',
      'naver_form',
      'moaform',
      'generic',
      'wiseon_csap',
      'unknown'
    )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'running',
      'success',
      'partial',
      'failed',
      'timeout',
      'skipped'
    )),
  completeness text
    CHECK (completeness IS NULL OR completeness IN ('complete', 'partial', 'failed')),
  path_scope text
    CHECK (path_scope IS NULL OR path_scope IN (
      'traversed_path',
      'single_page',
      'partial_path',
      'unknown'
    )),
  expected_page_count integer,
  captured_page_count integer NOT NULL DEFAULT 0,
  key_evidence_count integer NOT NULL DEFAULT 0,
  temporary_answers_used boolean NOT NULL DEFAULT false,
  final_submit_detected boolean NOT NULL DEFAULT false,
  final_submit_clicked boolean NOT NULL DEFAULT false,
  stop_reason text,
  stop_page integer,
  limitations text[] NOT NULL DEFAULT '{}',
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX capture_jobs_scan_job_idx
  ON public.capture_jobs (scan_job_id);

CREATE INDEX capture_jobs_status_idx
  ON public.capture_jobs (status);

CREATE INDEX capture_jobs_observed_date_idx
  ON public.capture_jobs (observed_date_kst DESC);

CREATE TRIGGER capture_jobs_set_updated_at
  BEFORE UPDATE ON public.capture_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.evidence_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid REFERENCES public.survey_records (id) ON DELETE SET NULL,
  capture_job_id uuid REFERENCES public.capture_jobs (id) ON DELETE SET NULL,
  scan_job_id uuid REFERENCES public.scan_jobs (id) ON DELETE SET NULL,
  evidence_type text NOT NULL
    CHECK (evidence_type IN (
      'key_screenshot',
      'notice_screenshot',
      'pii_question_screenshot',
      'sensitive_question_screenshot',
      'high_risk_question_screenshot',
      'temporary_zip',
      'summary_document',
      'metadata'
    )),
  is_key_evidence boolean NOT NULL DEFAULT false,
  retention_level text NOT NULL DEFAULT 'temporary'
    CHECK (retention_level IN (
      'none',
      'temporary',
      'short_term',
      'key_evidence'
    )),
  storage_bucket text NOT NULL DEFAULT 'evidence-files',
  storage_path text NOT NULL,
  mime_type text,
  byte_size bigint,
  sha256 text,
  page_number integer,
  captured_url text,
  label text,
  expires_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT evidence_files_temporary_zip_expires
    CHECK (
      evidence_type <> 'temporary_zip'
      OR expires_at IS NOT NULL
    ),
  CONSTRAINT evidence_files_key_retention
    CHECK (
      is_key_evidence = false
      OR retention_level IN ('key_evidence', 'short_term')
    )
);

CREATE INDEX evidence_files_survey_idx
  ON public.evidence_files (survey_record_id);

CREATE INDEX evidence_files_capture_job_idx
  ON public.evidence_files (capture_job_id);

CREATE INDEX evidence_files_type_key_idx
  ON public.evidence_files (evidence_type, is_key_evidence);

CREATE INDEX evidence_files_retention_expires_idx
  ON public.evidence_files (retention_level, expires_at);

CREATE INDEX evidence_files_storage_path_idx
  ON public.evidence_files (storage_bucket, storage_path);

CREATE TRIGGER evidence_files_set_updated_at
  BEFORE UPDATE ON public.evidence_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Organization matching / review / publication
-- ---------------------------------------------------------------------------

CREATE TABLE public.survey_operator_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  matched_name text NOT NULL,
  operator_name text,
  public_private_type text
    CHECK (public_private_type IS NULL OR public_private_type IN (
      'public', 'private', 'mixed', 'unknown'
    )),
  sector text,
  industry text,
  region text,
  match_method text NOT NULL DEFAULT 'none'
    CHECK (match_method IN (
      'exact_list',
      'alias',
      'keyword_fallback',
      'manual',
      'none'
    )),
  confidence text
    CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low', 'none')),
  evidence_text text,
  evidence_source text,
  is_primary boolean NOT NULL DEFAULT true,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX survey_operator_matches_survey_idx
  ON public.survey_operator_matches (survey_record_id);

CREATE INDEX survey_operator_matches_org_idx
  ON public.survey_operator_matches (organization_id);

CREATE INDEX survey_operator_matches_method_idx
  ON public.survey_operator_matches (match_method, confidence);

CREATE TRIGGER survey_operator_matches_set_updated_at
  BEFORE UPDATE ON public.survey_operator_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.review_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  scan_report_id uuid REFERENCES public.scan_reports (id) ON DELETE SET NULL,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN (
      'none',
      'pending',
      'in_review',
      'resolved',
      'dismissed'
    )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  overall_risk_level text
    CHECK (overall_risk_level IS NULL OR overall_risk_level IN (
      'low', 'medium', 'high', 'critical', 'limited', 'unknown'
    )),
  title text NOT NULL,
  summary text,
  reviewer_note text,
  resolution_note text,
  outcome text
    CHECK (outcome IS NULL OR outcome IN (
      'needs_more_info',
      'improvement_recommended',
      'deficiency_suspected',
      'violation_risk',
      'no_action',
      'dismissed'
    )),
  assigned_to text,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  opened_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX review_cases_survey_idx
  ON public.review_cases (survey_record_id);

CREATE INDEX review_cases_status_priority_idx
  ON public.review_cases (review_status, priority);

CREATE INDEX review_cases_observed_date_idx
  ON public.review_cases (observed_date_kst DESC);

CREATE TRIGGER review_cases_set_updated_at
  BEFORE UPDATE ON public.review_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.publication_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_record_id uuid NOT NULL REFERENCES public.survey_records (id) ON DELETE CASCADE,
  scan_report_id uuid REFERENCES public.scan_reports (id) ON DELETE SET NULL,
  -- Public disclosure policy (named org vs anonymized vs aggregate)
  publish_status text NOT NULL DEFAULT 'private'
    CHECK (publish_status IN (
      'private',
      'aggregate_only',
      'public_anonymized',
      'public_named',
      'archived'
    )),
  title text,
  summary text,
  published_by text,
  published_at timestamptz,
  unpublished_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  observed_date_kst date NOT NULL
    DEFAULT ((timezone('Asia/Seoul', now()))::date),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX publication_records_survey_idx
  ON public.publication_records (survey_record_id);

CREATE INDEX publication_records_status_idx
  ON public.publication_records (publish_status);

CREATE INDEX publication_records_observed_date_idx
  ON public.publication_records (observed_date_kst DESC);

CREATE TRIGGER publication_records_set_updated_at
  BEFORE UPDATE ON public.publication_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (no anon/public policies — service role only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_data_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_index_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_operator_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_records ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Dashboard views (/report monitoring)
-- security_invoker: underlying table RLS applies as the querying role.
-- No anon/authenticated grants — /report reads via service role API later.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_dashboard_daily_overview
WITH (security_invoker = true)
AS
SELECT
  sr.observed_date_kst,
  count(*)::integer AS survey_count,
  count(*) FILTER (WHERE sr.has_personal_info)::integer AS personal_info_count,
  count(*) FILTER (WHERE sr.has_sensitive_info)::integer AS sensitive_info_count,
  count(*) FILTER (WHERE sr.has_high_risk_info)::integer AS high_risk_info_count,
  count(*) FILTER (
    WHERE sr.overall_risk_level IN ('high', 'critical')
  )::integer AS high_or_critical_count,
  count(*) FILTER (WHERE sr.review_status IN ('pending', 'in_review'))::integer
    AS review_open_count,
  count(*) FILTER (WHERE sr.publish_status = 'published')::integer
    AS published_count,
  round(avg(sis.overall_score)::numeric, 2) AS avg_overall_score
FROM public.survey_records sr
LEFT JOIN public.survey_index_scores sis
  ON sis.survey_record_id = sr.id
GROUP BY sr.observed_date_kst;

CREATE OR REPLACE VIEW public.v_dashboard_platform_stats
WITH (security_invoker = true)
AS
SELECT
  sr.observed_date_kst,
  sr.platform,
  count(*)::integer AS survey_count,
  count(*) FILTER (WHERE sr.has_personal_info)::integer AS personal_info_count,
  count(*) FILTER (WHERE sr.has_sensitive_info)::integer AS sensitive_info_count,
  count(*) FILTER (WHERE sr.has_high_risk_info)::integer AS high_risk_info_count,
  count(*) FILTER (
    WHERE sr.overall_risk_level IN ('high', 'critical')
  )::integer AS high_or_critical_count,
  round(avg(sis.overall_score)::numeric, 2) AS avg_overall_score,
  round(avg(sis.notice_score)::numeric, 2) AS avg_notice_score,
  round(avg(sis.tool_score)::numeric, 2) AS avg_tool_score
FROM public.survey_records sr
LEFT JOIN public.survey_index_scores sis
  ON sis.survey_record_id = sr.id
GROUP BY sr.observed_date_kst, sr.platform;

CREATE OR REPLACE VIEW public.v_dashboard_issue_stats
WITH (security_invoker = true)
AS
SELECT
  sf.observed_date_kst,
  sf.finding_type,
  sf.check_domain,
  sf.severity,
  sf.status,
  count(*)::integer AS finding_count
FROM public.survey_findings sf
GROUP BY
  sf.observed_date_kst,
  sf.finding_type,
  sf.check_domain,
  sf.severity,
  sf.status;

CREATE OR REPLACE VIEW public.v_dashboard_recent_high_risk
WITH (security_invoker = true)
AS
SELECT
  sr.id AS survey_record_id,
  sr.observed_at,
  sr.observed_date_kst,
  sr.platform,
  sr.operator_name,
  sr.public_private_type,
  sr.sector,
  sr.industry,
  sr.region,
  sr.survey_title,
  sr.survey_url,
  sr.url_host,
  sr.has_personal_info,
  sr.has_sensitive_info,
  sr.has_high_risk_info,
  sr.overall_risk_level,
  sr.user_decision_label,
  sr.review_status,
  sr.publish_status,
  sis.overall_score,
  sis.data_score,
  sis.notice_score,
  sis.tool_score,
  sis.management_score,
  (
    SELECT count(*)::integer
    FROM public.evidence_files ef
    WHERE ef.survey_record_id = sr.id
      AND ef.is_key_evidence = true
  ) AS key_evidence_count
FROM public.survey_records sr
LEFT JOIN public.survey_index_scores sis
  ON sis.survey_record_id = sr.id
WHERE sr.overall_risk_level IN ('high', 'critical')
   OR sr.has_high_risk_info = true
   OR sr.has_sensitive_info = true;

CREATE OR REPLACE VIEW public.v_dashboard_org_risk_stats
WITH (security_invoker = true)
AS
SELECT
  sr.observed_date_kst,
  coalesce(o.id, sr.organization_id) AS organization_id,
  coalesce(o.name, sr.operator_name, '확인 불가') AS operator_name,
  coalesce(o.public_private_type, sr.public_private_type, 'unknown')
    AS public_private_type,
  coalesce(o.sector, sr.sector) AS sector,
  coalesce(o.industry, sr.industry) AS industry,
  coalesce(o.region, sr.region) AS region,
  count(*)::integer AS survey_count,
  count(*) FILTER (WHERE sr.has_personal_info)::integer AS personal_info_count,
  count(*) FILTER (WHERE sr.has_sensitive_info)::integer AS sensitive_info_count,
  count(*) FILTER (WHERE sr.has_high_risk_info)::integer AS high_risk_info_count,
  count(*) FILTER (
    WHERE sr.overall_risk_level IN ('high', 'critical')
  )::integer AS high_or_critical_count,
  round(avg(sis.overall_score)::numeric, 2) AS avg_overall_score,
  count(*) FILTER (WHERE sr.review_status IN ('pending', 'in_review'))::integer
    AS review_open_count
FROM public.survey_records sr
LEFT JOIN public.organizations o
  ON o.id = sr.organization_id
LEFT JOIN public.survey_index_scores sis
  ON sis.survey_record_id = sr.id
GROUP BY
  sr.observed_date_kst,
  coalesce(o.id, sr.organization_id),
  coalesce(o.name, sr.operator_name, '확인 불가'),
  coalesce(o.public_private_type, sr.public_private_type, 'unknown'),
  coalesce(o.sector, sr.sector),
  coalesce(o.industry, sr.industry),
  coalesce(o.region, sr.region);

REVOKE ALL ON public.v_dashboard_daily_overview FROM anon, authenticated;
REVOKE ALL ON public.v_dashboard_platform_stats FROM anon, authenticated;
REVOKE ALL ON public.v_dashboard_issue_stats FROM anon, authenticated;
REVOKE ALL ON public.v_dashboard_recent_high_risk FROM anon, authenticated;
REVOKE ALL ON public.v_dashboard_org_risk_stats FROM anon, authenticated;

-- Seed a minimal compliance rule catalog (optional baseline; no app wiring)
INSERT INTO public.compliance_rules (
  rule_code, label, short_title, check_domain, legal_basis_code, severity_hint, sort_order
) VALUES
  ('NOTICE_PURPOSE', '수집 목적', '수집 목적', 'notice', 'PIPA_ART_15', 'needs_review', 10),
  ('NOTICE_ITEMS', '수집 항목', '수집 항목', 'notice', 'PIPA_ART_15', 'needs_review', 20),
  ('NOTICE_RETENTION', '보유기간', '보유기간', 'retention', 'PIPA_ART_15', 'needs_review', 30),
  ('NOTICE_DESTRUCTION', '파기 기준', '파기', 'destruction', 'PIPA_ART_21', 'needs_review', 40),
  ('NOTICE_REFUSAL', '동의 거부권 및 불이익', '거부권', 'consent', 'PIPA_ART_15', 'needs_review', 50),
  ('NOTICE_CONTACT', '담당부서/문의처', '문의처', 'contact', 'PIPA_ART_15', 'improvement_recommended', 60),
  ('NOTICE_OUTSOURCING', '위탁/외부도구 처리 기준', '위탁', 'outsourcing', 'PIPA_ART_26', 'needs_review', 70),
  ('NOTICE_OVERSEAS', '국외 이전 안내', '국외이전', 'overseas_transfer', 'PIPA_ART_28_8', 'needs_review', 80),
  ('TOOL_PUBLIC_CSAP', '공공부문 클라우드 보안(CSAP) 확인', 'CSAP', 'public_sector', 'CSAP_PUBLIC_CLOUD', 'violation_risk', 90),
  ('DATA_SENSITIVE', '민감정보 수집 관련 확인', '민감정보', 'sensitive_data', 'PIPA_ART_23', 'violation_risk', 100),
  ('DATA_HIGH_RISK', '고유식별·금융 등 고위험정보 확인', '고위험정보', 'high_risk_data', 'PIPA_ART_24', 'violation_risk', 110)
ON CONFLICT (rule_code) DO NOTHING;

COMMENT ON TABLE public.survey_records IS
  'Monitored survey snapshot. No respondent answers. No original upload binaries.';
COMMENT ON TABLE public.evidence_files IS
  'Storage path metadata only. Prefer is_key_evidence=true; temporary_zip must expire.';
COMMENT ON TABLE public.survey_findings IS
  'Automatic findings as risk/deficiency/needs_review — never confirmed violations.';
COMMENT ON TABLE public.scan_reports IS
  'Includes report_json (full diagnosis) and report_summary for re-analysis.';
COMMENT ON COLUMN public.survey_compliance_checks.is_confirmed_violation IS
  'Always false. Schema forbids storing confirmed legal violations from auto-diagnosis.';
COMMENT ON COLUMN public.survey_compliance_checks.status IS
  'compliant|insufficient|missing|needs_review|not_applicable|improvement_recommended — never confirmed violation.';
COMMENT ON COLUMN public.publication_records.publish_status IS
  'private|aggregate_only|public_anonymized|public_named|archived';
