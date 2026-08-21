import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  backoffIntervalDays,
  crawlIntervalDaysForPriority,
  crawlPriorityForType,
  effectiveCrawlPriority,
  nextCrawlAt,
  OFFICIAL_SITE_MAX_ORGS_PER_RUN,
  seedKey,
  type OfficialSiteCrawlStatus,
} from "@/lib/collector/officialSiteCrawlPolicy";
import { OFFICIAL_SITE_STALE_RUNNING_MS } from "@/lib/collector/opsCapacityPolicy";
import { officialSiteHostname, partitionSeedUrlsByHomepageOrigin } from "@/lib/collector/officialSiteOrigin";
import type { OfficialInstitutionSeed } from "@/lib/collector/officialSiteSeeds";
import {
  reviewOfficialSiteSeeds,
  type OfficialSiteSeedReview,
} from "@/lib/collector/officialSiteSeedReview";
import { getKstDayBounds } from "@/lib/collector/diagnosisLinkRepository";

export type OfficialInstitutionSiteRow = {
  id: string;
  seed_key: string;
  organization_name: string;
  organization_type: string;
  homepage_url: string;
  seed_urls: string[];
  source: string;
  crawl_priority: "A" | "B" | "C";
  crawl_interval_days: number;
  last_crawled_at: string | null;
  next_crawl_at: string;
  last_survey_found_at: string | null;
  consecutive_failures: number;
  crawl_status: OfficialSiteCrawlStatus;
  last_error: string | null;
  last_pages_fetched: number;
  last_surveys_found: number;
  seed_review_status: "ok" | "needs_review" | "excluded";
  seed_review_reason: string | null;
  homepage_host: string | null;
  rejected_seed_urls: string[];
};

function client() {
  return createSupabaseServerClient();
}

function asUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function mapRow(row: Record<string, unknown>): OfficialInstitutionSiteRow {
  return {
    id: String(row.id),
    seed_key: String(row.seed_key),
    organization_name: String(row.organization_name),
    organization_type: String(row.organization_type || "공공기관"),
    homepage_url: String(row.homepage_url),
    seed_urls: asUrls(row.seed_urls),
    source: String(row.source || "wiseon_public_institution_list"),
    crawl_priority: (row.crawl_priority as "A" | "B" | "C") || "C",
    crawl_interval_days: Number(row.crawl_interval_days || 7),
    last_crawled_at: (row.last_crawled_at as string | null) || null,
    next_crawl_at: String(row.next_crawl_at),
    last_survey_found_at: (row.last_survey_found_at as string | null) || null,
    consecutive_failures: Number(row.consecutive_failures || 0),
    crawl_status: (row.crawl_status as OfficialSiteCrawlStatus) || "idle",
    last_error: (row.last_error as string | null) || null,
    last_pages_fetched: Number(row.last_pages_fetched || 0),
    last_surveys_found: Number(row.last_surveys_found || 0),
    seed_review_status:
      row.seed_review_status === "needs_review" ||
      row.seed_review_status === "excluded"
        ? row.seed_review_status
        : "ok",
    seed_review_reason: (row.seed_review_reason as string | null) || null,
    homepage_host: (row.homepage_host as string | null) || officialSiteHostname(String(row.homepage_url || "")),
    rejected_seed_urls: asUrls(row.rejected_seed_urls),
  };
}

