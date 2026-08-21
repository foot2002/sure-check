-- Public diagnosis cases (/cases).
-- Extends publication_records without changing 개선안내 publish_status values.
-- Safe to re-run. Public /report aggregate payloads are unchanged.

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_id text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_case_status text NOT NULL DEFAULT 'private';

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_display_name text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_survey_title text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_summary text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_problem_summary text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_improvement_summary text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS url_visibility text NOT NULL DEFAULT 'domain_only';

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_survey_url text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_url_host text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS selected_evidence_file_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_risk_level text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_score numeric;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_platform text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_private_type text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_data_summary text;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_notice_gaps text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_issue_badges text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_case_published_at timestamptz;

ALTER TABLE public.publication_records
  ADD COLUMN IF NOT EXISTS public_case_published_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_records_public_id_key'
  ) THEN
    ALTER TABLE public.publication_records
      ADD CONSTRAINT publication_records_public_id_key UNIQUE (public_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_records_public_case_status_check'
  ) THEN
    ALTER TABLE public.publication_records
      ADD CONSTRAINT publication_records_public_case_status_check
      CHECK (public_case_status IN (
        'private',
        'reviewing',
        'published',
        'paused',
        'archived'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'publication_records_url_visibility_check'
  ) THEN
    ALTER TABLE public.publication_records
      ADD CONSTRAINT publication_records_url_visibility_check
      CHECK (url_visibility IN ('full', 'hidden', 'domain_only'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS publication_records_public_id_uidx
  ON public.publication_records (public_id)
  WHERE public_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS publication_records_public_case_status_idx
  ON public.publication_records (public_case_status);

CREATE INDEX IF NOT EXISTS publication_records_public_case_published_at_idx
  ON public.publication_records (public_case_published_at DESC NULLS LAST);

COMMENT ON COLUMN public.publication_records.publish_status IS
  'Outreach / 개선안내 disclosure policy (private, aggregate_only, public_anonymized, public_named, archived). Distinct from public_case_status.';

COMMENT ON COLUMN public.publication_records.public_case_status IS
  'Public diagnosis case status: private (미등록), reviewing (공개검토), published (공개중), paused (공개중지), archived (보관). Only published + public_id is listed on /cases.';

COMMENT ON COLUMN public.publication_records.public_id IS
  'Stable public slug, e.g. case-20260821-001. Exposed on /cases/[publicId].';
