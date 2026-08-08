-- =============================================================================
-- SURE Check — Per-query collection stats (006)
-- Stores search-query × source_type metrics for each collection_run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collection_query_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id uuid NOT NULL
    REFERENCES public.collection_runs (id) ON DELETE CASCADE,
  search_query text NOT NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('web', 'blog', 'cafe', 'unknown')),
  sort_mode text NOT NULL DEFAULT 'sim'
    CHECK (sort_mode IN ('sim', 'date')),
  results_count integer NOT NULL DEFAULT 0,
  unique_source_count integer NOT NULL DEFAULT 0,
  candidate_count integer NOT NULL DEFAULT 0,
  valid_survey_count integer NOT NULL DEFAULT 0,
  new_survey_count integer NOT NULL DEFAULT 0,
  duplicate_survey_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  unreachable_count integer NOT NULL DEFAULT 0,
  closed_count integer NOT NULL DEFAULT 0,
  restricted_count integer NOT NULL DEFAULT 0,
  skipped_known_source_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT collection_query_stats_run_query_source_key
    UNIQUE (collection_run_id, search_query, source_type)
);

CREATE INDEX IF NOT EXISTS collection_query_stats_run_id_idx
  ON public.collection_query_stats (collection_run_id);

CREATE INDEX IF NOT EXISTS collection_query_stats_new_survey_idx
  ON public.collection_query_stats (new_survey_count DESC);

CREATE INDEX IF NOT EXISTS collection_query_stats_search_query_idx
  ON public.collection_query_stats (search_query);

ALTER TABLE public.collection_query_stats ENABLE ROW LEVEL SECURITY;
