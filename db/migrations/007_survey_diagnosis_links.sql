-- =============================================================================
-- SURE Check — Collector ↔ Diagnosis linkage (007)
-- Links survey_links to existing scan_jobs / scan_reports without duplicating
-- diagnosis payloads. Does NOT change collector Cron or diagnosis rules.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.survey_diagnosis_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_link_id uuid NOT NULL
    REFERENCES public.survey_links (id) ON DELETE CASCADE,
  diagnosis_job_id text,
  report_id uuid,
  canonical_url text NOT NULL,
  scan_cache_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
  skip_reason text,
  diagnosis_version text NOT NULL DEFAULT 'sure-check-v1',
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.survey_diagnosis_links IS
  'Collector auto-diagnosis linkage to scan_jobs/scan_reports (no payload copy)';

-- One active/completed auto-diagnosis per survey link (skipped rows allowed).
CREATE UNIQUE INDEX IF NOT EXISTS survey_diagnosis_links_active_survey_uidx
  ON public.survey_diagnosis_links (survey_link_id)
  WHERE status IN ('queued', 'running', 'completed');

CREATE INDEX IF NOT EXISTS survey_diagnosis_links_status_idx
  ON public.survey_diagnosis_links (status);

CREATE INDEX IF NOT EXISTS survey_diagnosis_links_cache_key_idx
  ON public.survey_diagnosis_links (scan_cache_key);

CREATE INDEX IF NOT EXISTS survey_diagnosis_links_job_idx
  ON public.survey_diagnosis_links (diagnosis_job_id);

DROP TRIGGER IF EXISTS survey_diagnosis_links_set_updated_at
  ON public.survey_diagnosis_links;
CREATE TRIGGER survey_diagnosis_links_set_updated_at
  BEFORE UPDATE ON public.survey_diagnosis_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.survey_diagnosis_links ENABLE ROW LEVEL SECURITY;
