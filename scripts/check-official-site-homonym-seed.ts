/**
 * Homonym institutions must be split by homepage host, not merged by name.
 */
import assert from "node:assert/strict";
import { officialSiteDisplayName, officialSiteHostname } from "../lib/collector/officialSiteOrigin";
import { seedKey } from "../lib/collector/officialSiteCrawlPolicy";
import { loadOfficialInstitutionSeeds, splitOfficialInstitutionSeedsByHost } from "../lib/collector/officialSiteSeeds";
import { buildOfficialInstitutionSeeds } from "./build-public-institution-seeds";

console.log("[Official Site Homonym Seed Check]\n");

{
  const built = buildOfficialInstitutionSeeds([
    {
      "기관명(부속기관)": "서구",
      "대분류(기관유형)": "기초자치단체",
      "홈페이지": "https://bsseogu.go.kr/",
    },
    {
      "기관명(부속기관)": "서구",
      "대분류(기관유형)": "기초자치단체",
      "홈페이지": "https://www.dgs.go.kr/",
    },
    {
      "기관명(부속기관)": "서구",
      "대분류(기관유형)": "기초자치단체",
      "홈페이지": "https://www.seogu.gwangju.kr/",
    },
  ]);
  assert.equal(built.seeds.length, 3);
  const keys = built.seeds.map((seed) => seedKey(seed)).sort();
  assert.deepEqual(keys, [
    "서구::bsseogu.go.kr",
    "서구::dgs.go.kr",
    "서구::seogu.gwangju.kr",
  ]);
  assert.equal(
    officialSiteDisplayName("서구", "https://bsseogu.go.kr/"),
    "서구 (bsseogu.go.kr)",
  );
  console.log("  PASS  서구 rows split by homepage host");
}

{
  const merged = splitOfficialInstitutionSeedsByHost([
    {
      organizationName: "서구",
      organizationType: "기초자치단체",
      homepageUrl: "https://www.bsseogu.go.kr/",
      seedUrls: [
        "https://www.bsseogu.go.kr/",
        "https://www.dgs.go.kr/",
        "https://www.seogu.gwangju.kr/",
      ],
      source: "wiseon_public_institution_list",
    },
  ]);
  const hosts = merged.map((seed) => officialSiteHostname(seed.homepageUrl)).sort();
  assert.ok(hosts.includes("bsseogu.go.kr"));
  assert.ok(hosts.includes("dgs.go.kr"));
  assert.ok(hosts.includes("seogu.gwangju.kr"));
  assert.equal(new Set(merged.map((seed) => seedKey(seed))).size, merged.length);
  console.log("  PASS  mixed 서구 seed_urls split into host keys");
}

{
  const seeds = loadOfficialInstitutionSeeds();
  const seogu = seeds.filter((seed) => seed.organizationName === "서구");
  assert.ok(seogu.length >= 2, `expected multiple 서구 seeds, got ${seogu.length}`);
  const hosts = new Set(seogu.map((seed) => officialSiteHostname(seed.homepageUrl)));
  assert.equal(hosts.size, seogu.length);
  console.log(`  PASS  live 서구 seeds: ${seogu.length} hosts`);
}

console.log("\nofficial-site-homonym-seed-check: ok");
