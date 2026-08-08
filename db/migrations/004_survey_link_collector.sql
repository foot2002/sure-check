-- =============================================================================
-- SURE Check — Public Survey Link Collector (004)
-- Purpose: store discovered public survey URLs + discovery sources + run stats
-- Does NOT connect to diagnosis / scan_jobs pipeline.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- survey_links: unique public survey forms discovered via search
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.survey_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL,
  original_url text NOT NULL,
  platform text NOT NULL
    CHECK (platform IN ('google_forms', 'naver_form', 'moaform')),
  title text,
  status text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'active', 'ignored', 'invalid')),
  first_discovered_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_discovered_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  discovery_count integer NOT NULL DEFAULT 1
    CHECK (discovery_count >= 1),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT survey_links_canonical_url_key UNIQUE (canonical_url)
);

CREATE INDEX IF NOT EXISTS survey_links_platform_idx
  ON public.survey_links (platform);

CREATE INDEX IF NOT EXISTS survey_links_last_discovered_at_idx
  ON public.survey_links (last_discovered_at DESC);

CREATE INDEX IF NOT EXISTS survey_links_first_discovered_at_idx
  ON public.survey_links (first_discovered_at DESC);

CREATE INDEX IF NOT EXISTS survey_links_status_idx
  ON public.survey_links (status);

DROP TRIGGER IF EXISTS survey_links_set_updated_at ON public.survey_links;
CREATE TRIGGER survey_links_set_updated_at
  BEFORE UPDATE ON public.survey_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- survey_sources: posts / search hits that introduced a survey_link
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.survey_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_link_id uuid NOT NULL
    REFERENCES public.survey_links (id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'unknown'
    CHECK (source_type IN ('web', 'blog', 'cafe', 'unknown')),
  source_url text NOT NULL,
  source_title text,
  search_query text,
  source_published_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT survey_sources_link_url_key UNIQUE (survey_link_id, source_url)
);

CREATE INDEX IF NOT EXISTS survey_sources_search_query_idx
  ON public.survey_sources (search_query);

CREATE INDEX IF NOT EXISTS survey_sources_discovered_at_idx
  ON public.survey_sources (discovered_at DESC);

CREATE INDEX IF NOT EXISTS survey_sources_source_type_idx
  ON public.survey_sources (source_type);

CREATE INDEX IF NOT EXISTS survey_sources_survey_link_id_idx
  ON public.survey_sources (survey_link_id);

-- ---------------------------------------------------------------------------
-- collection_runs: one row per collection execution (admin or cron)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'admin'
    CHECK (trigger IN ('admin', 'cron')),
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  queries_count integer NOT NULL DEFAULT 0,
  results_count integer NOT NULL DEFAULT 0,
  candidate_links_count integer NOT NULL DEFAULT 0,
  new_surveys_count integer NOT NULL DEFAULT 0,
  duplicate_surveys_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Only one collection run may be in "running" status at a time.
CREATE UNIQUE INDEX IF NOT EXISTS collection_runs_one_running_idx
  ON public.collection_runs ((true))
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS collection_runs_started_at_idx
  ON public.collection_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS collection_runs_status_idx
  ON public.collection_runs (status);

DROP TRIGGER IF EXISTS collection_runs_set_updated_at ON public.collection_runs;
CREATE TRIGGER collection_runs_set_updated_at
  BEFORE UPDATE ON public.collection_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: service-role only (no public policies)
-- ---------------------------------------------------------------------------

ALTER TABLE public.survey_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;