export async function syncOfficialInstitutionSites(
  seeds: OfficialInstitutionSeed[],
  now: Date = new Date(),
): Promise<{ upserted: number; skipped: boolean; needsReview: number }> {
  const supabase = client();
  const reviews = reviewOfficialSiteSeeds(seeds);
  const reviewByKey = new Map<string, OfficialSiteSeedReview>();
  for (const seed of seeds) {
    const key = seedKey(seed);
    const review = reviews.find(
      (item) => seedKey({
        organizationName: item.organizationName,
        homepageUrl: item.homepageUrl,
      }) === key,
    );
    if (review) reviewByKey.set(key, review);
  }
  const chunkSize = 80;
  let upserted = 0;
  for (let i = 0; i < seeds.length; i += chunkSize) {
    const slice = seeds.slice(i, i + chunkSize).map((seed) => {
      const priority = crawlPriorityForType(seed.organizationType);
      const review = reviewByKey.get(seedKey(seed));
      const partitioned = partitionSeedUrlsByHomepageOrigin(
        seed.homepageUrl,
        seed.seedUrls,
      );
      const rejected = partitioned.rejectedSeedUrls.length > 0
        ? partitioned.rejectedSeedUrls
        : seed.rejectedSeedUrls || [];
      const needsReview =
        review?.status === "needs_review" ||
        review?.status === "excluded" ||
        rejected.length > 0;
      const status =
        review?.status === "excluded" ||
        (rejected.length > 0 && partitioned.validSeedUrls.length === 0)
          ? "excluded"
          : needsReview
            ? "needs_review"
            : "ok";
      const reason =
        review?.reason ||
        (rejected.length > 0 ? "cross_origin_seed_url" : null);
      return {
        seed_key: seedKey(seed),
        organization_name: seed.organizationName,
        organization_type: seed.organizationType,
        homepage_url: seed.homepageUrl,
        homepage_host: partitioned.homepageHost,
        seed_urls: partitioned.validSeedUrls,
        rejected_seed_urls: rejected,
        source: seed.source,
        crawl_priority: status === "ok" ? priority : "C",
        crawl_interval_days: crawlIntervalDaysForPriority(status === "ok" ? priority : "C"),
        next_crawl_at: now.toISOString(),
        seed_review_status: status,
        seed_review_reason: reason,
        last_error: status === "ok" ? null : reason === "domain_mismatch" ? "seed_domain_mismatch" : reason,
      };
    });
    const { error } = await supabase.from("official_institution_sites").upsert(slice, {
      onConflict: "seed_key",
      ignoreDuplicates: true,
    });
    if (error) {
      const missingReviewCol =
        /seed_review_status|seed_review_reason|homepage_host|rejected_seed_urls|seed_review_notes/i.test(error.message);
      const missingTable =
        /schema cache/i.test(error.message) ||
        /relation .* does not exist/i.test(error.message);
      if (missingReviewCol) {
        console.warn(
          "[collector] official-site seed quality columns missing — apply db/migrations/014_official_site_seed_quality.sql",
        );
        const stripped = slice.map((row) => {
          const copy = { ...row } as Record<string, unknown>;
          delete copy.seed_review_status;
          delete copy.seed_review_reason;
          delete copy.homepage_host;
          delete copy.rejected_seed_urls;
          delete copy.seed_review_notes;
          return copy;
        });
        const retry = await supabase.from("official_institution_sites").upsert(stripped, {
          onConflict: "seed_key",
          ignoreDuplicates: true,
        });
        if (retry.error) {
          throw new Error(`official_institution_sites upsert 실패: ${retry.error.message}`);
        }
      } else if (missingTable) {
        return { upserted: 0, skipped: true, needsReview: 0 };
      } else {
        throw new Error(`official_institution_sites upsert 실패: ${error.message}`);
      }
    }
    upserted += slice.length;
  }
  const needsReview = await applyOfficialSiteSeedReviews(reviews, seeds, now);
  return { upserted, skipped: false, needsReview };
}

