import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupUrlsByHostname,
  homepageFromHttpUrl,
  officialSiteHostname,
  partitionSeedUrlsByHomepageOrigin,
  uniqueHttpUrls,
} from "@/lib/collector/officialSiteOrigin";

export type OfficialInstitutionSeed = {
  organizationName: string;
  organizationType: string;
  homepageUrl: string;
  seedUrls: string[];
  rejectedSeedUrls?: string[];
  source: "wiseon_public_institution_list";
};

export type OfficialSiteCrawlPriority = "A" | "B" | "C";

const A_TYPES = new Set([
  "중앙부처",
  "광역자치단체",
  "기초자치단체",
  "교육행정기관",
]);
const B_TYPES = new Set([
  "지방공기업",
  "중앙행정기관 산하 공공기관",
  "출연기관",
]);

export function crawlPriorityForType(
  organizationType: string | null | undefined,
): OfficialSiteCrawlPriority {
  const type = (organizationType || "").trim();
  if (A_TYPES.has(type)) return "A";
  if (B_TYPES.has(type)) return "B";
  return "C";
}

export function crawlIntervalDaysForPriority(
  priority: OfficialSiteCrawlPriority,
): number {
  void priority;
  return 30;
}

let cached: OfficialInstitutionSeed[] | null = null;

export function loadOfficialInstitutionSeeds(): OfficialInstitutionSeed[] {
  if (cached) return cached;
  const filePath = join(
    process.cwd(),
    "data",
    "public-institution-seeds.json",
  );
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("public-institution-seeds.json must be an array");
  }
  cached = splitOfficialInstitutionSeedsByHost(
    parsed.filter(isOfficialInstitutionSeed),
  );
  return cached;
}

export function splitOfficialInstitutionSeedsByHost(
  seeds: OfficialInstitutionSeed[],
): OfficialInstitutionSeed[] {
  const byKey = new Map<string, OfficialInstitutionSeed>();
  for (const seed of seeds) {
    const urls = uniqueHttpUrls([
      seed.homepageUrl,
      ...(seed.seedUrls || []),
      ...(seed.rejectedSeedUrls || []),
    ]);
    const groups = groupUrlsByHostname(urls);
    for (const [host, hostUrls] of groups) {
      const homepageUrl =
        hostUrls.map((url) => homepageFromHttpUrl(url)).find(Boolean) ||
        hostUrls[0];
      if (!homepageUrl || officialSiteHostname(homepageUrl) !== host) continue;
      const partitioned = partitionSeedUrlsByHomepageOrigin(homepageUrl, hostUrls);
      const key = `${seed.organizationName}::${host}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          organizationName: seed.organizationName,
          organizationType: seed.organizationType || "공공기관",
          homepageUrl,
          seedUrls: partitioned.validSeedUrls,
          rejectedSeedUrls: partitioned.rejectedSeedUrls,
          source: "wiseon_public_institution_list",
        });
        continue;
      }
      const merged = partitionSeedUrlsByHomepageOrigin(existing.homepageUrl, [
        ...existing.seedUrls,
        ...partitioned.validSeedUrls,
      ]);
      existing.seedUrls = merged.validSeedUrls;
      existing.rejectedSeedUrls = uniqueHttpUrls([
        ...(existing.rejectedSeedUrls || []),
        ...partitioned.rejectedSeedUrls,
        ...merged.rejectedSeedUrls,
      ]);
      if (!existing.organizationType && seed.organizationType) {
        existing.organizationType = seed.organizationType;
      }
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.organizationName.localeCompare(b.organizationName, "ko") ||
    a.homepageUrl.localeCompare(b.homepageUrl),
  );
}

function isOfficialInstitutionSeed(value: unknown): value is OfficialInstitutionSeed {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.organizationName === "string" &&
    typeof row.organizationType === "string" &&
    typeof row.homepageUrl === "string" &&
    Array.isArray(row.seedUrls) &&
    row.source === "wiseon_public_institution_list"
  );
}
