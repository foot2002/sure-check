import {
  OFFICIAL_SITE_MAX_CONCURRENCY,
  OFFICIAL_SITE_MAX_ORGS_PER_RUN,
  OFFICIAL_SITE_RUN_BUDGET_MS,
} from "@/lib/collector/officialSiteCrawlPolicy";
import { crawlOfficialInstitutionSite } from "@/lib/collector/officialSiteCrawler";
import {
  claimOfficialSiteCrawl,
  countOfficialSitesRunning,
  finishOfficialSiteCrawl,
  listDueOfficialInstitutionSites,
  recoverStaleOfficialSiteRunning,
  syncOfficialInstitutionSites,
} from "@/lib/collector/officialSiteRepository";
import { loadOfficialInstitutionSeeds } from "@/lib/collector/officialSiteSeeds";

export type OfficialSiteCollectionResult = {
  ok: boolean;
  synced: number;
  due: number;
  crawled: number;
  surveysSaved: number;
  pagesFetched: number;
  crossOriginSkipped?: number;
  organizations?: string[];
  errors: string[];
  reason?: string;
  skippedParallel?: boolean;
  orgsPerRun?: number;
};

export async function runOfficialSiteCollection(input?: {
  limit?: number;
  now?: Date;
}): Promise<OfficialSiteCollectionResult> {
  const now = input?.now ?? new Date();
  const limit = Math.max(
    1,
    Math.min(OFFICIAL_SITE_MAX_ORGS_PER_RUN, input?.limit ?? OFFICIAL_SITE_MAX_ORGS_PER_RUN),
  );
  const empty = (extra: Partial<OfficialSiteCollectionResult>): OfficialSiteCollectionResult => ({
    ok: extra.ok ?? false,
    synced: extra.synced ?? 0,
    due: extra.due ?? 0,
    crawled: extra.crawled ?? 0,
    surveysSaved: extra.surveysSaved ?? 0,
    pagesFetched: extra.pagesFetched ?? 0,
    errors: extra.errors ?? [],
    reason: extra.reason,
    skippedParallel: extra.skippedParallel,
    orgsPerRun: OFFICIAL_SITE_MAX_ORGS_PER_RUN,
  });

  const started = Date.now();
  const seeds = loadOfficialInstitutionSeeds();
  const sync = await syncOfficialInstitutionSites(seeds, now);
  if (sync.skipped) {
    return empty({
      reason: "official_institution_sites table missing — apply migration 011",
    });
  }

  await recoverStaleOfficialSiteRunning();
  const alreadyRunning = await countOfficialSitesRunning();
  if (alreadyRunning > 0 || OFFICIAL_SITE_MAX_CONCURRENCY < 1) {
    return empty({
      ok: true,
      synced: sync.upserted,
      reason: "already_running",
      skippedParallel: true,
    });
  }

  const dueNow = new Date(Math.max(Date.now(), now.getTime()));
  const due = (await listDueOfficialInstitutionSites(limit, dueNow)).filter(
    (row) =>
      row.seed_review_status !== "needs_review" &&
      row.seed_review_status !== "excluded",
  );
  const claimedIds = new Set(await claimOfficialSiteCrawl(due.map((row) => row.id)));
  const claimed = due.filter((row) => claimedIds.has(row.id));
  if (claimed.length === 0 && due.length > 0) {
    return empty({
      ok: true,
      synced: sync.upserted,
      due: due.length,
      reason: "already_running",
      skippedParallel: true,
    });
  }

  const errors: string[] = [];
  let crawled = 0;
  let surveysSaved = 0;
  let pagesFetched = 0;
  let crossOriginSkipped = 0;
  const organizations: string[] = [];

  for (const row of claimed) {
    if (Date.now() - started > OFFICIAL_SITE_RUN_BUDGET_MS) {
      await finishOfficialSiteCrawl({
        row,
        ok: false,
        pagesFetched: 0,
        surveysFound: 0,
        error: "run_budget_exceeded",
        now: new Date(),
      });
      continue;
    }
    try {
      const result = await crawlOfficialInstitutionSite(row, { now });
      crawled += 1;
      surveysSaved += result.surveysSaved;
      pagesFetched += result.pagesFetched;
      crossOriginSkipped += result.crossOriginSkipped;
      organizations.push(row.organization_name);
      errors.push(...result.errors);
      await finishOfficialSiteCrawl({
        row,
        ok: result.ok,
        pagesFetched: result.pagesFetched,
        surveysFound: result.surveysSaved,
        error: result.errors[0] || null,
        now: new Date(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${row.organization_name}: ${message}`);
      await finishOfficialSiteCrawl({
        row,
        ok: false,
        pagesFetched: 0,
        surveysFound: 0,
        error: message,
        now: new Date(),
      });
    }
  }

  return {
    ok: errors.length === 0,
    synced: sync.upserted,
    due: due.length,
    crawled,
    surveysSaved,
    pagesFetched,
    crossOriginSkipped,
    organizations,
    errors: errors.slice(0, 12),
    orgsPerRun: OFFICIAL_SITE_MAX_ORGS_PER_RUN,
  };
}