export async function applyOfficialSiteSeedReviews(
  reviews: OfficialSiteSeedReview[],
  seeds: OfficialInstitutionSeed[],
  now: Date = new Date(),
): Promise<number> {
  const supabase = client();
  const seedKeys = new Set(seeds.map((seed) => seedKey(seed)));
  const holdByReason = new Map<string, string[]>();
  const holdSet = new Set<string>();
  for (const review of reviews) {
    if (review.status !== "needs_review" && review.status !== "excluded") continue;
    const key = seedKey({
      organizationName: review.organizationName,
      homepageUrl: review.homepageUrl,
    });
    if (!seedKeys.has(key)) continue;
    holdSet.add(key);
    const reason = review.reason || "domain_mismatch";
    const list = holdByReason.get(reason) || [];
    list.push(key);
    holdByReason.set(reason, list);
  }
  const far = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const updateChunk = async (keys: string[], patch: Record<string, unknown>) => {
    for (let i = 0; i < keys.length; i += 80) {
      const slice = keys.slice(i, i + 80);
      const { error } = await supabase
        .from("official_institution_sites")
        .update(patch)
        .in("seed_key", slice);
      if (error && /seed_review_status|column|does not exist|rejected_seed_urls|homepage_host/i.test(error.message)) {
        return false;
      }
      if (error) {
        throw new Error(`seed review 갱신 실패: ${error.message}`);
      }
    }
    return true;
  };

  for (const [reason, keys] of holdByReason) {
    const ok = await updateChunk(keys, {
      seed_review_status: "needs_review",
      seed_review_reason: reason,
      crawl_priority: "C",
      last_error: reason === "domain_mismatch" ? "seed_domain_mismatch" : reason,
      next_crawl_at: far,
    });
    if (!ok) return 0;
  }

  const existing = await supabase
    .from("official_institution_sites")
    .select("seed_key, rejected_seed_urls")
    .in("seed_review_status", ["needs_review", "excluded"]);
  if (existing.error && /rejected_seed_urls|column|does not exist/i.test(existing.error.message)) {
    return holdSet.size;
  }
  const existingRows = existing.error
    ? (
        await supabase
          .from("official_institution_sites")
          .select("seed_key")
          .eq("seed_review_status", "needs_review")
      ).data || []
    : existing.data || [];
  const rejectedKeys = new Set(
    existingRows
      .filter((row) => asUrls((row as { rejected_seed_urls?: unknown }).rejected_seed_urls).length > 0)
      .map((row) => String(row.seed_key)),
  );
  const clearKeys = existingRows
    .map((row) => String(row.seed_key))
    .filter((key) => !holdSet.has(key) && !rejectedKeys.has(key));
  if (clearKeys.length > 0) {
    await updateChunk(clearKeys, {
      seed_review_status: "ok",
      seed_review_reason: null,
      last_error: null,
    });
  }
  return holdSet.size;
}

export async function listDueOfficialInstitutionSites(
  limit: number,
  now: Date = new Date(),
): Promise<OfficialInstitutionSiteRow[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from("official_institution_sites")
    .select("*")
    .lte("next_crawl_at", now.toISOString())
    .neq("crawl_status", "running")
    .or("seed_review_status.eq.ok,seed_review_status.is.null")
    .order("crawl_priority", { ascending: true })
    .order("next_crawl_at", { ascending: true })
    .limit(Math.max(1, Math.min(OFFICIAL_SITE_MAX_ORGS_PER_RUN, limit)));
  if (error) {
    if (/seed_review_status/i.test(error.message)) {
      const fallback = await supabase
        .from("official_institution_sites")
        .select("*")
        .lte("next_crawl_at", now.toISOString())
        .neq("crawl_status", "running")
        .order("crawl_priority", { ascending: true })
        .order("next_crawl_at", { ascending: true })
        .limit(Math.max(1, Math.min(OFFICIAL_SITE_MAX_ORGS_PER_RUN, limit)));
      if (fallback.error) {
        throw new Error(`due official sites 조회 실패: ${fallback.error.message}`);
      }
      return (fallback.data || [])
        .map((row) => mapRow(row as Record<string, unknown>))
        .filter((row) => {
          if (row.seed_review_status === "needs_review") return false;
          if (row.seed_review_status === "excluded") return false;
          return Boolean(officialSiteHostname(row.homepage_url));
        });
    }
    if (/schema cache/i.test(error.message) || /relation .* does not exist/i.test(error.message)) {
      return [];
    }
    throw new Error(`due official sites 조회 실패: ${error.message}`);
  }
  return (data || [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row) => {
      if (row.seed_review_status === "needs_review") return false;
      if (row.seed_review_status === "excluded") return false;
      if (row.crawl_status === "running") return false;
      return Boolean(officialSiteHostname(row.homepage_url));
    });
}

