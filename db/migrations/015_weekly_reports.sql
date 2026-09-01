-- Weekly aggregate reports for /weekly (press-ready snapshots).
-- Does not store institution names, survey URLs, question text, or Storage paths.
-- Safe to re-run. Individual public_cases data is unchanged.

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id text NOT NULL,
  week_label text NOT NULL,
  period_start_kst date NOT NULL,
  period_end_kst date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  status text NOT NULL DEFAULT 'draft',
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  trends_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform_stats_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  organization_stats_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  issue_stats_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  anonymous_cases_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  insights_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  press_summary_text text NOT NULL DEFAULT '',
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT weekly_reports_week_id_key UNIQUE (week_id),
  CONSTRAINT weekly_reports_status_check
    CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS weekly_reports_status_idx
  ON public.weekly_reports (status);

CREATE INDEX IF NOT EXISTS weekly_reports_period_start_idx
  ON public.weekly_reports (period_start_kst DESC);

DROP TRIGGER IF EXISTS weekly_reports_set_updated_at ON public.weekly_reports;
CREATE TRIGGER weekly_reports_set_updated_at
  BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.weekly_reports IS
  'KST weekly aggregate snapshots for /weekly. Public pages expose published rows only. Never store org names, URLs, question text, or Storage paths.';
