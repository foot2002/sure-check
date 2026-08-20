import { readFileSync } from "node:fs";
import { join } from "node:path";

export type OfficialInstitutionSeed = {
  organizationName: string;
  organizationType: string;
  homepageUrl: string;
  seedUrls: string[];
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
  if (priority === "A") return 1;
  if (priority === "B") return 3;
  return 7;
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
  cached = parsed.filter(isOfficialInstitutionSeed);
  return cached;
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