export async function recoverStaleOfficialSiteRunning(
  staleMs = OFFICIAL_SITE_STALE_RUNNING_MS,
): Promise<number> {
  const supabase = client();
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data, error } = await supabase
    .from("official_institution_sites")
    .update({
      crawl_status: "failed",
      last_error: "stale running 자동 복구 (실행시간 초과/중단)",
    })
    .eq("crawl_status", "running")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) {
    if (/updated_at/i.test(error.message)) {
      console.warn(
        "[collector] official_institution_sites.updated_at missing; skip stale running recovery",
      );
    }
    return 0;
  }
  return data?.length ?? 0;
}

export async function countOfficialSitesRunning(): Promise<number> {
  const supabase = client();
  const { count, error } = await supabase
    .from("official_institution_sites")
    .select("id", { count: "exact", head: true })
    .eq("crawl_status", "running");
  if (error) return 0;
  return count ?? 0;
}

export async function claimOfficialSiteCrawl(
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const supabase = client();
  const { data, error } = await supabase
    .from("official_institution_sites")
    .update({ crawl_status: "running" })
    .in("id", ids)
    .neq("crawl_status", "running")
    .select("id");
  if (error) return [];
  return (data || []).map((row) => String(row.id));
}

export async function markOfficialSiteRunning(id: string): Promise<void> {
  const supabase = client();
  await supabase
    .from("official_institution_sites")
    .update({ crawl_status: "running" })
    .eq("id", id)
    .neq("crawl_status", "running");
}

export async function finishOfficialSiteCrawl(input: {
  row: OfficialInstitutionSiteRow;
  ok: boolean;
  pagesFetched: number;
  surveysFound: number;
  error?: string | null;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const lastSurveyFoundAt =
    input.surveysFound > 0 ? now.toISOString() : input.row.last_survey_found_at;
  const priority = effectiveCrawlPriority({
    organizationType: input.row.organization_type,
    lastSurveyFoundAt,
    now,
  });
  const consecutiveFailures = input.ok ? 0 : input.row.consecutive_failures + 1;
  const supabase = client();
  const { error } = await supabase
    .from("official_institution_sites")
    .update({
      crawl_status: input.ok ? "ok" : "failed",
      last_crawled_at: now.toISOString(),
      last_survey_found_at: lastSurveyFoundAt,
      consecutive_failures: consecutiveFailures,
      crawl_priority: priority,
      crawl_interval_days: backoffIntervalDays({
        priority,
        consecutiveFailures,
      }),
      next_crawl_at: nextCrawlAt({
        from: now,
        priority,
        consecutiveFailures,
      }),
      last_error: input.error || null,
      last_pages_fetched: input.pagesFetched,
      last_surveys_found: input.surveysFound,
    })
    .eq("id", input.row.id);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(`official site crawl 종료 실패: ${error.message}`);
  }
}

