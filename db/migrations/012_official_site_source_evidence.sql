-- Official-site source-page evidence + seed review status.
-- Safe to re-run. Does not change public /report payloads.

-- ---------------------------------------------------------------------------
-- survey_sources: discovery-page evidence (not the institution homepage)
-- ---------------------------------------------------------------------------

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_page_url text;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_page_title text;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_anchor_text text;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_context_excerpt text;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_organization_name text;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_institution_homepage text;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_posted_date date;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_period_start date;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_period_end date;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_deadline date;

ALTER TABLE public.survey_sources
  ADD COLUMN IF NOT EXISTS source_date_text text;

CREATE INDEX IF NOT EXISTS survey_sources_source_page_url_idx
  ON public.survey_sources (source_page_url);

CREATE INDEX IF NOT EXISTS survey_sources_org_name_idx
  ON public.survey_sources (source_organization_name);

COMMENT ON COLUMN public.survey_sources.source_page_url IS
  'Official-site page where the survey link was found. Homepage only if found there.';
COMMENT ON COLUMN public.survey_sources.source_institution_homepage IS
  'Institution homepage (not used as freshness evidence).';

-- ---------------------------------------------------------------------------
-- official_institution_sites: seed quality review
-- ---------------------------------------------------------------------------

ALTER TABLE public.official_institution_sites
  ADD COLUMN IF NOT EXISTS seed_review_status text NOT NULL DEFAULT 'ok';

ALTER TABLE public.official_institution_sites
  ADD COLUMN IF NOT EXISTS seed_review_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'official_institution_sites_seed_review_status_check'
  ) THEN
    ALTER TABLE public.official_institution_sites
      ADD CONSTRAINT official_institution_sites_seed_review_status_check
      CHECK (seed_review_status IN ('ok', 'needs_review'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS official_institution_sites_seed_review_idx
  ON public.official_institution_sites (seed_review_status);

COMMENT ON COLUMN public.official_institution_sites.seed_review_status IS
  'ok | needs_review — domain mismatch / invalid homepage seeds skip auto-crawl.';

ALTER TABLE public.official_institution_sites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.survey_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_links ENABLE ROW LEVEL SECURITY;
