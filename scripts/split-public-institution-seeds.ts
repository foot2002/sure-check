/**
 * Split public-institution-seeds.json so homonyms are one seed per homepage host.
 * Does not read the original Excel and never writes PII.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { officialSiteHostname } from "../lib/collector/officialSiteOrigin";
import {
  splitOfficialInstitutionSeedsByHost,
  type OfficialInstitutionSeed,
} from "../lib/collector/officialSiteSeeds";

const OUTPUT = join(process.cwd(), "data", "public-institution-seeds.json");

function isSeed(value: unknown): value is OfficialInstitutionSeed {
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

const raw = JSON.parse(readFileSync(OUTPUT, "utf8")) as unknown;
if (!Array.isArray(raw)) throw new Error("public-institution-seeds.json must be an array");
const before = raw.filter(isSeed);
const split = splitOfficialInstitutionSeedsByHost(before);
const serialized = split.map((seed) => {
  const row: OfficialInstitutionSeed = {
    organizationName: seed.organizationName,
    organizationType: seed.organizationType,
    homepageUrl: seed.homepageUrl,
    seedUrls: seed.seedUrls,
    source: "wiseon_public_institution_list",
  };
  if ((seed.rejectedSeedUrls || []).length > 0) {
    row.rejectedSeedUrls = seed.rejectedSeedUrls;
  }
  return row;
});
writeFileSync(OUTPUT, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");

const byName = new Map<string, string[]>();
for (const seed of serialized) {
  const host = officialSiteHostname(seed.homepageUrl) || seed.homepageUrl;
  const list = byName.get(seed.organizationName) || [];
  list.push(host);
  byName.set(seed.organizationName, list);
}
const homonyms = [...byName.entries()].filter(([, hosts]) => hosts.length > 1);
console.log(
  JSON.stringify(
    {
      before: before.length,
      after: serialized.length,
      homonymNames: homonyms.length,
      extraSeeds: serialized.length - before.length,
      sampleHomonyms: homonyms.slice(0, 8).map(([name, hosts]) => ({ name, hosts })),
      output: OUTPUT,
    },
    null,
    2,
  ),
);