export async function countOfficialInstitutionSites(): Promise<number> {
  const supabase = client();
  const { count, error } = await supabase
    .from("official_institution_sites")
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function countOfficialSiteQualitySnapshot(
  now: Date = new Date(),
): Promise<{
  todayPagesFetched: number;
  todayOrgsWithSurveys: number;
  avgPagesPerOrg: number;
  surveyDiscoveryRate: number;
  crawlSuccessRate: number;
  sourcePageUrlSaveRate: number;
  postedDateExtractRate: number;
  periodExtractRate: number;
  dateExtractSuccessRate: number;
  failedOrgCount: number;
  sourceEvidenceSchemaMissing: boolean;
}> {
  const bounds = getKstDayBounds(now);
  const supabase = client();
  const { data: todayRows } = await supabase
    .from("official_institution_sites")
    .select("last_pages_fetched, last_surveys_found, crawl_status")
    .gte("last_crawled_at", bounds.startUtcIso)
    .lt("last_crawled_at", bounds.endUtcIso)
    .limit(400);
  const crawled = todayRows || [];
  const todayPagesFetched = crawled.reduce(
    (sum, row) => sum + Number(row.last_pages_fetched || 0),
    0,
  );
  const todayOrgsWithSurveys = crawled.filter(
    (row) => Number(row.last_surveys_found || 0) > 0,
  ).length;
  const avgPagesPerOrg =
    crawled.length > 0 ? todayPagesFetched / crawled.length : 0;
  const surveyDiscoveryRate =
    crawled.length > 0 ? todayOrgsWithSurveys / crawled.length : 0;
  const crawlOk = crawled.filter((row) => row.crawl_status === "ok").length;
  const crawlSuccessRate = crawled.length > 0 ? crawlOk / crawled.length : 0;

  const evidenceSelect =
    "source_page_url, source_posted_date, source_period_start, source_period_end, source_deadline";
  let sample: Array<Record<string, unknown>> = [];
  let sourceEvidenceSchemaMissing = false;
  const withEvidence = await supabase
    .from("survey_sources")
    .select(evidenceSelect)
    .eq("source_type", "official_site")
    .limit(400);
  if (withEvidence.error) {
    sourceEvidenceSchemaMissing = /source_page_url|source_posted_date|source_period|source_deadline|schema cache|does not exist/i.test(
      withEvidence.error.message,
    );
    if (sourceEvidenceSchemaMissing) {
      console.warn(
        "[collector] official-site source evidence columns missing — apply db/migrations/012_official_site_source_evidence.sql",
      );
    }
    const fallback = await supabase
      .from("survey_sources")
      .select("source_url")
      .eq("source_type", "official_site")
      .limit(400);
    sample = (fallback.data || []) as Array<Record<string, unknown>>;
  } else {
    sample = (withEvidence.data || []) as Array<Record<string, unknown>>;
  }
  const withPage = sample.filter((row) => Boolean(row.source_page_url)).length;
  const withPosted = sample.filter((row) => Boolean(row.source_posted_date)).length;
  const withPeriod = sample.filter(
    (row) =>
      Boolean(row.source_period_start) ||
      Boolean(row.source_period_end) ||
      Boolean(row.source_deadline),
  ).length;
  const withAnyDate = sample.filter(
    (row) =>
      Boolean(row.source_posted_date) ||
      Boolean(row.source_period_start) ||
      Boolean(row.source_period_end) ||
      Boolean(row.source_deadline),
  ).length;
  const denom = sample.length;

  const { count: failedOrgCount } = await supabase
    .from("official_institution_sites")
    .select("id", { count: "exact", head: true })
    .eq("crawl_status", "failed");

  return {
    todayPagesFetched,
    todayOrgsWithSurveys,
    avgPagesPerOrg,
    surveyDiscoveryRate,
    crawlSuccessRate,
    sourcePageUrlSaveRate:
      denom > 0 && !sourceEvidenceSchemaMissing ? withPage / denom : 0,
    postedDateExtractRate:
      denom > 0 && !sourceEvidenceSchemaMissing ? withPosted / denom : 0,
    periodExtractRate:
      denom > 0 && !sourceEvidenceSchemaMissing ? withPeriod / denom : 0,
    dateExtractSuccessRate:
      denom > 0 && !sourceEvidenceSchemaMissing ? withAnyDate / denom : 0,
    failedOrgCount: failedOrgCount ?? 0,
    sourceEvidenceSchemaMissing,
  };
}

export async function countOfficialSitesCrawledToday(
  now: Date = new Date(),
): Promise<number> {
  const bounds = getKstDayBounds(now);
  const supabase = client();
  const { count, error } = await supabase
    .from("official_institution_sites")
    .select("id", { count: "exact", head: true })
    .gte("last_crawled_at", bounds.startUtcIso)
    .lt("last_crawled_at", bounds.endUtcIso);
  if (error) return 0;
  return count ?? 0;
}

export async function countOfficialSiteSurveysFoundToday(
  now: Date = new Date(),
): Promise<number> {
  const bounds = getKstDayBounds(now);
  const supabase = client();
  const { count, error } = await supabase
    .from("survey_sources")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "official_site")
    .gte("discovered_at", bounds.startUtcIso)
    .lt("discovered_at", bounds.endUtcIso);
  if (error) {
    const fallback = await supabase
      .from("survey_sources")
      .select("id", { count: "exact", head: true })
      .like("search_query", "official_site:%")
      .gte("discovered_at", bounds.startUtcIso)
      .lt("discovered_at", bounds.endUtcIso);
    return fallback.count ?? 0;
  }
  return count ?? 0;
}

