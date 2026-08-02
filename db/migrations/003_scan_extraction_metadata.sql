-- ---------------------------------------------------------------------------
-- Accuracy & performance metadata for scan_jobs (Phase: speed + accuracy)
-- ---------------------------------------------------------------------------

ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS is_cached_reuse boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extraction_mode text,
  ADD COLUMN IF NOT EXISTS browser_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS browser_reason text,
  ADD COLUMN IF NOT EXISTS fast_extractor_confidence text,
  ADD COLUMN IF NOT EXISTS fallback_triggered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS total_duration_ms integer,
  ADD COLUMN IF NOT EXISTS extract_duration_ms integer,
  ADD COLUMN IF NOT EXISTS analysis_duration_ms integer,
  ADD COLUMN IF NOT EXISTS save_duration_ms integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scan_job_steps'
      AND column_name = 'meta_json'
  ) THEN
    ALTER TABLE public.scan_job_steps ADD COLUMN meta_json jsonb;
  END IF;
END $$;
