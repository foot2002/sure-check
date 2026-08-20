-- Official institution site crawl targets + source type for official-site discovery.
-- Safe to re-run. Does not change public /report payloads.

ALTER TABLE public.survey_sources
  DROP CONSTRAINT IF EXISTS survey_sources_source_type_check;

ALTER TABLE public.survey_sources
  ADD CONSTRAINT survey_sources_source_type_check
  CHECK (source_type IN ('web', 'blog', 'cafe', 'unknown', 'official_site'));

CREATE TABLE IF NOT EXISTS public.official_institution_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text NOT NULL UNIQUE,
  organization_name text NOT NULL,
  organization_type text NOT NULL DEFAULT '공공기관',
  homepage_url text NOT NULL,
  seed_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'wiseon_public_institution_list',
  crawl_priority text NOT NULL DEFAULT 'C'
    CHECK (crawl_priority IN ('A', 'B', 'C')),
  crawl_interval_days integer NOT NULL DEFAULT 7
    CHECK (crawl_interval_days >= 1 AND crawl_interval_days <= 30),
  last_crawled_at timestamptz,
  next_crawl_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_survey_found_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  crawl_status text NOT NULL DEFAULT 'idle'
    CHECK (crawl_status IN ('idle', 'running', 'ok', 'failed')),
  last_error text,
  last_pages_fetched integer NOT NULL DEFAULT 0,
  last_surveys_found integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS official_institution_sites_next_crawl_idx
  ON public.official_institution_sites (next_crawl_at, crawl_priority);

CREATE INDEX IF NOT EXISTS official_institution_sites_status_idx
  ON public.official_institution_sites (crawl_status);

CREATE INDEX IF NOT EXISTS official_institution_sites_last_crawled_idx
  ON public.official_institution_sites (last_crawled_at DESC);

DROP TRIGGER IF EXISTS official_institution_sites_set_updated_at
  ON public.official_institution_sites;
CREATE TRIGGER official_institution_sites_set_updated_at
  BEFORE UPDATE ON public.official_institution_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.official_institution_sites IS
  'Public-institution official site crawl roster. No contact PII.';
