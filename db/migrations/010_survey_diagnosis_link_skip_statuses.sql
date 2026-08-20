-- =============================================================================
-- SURE Check — survey_diagnosis_links skip/timeout statuses (010)
-- Records closed/restricted/timeout outcomes so admin "today attempts" is visible.
-- Safe to re-run: drop CHECK, add statuses, rebuild partial unique index.
-- =============================================================================

ALTER TABLE public.survey_diagnosis_links
  DROP CONSTRAINT IF EXISTS survey_diagnosis_links_status_check;

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
      'skipped',
      'skipped_closed',
      'skipped_restricted',
      'timeout'
    )
  );

DROP INDEX IF EXISTS survey_diagnosis_links_active_survey_uidx;
CREATE UNIQUE INDEX survey_diagnosis_links_active_survey_uidx
  ON public.survey_diagnosis_links (survey_link_id)
  WHERE status IN (
    'queued',
    'running',
    'completed',
    'limited',
    'failed_final',
    'skipped_closed',
    'skipped_restricted'
  );
