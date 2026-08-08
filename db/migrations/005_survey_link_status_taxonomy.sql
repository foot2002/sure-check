-- =============================================================================
-- SURE Check — Survey link status taxonomy expansion (005)
-- Adds: closed, restricted, unreachable
-- Safe CHECK constraint replacement; preserves existing rows.
-- =============================================================================

-- 1) Drop old status CHECK (name may vary; recreate by constraint scan)
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

-- 2) Expand allowed statuses
ALTER TABLE public.survey_links
  ADD CONSTRAINT survey_links_status_check
  CHECK (status IN (
    'discovered',
    'active',
    'closed',
    'restricted',
    'unreachable',
    'invalid',
    'ignored'
  ));

-- 3) Reclassify known closed Google Forms that were marked invalid
UPDATE public.survey_links
SET status = 'closed',
    updated_at = timezone('utc', now())
WHERE status = 'invalid'
  AND (
    canonical_url ILIKE '%/closedform%'
    OR original_url ILIKE '%/closedform%'
  );

-- Keep help/api/answer root as invalid (no change needed).

COMMENT ON COLUMN public.survey_links.status IS
  'discovered|active|closed|restricted|unreachable|invalid|ignored';
