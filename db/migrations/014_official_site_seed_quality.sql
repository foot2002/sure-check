-- Official-site seed quality: homepage host, rejected seed URLs, excluded status.
-- Safe to re-run. Does not change public /report or /cases payloads.
-- Does not store contact-person, phone, or email fields.

ALTER TABLE public.official_institution_sites
  ADD COLUMN IF NOT EXISTS homepage_host text;

ALTER TABLE public.official_institution_sites
  ADD COLUMN IF NOT EXISTS rejected_seed_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.official_institution_sites
  ADD COLUMN IF NOT EXISTS seed_review_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE public.official_institution_sites
    DROP CONSTRAINT IF EXISTS official_institution_sites_seed_review_status_check;
  ALTER TABLE public.official_institution_sites
    ADD CONSTRAINT official_institution_sites_seed_review_status_check
    CHECK (seed_review_status IN ('ok', 'needs_review', 'excluded'));
END $$;

CREATE INDEX IF NOT EXISTS official_institution_sites_homepage_host_idx
  ON public.official_institution_sites (homepage_host);

CREATE INDEX IF NOT EXISTS official_institution_sites_rejected_seed_idx
  ON public.official_institution_sites ((jsonb_array_length(rejected_seed_urls)))
  WHERE jsonb_array_length(rejected_seed_urls) > 0;

COMMENT ON COLUMN public.official_institution_sites.homepage_host IS
  'www-stripped hostname of homepage_url; used to split homonym institutions.';
COMMENT ON COLUMN public.official_institution_sites.rejected_seed_urls IS
  'seed_urls that are not same-origin with homepage_url.';
COMMENT ON COLUMN public.official_institution_sites.seed_review_status IS
  'ok | needs_review | excluded — needs_review and excluded skip auto-crawl.';

ALTER TABLE public.official_institution_sites ENABLE ROW LEVEL SECURITY;
