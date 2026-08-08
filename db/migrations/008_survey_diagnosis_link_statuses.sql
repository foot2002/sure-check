-- =============================================================================
-- SURE Check — survey_diagnosis_links status taxonomy (008)
-- Separates limited / failed_retryable / failed_final from legacy "failed".
-- Does NOT alter scan_jobs semantics or diagnosis rules.
--
-- Safe to re-run after a failed attempt: remap data BEFORE adding the new CHECK.
-- =============================================================================

ALTER TABLE public.survey_diagnosis_links
  ADD COLUMN IF NOT EXISTS extractor_key text;

COMMENT ON COLUMN public.survey_diagnosis_links.extractor_key IS
  'Extractor used for the linked scan (e.g. NaverFormsExtractor); linkage metadata only';

-- 1) Drop legacy CHECK so 'failed' rows can be remapped
ALTER TABLE public.survey_diagnosis_links
  DROP CONSTRAINT IF EXISTS survey_diagnosis_links_status_check;

-- 2) Remap legacy failed rows from scan_jobs when possible
UPDATE public.survey_diagnosis_links AS sdl
SET
  status = CASE
    WHEN sj.status = 'limited' THEN 'limited'
    WHEN sj.status = 'cancelled' THEN 'failed_final'
    WHEN sj.status = 'failed' THEN 'failed_retryable'
    ELSE 'failed_retryable'
  END,
  last_error = COALESCE(sdl.last_error, sj.error_message),
  updated_at = timezone('utc', now())
FROM public.scan_jobs AS sj
WHERE sdl.status = 'failed'
  AND sdl.diagnosis_job_id IS NOT NULL
  AND sj.external_scan_id = sdl.diagnosis_job_id;

-- Any remaining legacy 'failed' (no matching job) → retryable
UPDATE public.survey_diagnosis_links
SET
  status = 'failed_retryable',
  updated_at = timezone('utc', now())
WHERE status = 'failed';

-- 3) Only now enforce the new status set (no legacy 'failed' rows remain)
ALTER TABLE public.survey_diagnosis_links
  ADD CONSTRAINT survey_diagnosis_links_status_check
  CHECK (
    status IN (
      'queued',
      'running',
      'completed',
      'limited',
      'failed_retryable',
      'failed_final',
      'skipped'
    )
  );

-- Attach report_id for limited/completed rows missing it
UPDATE public.survey_diagnosis_links AS sdl
SET
  report_id = sr.id,
  updated_at = timezone('utc', now())
FROM public.scan_jobs AS sj
JOIN LATERAL (
  SELECT id
  FROM public.scan_reports
  WHERE scan_job_id = sj.id
  ORDER BY created_at DESC
  LIMIT 1
) AS sr ON true
WHERE sdl.diagnosis_job_id = sj.external_scan_id
  AND sdl.report_id IS NULL
  AND sdl.status IN ('limited', 'completed');

-- Active linkage uniqueness: block re-enqueue for terminal non-retry states
DROP INDEX IF EXISTS survey_diagnosis_links_active_survey_uidx;
CREATE UNIQUE INDEX survey_diagnosis_links_active_survey_uidx
  ON public.survey_diagnosis_links (survey_link_id)
  WHERE status IN (
    'queued',
    'running',
    'completed',
    'limited',
    'failed_final'
  );
