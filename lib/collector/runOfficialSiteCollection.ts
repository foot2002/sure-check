import {
  OFFICIAL_SITE_MAX_ORGS_PER_RUN,
  OFFICIAL_SITE_RUN_BUDGET_MS,
} from "@/lib/collector/officialSiteCrawlPolicy";
import { crawlOfficialInstitutionSite } from "@/lib/collector/officialSiteCrawler";
import {
  finishOfficialSiteCrawl,
  listDueOfficialInstitutionSites,
  markOfficialSiteRunning,
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
  errors: string[];
  reason?: string;
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
  const started = Date.now();
  const seeds = loadOfficialInstitutionSeeds();
  const sync = await syncOfficialInstitutionSites(seeds);
  if (sync.skipped) {
    return {
      ok: false,
      synced: 0,
      due: 0,
      crawled: 0,
      surveysSaved: 0,
      pagesFetched: 0,
      errors: [],
      reason: "official_institution_sites table missing — apply migration 011",
    };
  }

  const due = await listDueOfficialInstitutionSites(limit, now);
  const errors: string[] = [];
  let crawled = 0;
  let surveysSaved = 0;
  let pagesFetched = 0;

  for (const row of due) {
    if (Date.now() - started > OFFICIAL_SITE_RUN_BUDGET_MS) break;
    await markOfficialSiteRunning(row.id);
    try {
      const result = await crawlOfficialInstitutionSite(row, { now });
      crawled += 1;
      surveysSaved += result.surveysSaved;
      pagesFetched += result.pagesFetched;
      errors.push(...result.errors);
      await finishOfficialSiteCrawl({
        row,
        ok: result.ok,
        pagesFetched: result.pagesFetched,
        surveysFound: result.surveysSaved,
        error: result.errors[0] || null,
        now,
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
        now,
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
    errors: errors.slice(0, 12),
  };
}
