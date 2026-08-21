/**
 * Official-site seed URLs must be same-origin with homepage_url.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  officialSiteSameOrigin,
  partitionSeedUrlsByHomepageOrigin,
} from "../lib/collector/officialSiteOrigin";
import { reviewOfficialSiteSeed } from "../lib/collector/officialSiteSeedReview";
import { loadOfficialInstitutionSeeds } from "../lib/collector/officialSiteSeeds";
import { buildOfficialInstitutionSeeds } from "./build-public-institution-seeds";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Seed Origin Check]\n");

{
  assert.equal(
    officialSiteSameOrigin("https://www.bsseogu.go.kr/", "https://bsseogu.go.kr/org"),
    true,
  );
  assert.equal(
    officialSiteSameOrigin("https://bsseogu.go.kr/", "https://www.dgs.go.kr/"),
    false,
  );
  assert.equal(
    officialSiteSameOrigin("http://example.go.kr/", "https://example.go.kr/notice"),
    true,
  );
  const partitioned = partitionSeedUrlsByHomepageOrigin("https://bsseogu.go.kr/", [
    "https://www.bsseogu.go.kr/org",
    "https://www.dgs.go.kr/",
    "https://www.seogu.gwangju.kr/",
  ]);
  assert.deepEqual(partitioned.validSeedUrls, [
    "https://bsseogu.go.kr/",
    "https://www.bsseogu.go.kr/org",
  ]);
  assert.ok(partitioned.rejectedSeedUrls.includes("https://www.dgs.go.kr/"));
  console.log("  PASS  same-origin partition keeps homepage host only");
}

{
  const mixed = reviewOfficialSiteSeed({
    organizationName: "서구",
    organizationType: "기초자치단체",
    homepageUrl: "https://bsseogu.go.kr/",
    seedUrls: ["https://bsseogu.go.kr/", "https://www.dgs.go.kr/"],
    source: "wiseon_public_institution_list",
  });
  assert.equal(mixed.status, "needs_review");
  assert.equal(mixed.reason, "cross_origin_seed_url");
  console.log("  PASS  mixed seed_urls → needs_review / cross_origin_seed_url");
}

{
  const built = buildOfficialInstitutionSeeds([
    {
      "기관명(부속기관)": "서구",
      "대분류(기관유형)": "기초자치단체",
      "홈페이지": "https://bsseogu.go.kr/",
      "조직도 링크": "https://www.dgs.go.kr/org",
    },
  ]);
  assert.ok(built.seeds.length >= 2);
  for (const seed of built.seeds) {
    for (const url of seed.seedUrls) {
      assert.equal(officialSiteSameOrigin(seed.homepageUrl, url), true, url);
    }
  }
  console.log("  PASS  builder does not mix cross-origin URLs into one seed");
}

{
  const seeds = loadOfficialInstitutionSeeds();
  let mixed = 0;
  for (const seed of seeds) {
    for (const url of seed.seedUrls) {
      if (!officialSiteSameOrigin(seed.homepageUrl, url)) mixed += 1;
    }
  }
  assert.equal(mixed, 0, `expected 0 cross-origin seedUrls, got ${mixed}`);
  const crawler = source("lib/collector/officialSiteCrawler.ts");
  assert.ok(crawler.includes("officialSiteSameOrigin"));
  assert.ok(crawler.includes("crossOriginSkipped"));
  console.log(`  PASS  live seeds same-origin (${seeds.length} institutions)`);
}

console.log("\nofficial-site-seed-origin-check: ok");
