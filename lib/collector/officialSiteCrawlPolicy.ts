import {
  crawlIntervalDaysForPriority,
  crawlPriorityForType,
  type OfficialInstitutionSeed,
  type OfficialSiteCrawlPriority,
} from "@/lib/collector/officialSiteSeeds";

export {
  crawlIntervalDaysForPriority,
  crawlPriorityForType,
};

export const OFFICIAL_SITE_MAX_PAGES = 24;
export const OFFICIAL_SITE_MAX_DEPTH = 2;
export const OFFICIAL_SITE_TIMEOUT_PER_PAGE_MS = 8_000;
export const OFFICIAL_SITE_ORG_BUDGET_MS = 90_000;
export const OFFICIAL_SITE_RUN_BUDGET_MS = 240_000;
export const OFFICIAL_SITE_MAX_ORGS_PER_RUN = 8;
export const OFFICIAL_SITE_MAX_CONCURRENCY = 1;
export const OFFICIAL_SITE_SURVEY_BOOST_DAYS = 60;
export const OFFICIAL_SITE_BACKOFF_CAP_DAYS = 14;

export const OFFICIAL_SITE_PRIORITY_KEYWORDS = [
  "공지",
  "공지사항",
  "알림",
  "알림마당",
  "소식",
  "새소식",
  "참여",
  "국민참여",
  "고객참여",
  "소통",
  "설문",
  "조사",
  "만족도",
  "신청",
  "접수",
  "모집",
  "프로그램",
  "교육",
  "행사",
  "의견수렴",
  "수요조사",
] as const;

export type OfficialSiteCrawlStatus =
  | "idle"
  | "running"
  | "ok"
  | "failed";

export function effectiveCrawlPriority(input: {
  organizationType?: string | null;
  lastSurveyFoundAt?: string | null;
  now?: Date;
}): OfficialSiteCrawlPriority {
  const base = crawlPriorityForType(input.organizationType);
  const foundAt = input.lastSurveyFoundAt
    ? Date.parse(input.lastSurveyFoundAt)
    : NaN;
  if (!Number.isFinite(foundAt)) return base;
  const now = input.now ?? new Date();
  const ageDays = (now.getTime() - foundAt) / (24 * 60 * 60 * 1000);
  if (ageDays <= OFFICIAL_SITE_SURVEY_BOOST_DAYS) return "A";
  return base;
}

export function backoffIntervalDays(input: {
  priority: OfficialSiteCrawlPriority;
  consecutiveFailures: number;
}): number {
  const base = crawlIntervalDaysForPriority(input.priority);
  const failures = Math.max(0, input.consecutiveFailures);
  if (failures <= 0) return base;
  const multiplier = failures === 1 ? 2 : failures === 2 ? 3 : 7;
  return Math.min(OFFICIAL_SITE_BACKOFF_CAP_DAYS, base * multiplier);
}

export function nextCrawlAt(input: {
  from: Date;
  priority: OfficialSiteCrawlPriority;
  consecutiveFailures: number;
}): string {
  const days = backoffIntervalDays(input);
  return new Date(input.from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function seedKey(seed: Pick<OfficialInstitutionSeed, "organizationName" | "homepageUrl">): string {
  try {
    const host = new URL(seed.homepageUrl).hostname.replace(/^www\./, "").toLowerCase();
    return `${seed.organizationName}::${host}`;
  } catch {
    return `${seed.organizationName}::${seed.homepageUrl}`;
  }
}

export function isPriorityOfficialPath(text: string): boolean {
  const blob = text.toLowerCase();
  return OFFICIAL_SITE_PRIORITY_KEYWORDS.some((keyword) =>
    blob.includes(keyword.toLowerCase()),
  );
}