export async function countOfficialSiteNeedsReview(): Promise<number> {
  const supabase = client();
  const { count, error } = await supabase
    .from("official_institution_sites")
    .select("id", { count: "exact", head: true })
    .eq("seed_review_status", "needs_review");
  if (error) return 0;
  return count ?? 0;
}

export async function countOfficialSiteExcluded(): Promise<number> {
  const supabase = client();
  const { count, error } = await supabase
    .from("official_institution_sites")
    .select("id", { count: "exact", head: true })
    .eq("seed_review_status", "excluded");
  if (error) return 0;
  return count ?? 0;
}

export async function countOfficialSiteRejectedSeedRows(): Promise<number> {
  const supabase = client();
  const { data, error } = await supabase
    .from("official_institution_sites")
    .select("rejected_seed_urls")
    .neq("rejected_seed_urls", "[]");
  if (error) return 0;
  return (data || []).filter((row) => asUrls(row.rejected_seed_urls).length > 0).length;
}

export async function countOfficialSiteRejectedSeedUrls(): Promise<number> {
  const supabase = client();
  const { data, error } = await supabase
    .from("official_institution_sites")
    .select("rejected_seed_urls")
    .neq("rejected_seed_urls", "[]");
  if (error) return 0;
  return (data || []).reduce(
    (sum, row) => sum + asUrls(row.rejected_seed_urls).length,
    0,
  );
}

export async function listOfficialSiteNeedsReviewSamples(
  limit = 5,
): Promise<
  Array<{
    organizationName: string;
    homepageUrl: string;
    reason: string | null;
    rejectedSeedUrls?: string[];
    status?: string;
  }>
> {
  const supabase = client();
  const withRejected = await supabase
    .from("official_institution_sites")
    .select("organization_name, homepage_url, seed_review_reason, seed_review_status, rejected_seed_urls")
    .in("seed_review_status", ["needs_review", "excluded"])
    .order("organization_name", { ascending: true })
    .limit(Math.max(1, Math.min(12, limit)));
  if (!withRejected.error) {
    return (withRejected.data || []).map((row) => ({
      organizationName: String(row.organization_name || ""),
      homepageUrl: String(row.homepage_url || ""),
      reason: (row.seed_review_reason as string | null) || null,
      rejectedSeedUrls: asUrls(row.rejected_seed_urls),
      status: String(row.seed_review_status || "needs_review"),
    }));
  }
  const { data, error } = await supabase
    .from("official_institution_sites")
    .select("organization_name, homepage_url, seed_review_reason")
    .eq("seed_review_status", "needs_review")
    .order("organization_name", { ascending: true })
    .limit(Math.max(1, Math.min(12, limit)));
  if (error) return [];
  return (data || []).map((row) => ({
    organizationName: String(row.organization_name || ""),
    homepageUrl: String(row.homepage_url || ""),
    reason: (row.seed_review_reason as string | null) || null,
  }));
}

