-- =============================================================================
-- SURE Check — Survey link freshness (009)
-- Adds: stale status + freshness JSON (dates, reason, should_diagnose)
-- Safe CHECK replacement; preserves existing rows.
-- =============================================================================

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'survey_links'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.survey_links DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.survey_links
  ADD CONSTRAINT survey_links_status_check
  CHECK (status IN (
    'discovered',
    'active',
    'closed',
    'restricted',
    'stale',
    'unreachable',
    'invalid',
    'ignored'
  ));

ALTER TABLE public.survey_links
  ADD COLUMN IF NOT EXISTS freshness jsonb;

CREATE INDEX IF NOT EXISTS survey_links_freshness_should_diagnose_idx
  ON public.survey_links ((freshness->>'should_diagnose'))
  WHERE freshness IS NOT NULL;

COMMENT ON COLUMN public.survey_links.status IS
  'discovered|active|closed|restricted|stale|unreachable|invalid|ignored';
COMMENT ON COLUMN public.survey_links.freshness IS
  'Collector freshness metadata: dates, reason, should_diagnose';
