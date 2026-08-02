-- ---------------------------------------------------------------------------
-- Performance & Concurrency Phase 1: scan/capture job queue columns + steps
-- ---------------------------------------------------------------------------

ALTER TABLE public.scan_jobs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS cache_key text,
  ADD COLUMN IF NOT EXISTS monitoring_saved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_stored boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS scan_jobs_queue_claim_idx
  ON public.scan_jobs (status, priority ASC, queued_at ASC NULLS LAST, created_at ASC);

CREATE INDEX IF NOT EXISTS scan_jobs_cache_key_idx
  ON public.scan_jobs (cache_key, status, completed_at DESC);

CREATE INDEX IF NOT EXISTS scan_jobs_locked_at_idx
  ON public.scan_jobs (status, locked_at);

ALTER TABLE public.capture_jobs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS external_capture_id text,
  ADD COLUMN IF NOT EXISTS survey_url text,
  ADD COLUMN IF NOT EXISTS final_url text,
  ADD COLUMN IF NOT EXISTS diagnosis_external_id text,
  ADD COLUMN IF NOT EXISTS result_json jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE UNIQUE INDEX IF NOT EXISTS capture_jobs_external_capture_id_uidx
  ON public.capture_jobs (external_capture_id)
  WHERE external_capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS capture_jobs_queue_claim_idx
  ON public.capture_jobs (status, priority ASC, queued_at ASC NULLS LAST, created_at ASC);

CREATE TABLE IF NOT EXISTS public.scan_job_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid NOT NULL REFERENCES public.scan_jobs (id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS scan_job_steps_job_idx
  ON public.scan_job_steps (scan_job_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.claim_next_scan_job(
  p_worker_id text,
  p_max_running integer DEFAULT 3,
  p_stale_seconds integer DEFAULT 120
)
RETURNS SETOF public.scan_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  running_count integer;
  claimed public.scan_jobs;
BEGIN
  UPDATE public.scan_jobs
  SET
    status = 'failed',
    error_message = COALESCE(error_message, '작업 시간 초과로 중단되었습니다.'),
    locked_at = NULL,
    locked_by = NULL,
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE status = 'running'
    AND locked_at IS NOT NULL
    AND locked_at < timezone('utc', now()) - make_interval(secs => GREATEST(p_stale_seconds, 30));

  SELECT COUNT(*) INTO running_count
  FROM public.scan_jobs
  WHERE status = 'running';

  IF running_count >= GREATEST(p_max_running, 1) THEN
    RETURN;
  END IF;

  UPDATE public.scan_jobs AS j
  SET
    status = 'running',
    locked_at = timezone('utc', now()),
    locked_by = p_worker_id,
    last_heartbeat_at = timezone('utc', now()),
    started_at = COALESCE(j.started_at, timezone('utc', now())),
    attempt_count = COALESCE(j.attempt_count, 0) + 1,
    step_label = COALESCE(j.step_label, '설문 접속 중'),
    updated_at = timezone('utc', now())
  WHERE j.id = (
    SELECT s.id
    FROM public.scan_jobs AS s
    WHERE s.status = 'pending'
      AND (s.locked_at IS NULL OR s.locked_at < timezone('utc', now()) - make_interval(secs => GREATEST(p_stale_seconds, 30)))
    ORDER BY s.priority ASC, s.queued_at ASC NULLS LAST, s.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO claimed;

  IF claimed.id IS NOT NULL THEN
    RETURN NEXT claimed;
  END IF;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_scan_job_by_external_id(
  p_external_scan_id text,
  p_worker_id text,
  p_max_running integer DEFAULT 3,
  p_stale_seconds integer DEFAULT 120
)
RETURNS SETOF public.scan_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  running_count integer;
  target public.scan_jobs;
  claimed public.scan_jobs;
BEGIN
  UPDATE public.scan_jobs
  SET
    status = 'failed',
    error_message = COALESCE(error_message, '작업 시간 초과로 중단되었습니다.'),
    locked_at = NULL,
    locked_by = NULL,
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE status = 'running'
    AND locked_at IS NOT NULL
    AND locked_at < timezone('utc', now()) - make_interval(secs => GREATEST(p_stale_seconds, 30));

  SELECT * INTO target
  FROM public.scan_jobs
  WHERE external_scan_id = p_external_scan_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF target.id IS NULL THEN
    RETURN;
  END IF;

  IF target.status IN ('completed', 'failed', 'limited', 'cancelled') THEN
    RETURN NEXT target;
    RETURN;
  END IF;

  IF target.status = 'running'
     AND target.locked_by IS NOT NULL
     AND target.locked_by <> p_worker_id
     AND target.locked_at IS NOT NULL
     AND target.locked_at >= timezone('utc', now()) - make_interval(secs => GREATEST(p_stale_seconds, 30)) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO running_count
  FROM public.scan_jobs
  WHERE status = 'running'
    AND id <> target.id;

  IF running_count >= GREATEST(p_max_running, 1) THEN
    RETURN;
  END IF;

  UPDATE public.scan_jobs AS j
  SET
    status = 'running',
    locked_at = timezone('utc', now()),
    locked_by = p_worker_id,
    last_heartbeat_at = timezone('utc', now()),
    started_at = COALESCE(j.started_at, timezone('utc', now())),
    attempt_count = COALESCE(j.attempt_count, 0) + 1,
    updated_at = timezone('utc', now())
  WHERE j.id = target.id
    AND j.status IN ('pending', 'running', 'idle')
  RETURNING * INTO claimed;

  IF claimed.id IS NOT NULL THEN
    RETURN NEXT claimed;
  END IF;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_capture_job(
  p_worker_id text,
  p_max_running integer DEFAULT 1,
  p_stale_seconds integer DEFAULT 240
)
RETURNS SETOF public.capture_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  running_count integer;
  claimed public.capture_jobs;
BEGIN
  UPDATE public.capture_jobs
  SET
    status = 'failed',
    error_message = COALESCE(error_message, '캡처 작업 시간 초과로 중단되었습니다.'),
    locked_at = NULL,
    locked_by = NULL,
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE status = 'running'
    AND locked_at IS NOT NULL
    AND locked_at < timezone('utc', now()) - make_interval(secs => GREATEST(p_stale_seconds, 30));

  SELECT COUNT(*) INTO running_count
  FROM public.capture_jobs
  WHERE status = 'running';

  IF running_count >= GREATEST(p_max_running, 1) THEN
    RETURN;
  END IF;

  UPDATE public.capture_jobs AS j
  SET
    status = 'running',
    locked_at = timezone('utc', now()),
    locked_by = p_worker_id,
    last_heartbeat_at = timezone('utc', now()),
    started_at = COALESCE(j.started_at, timezone('utc', now())),
    attempt_count = COALESCE(j.attempt_count, 0) + 1,
    updated_at = timezone('utc', now())
  WHERE j.id = (
    SELECT s.id
    FROM public.capture_jobs AS s
    WHERE s.status = 'pending'
      AND (s.locked_at IS NULL OR s.locked_at < timezone('utc', now()) - make_interval(secs => GREATEST(p_stale_seconds, 30)))
    ORDER BY s.priority ASC, s.queued_at ASC NULLS LAST, s.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO claimed;

  IF claimed.id IS NOT NULL THEN
    RETURN NEXT claimed;
  END IF;
  RETURN;
END;
$$;
