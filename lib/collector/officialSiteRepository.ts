import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  backoffIntervalDays,
  crawlIntervalDaysForPriority,
  crawlPriorityForType,
  effectiveCrawlPriority,
  nextCrawlAt,
  seedKey,
  type OfficialSiteCrawlStatus,
} from "@/lib/collector/officialSiteCrawlPolicy";
import type { OfficialInstitutionSeed } from "@/lib/collector/officialSiteSeeds";
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
  };
}

export async function syncOfficialInstitutionSites(
  seeds: OfficialInstitutionSeed[],
): Promise<{ upserted: number; skipped: boolean }> {
  const supabase = client();
  const now = new Date();
  const chunkSize = 80;
  let upserted = 0;
  for (let i = 0; i < seeds.length; i += chunkSize) {
    const slice = seeds.slice(i, i + chunkSize).map((seed) => {
      const priority = crawlPriorityForType(seed.organizationType);
      return {
        seed_key: seedKey(seed),
        organization_name: seed.organizationName,
        organization_type: seed.organizationType,
        homepage_url: seed.homepageUrl,
        seed_urls: seed.seedUrls,
        source: seed.source,
        crawl_priority: priority,
        crawl_interval_days: crawlIntervalDaysForPriority(priority),
        next_crawl_at: now.toISOString(),
      };
    });
    const { error } = await supabase.from("official_institution_sites").upsert(slice, {
      onConflict: "seed_key",
      ignoreDuplicates: true,
    });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        return { upserted: 0, skipped: true };
      }
      throw new Error(`official_institution_sites upsert 실패: ${error.message}`);
    }
    upserted += slice.length;
  }
  return { upserted, skipped: false };
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
    .order("crawl_priority", { ascending: true })
    .order("next_crawl_at", { ascending: true })
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(`due official sites 조회 실패: ${error.message}`);
  }
  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function markOfficialSiteRunning(id: string): Promise<void> {
  const supabase = client();
  await supabase
    .from("official_institution_sites")
    .update({ crawl_status: "running" })
    .eq("id", id);
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