export async function countNaverChannelSurveysFoundToday(
  now: Date = new Date(),
): Promise<number> {
  const bounds = getKstDayBounds(now);
  const supabase = client();
  const { count, error } = await supabase
    .from("survey_sources")
    .select("id", { count: "exact", head: true })
    .in("source_type", ["web", "blog", "cafe"])
    .gte("discovered_at", bounds.startUtcIso)
    .lt("discovered_at", bounds.endUtcIso);
  if (error) return 0;
  return count ?? 0;
}

async function officialSiteLinkIds(options?: {
  sinceIso?: string;
  untilIso?: string;
}): Promise<string[]> {
  const supabase = client();
  let query = supabase
    .from("survey_sources")
    .select("survey_link_id")
    .eq("source_type", "official_site");
  if (options?.sinceIso) query = query.gte("discovered_at", options.sinceIso);
  if (options?.untilIso) query = query.lt("discovered_at", options.untilIso);
  const { data, error } = await query.limit(5000);
  if (error) return [];
  return [...new Set((data || []).map((row) => String(row.survey_link_id)))];
}

async function countLinksMatching(
  ids: string[],
  filters: Record<string, string>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = client();
  let total = 0;
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    let query = supabase
      .from("survey_links")
      .select("id", { count: "exact", head: true })
      .in("id", slice);
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }
    const { count, error } = await query;
    if (error) continue;
    total += count ?? 0;
  }
  return total;
}

export async function countOfficialSiteSurveysTotal(): Promise<number> {
  const supabase = client();
  const { count, error } = await supabase
    .from("survey_sources")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "official_site");
  if (error) return 0;
  return count ?? 0;
}

const OLD_YEAR_REASONS = [
  "stale_year",
  "stale_topic_year",
  "previous_year_phrase",
] as const;
const UNKNOWN_REASONS = [
  "date_unknown_hold",
  "active_unknown_date",
  "unknown_no_signal",
] as const;

export async function countOfficialSiteFreshnessStats(input?: {
  sinceIso?: string;
  untilIso?: string;
}): Promise<{
  recentEligible: number;
  oldYearExcluded: number;
  dateUnknownHold: number;
  restrictedExcluded: number;
}> {
  const ids = await officialSiteLinkIds(input);
  if (ids.length === 0) {
    return {
      recentEligible: 0,
      oldYearExcluded: 0,
      dateUnknownHold: 0,
      restrictedExcluded: 0,
    };
  }
  const recentEligible = await countLinksMatching(ids, {
    "freshness->>diagnosis_eligible_recent": "true",
  });
  let oldYearExcluded = 0;
  for (const reason of OLD_YEAR_REASONS) {
    oldYearExcluded += await countLinksMatching(ids, {
      "freshness->>reason_code": reason,
    });
  }
  const flaggedOld = await countLinksMatching(ids, {
    "freshness->>old_year_signal": "true",
  });
  oldYearExcluded = Math.max(oldYearExcluded, flaggedOld);
  let dateUnknownHold = 0;
  for (const reason of UNKNOWN_REASONS) {
    dateUnknownHold += await countLinksMatching(ids, {
      "freshness->>diagnosis_exclusion_reason": reason,
    });
  }
  const restrictedExcluded = await countLinksMatching(ids, {
    status: "restricted",
  });
  return {
    recentEligible,
    oldYearExcluded,
    dateUnknownHold,
    restrictedExcluded,
  };
}

export async function countOfficialSiteDiagnosisQueuedToday(
  now: Date = new Date(),
): Promise<number> {
  const bounds = getKstDayBounds(now);
  const ids = await officialSiteLinkIds();
  if (ids.length === 0) return 0;
  const supabase = client();
  let total = 0;
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const { count, error } = await supabase
      .from("survey_diagnosis_links")
      .select("id", { count: "exact", head: true })
      .in("survey_link_id", slice)
      .gte("created_at", bounds.startUtcIso)
      .lt("created_at", bounds.endUtcIso);
    if (error) continue;
    total += count ?? 0;
  }
  return total;
}
