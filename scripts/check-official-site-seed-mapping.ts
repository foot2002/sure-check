/**
 * Seed homepage mismatch detection (강남구 → gangdong.go.kr).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  localitySlugs,
  reviewOfficialSiteSeed,
  reviewOfficialSiteSeeds,
  romanizeHangul,
} from "../lib/collector/officialSiteSeedReview";
import { loadOfficialInstitutionSeeds } from "../lib/collector/officialSiteSeeds";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Seed Mapping Check]\n");

{
  assert.equal(romanizeHangul("강남"), "gangnam");
  assert.equal(romanizeHangul("강동"), "gangdong");
  assert.ok(localitySlugs("강남구").includes("gangnam"));
  console.log("  PASS  locality romanization");
}

const gangnam = {
  organizationName: "강남구",
  organizationType: "기초자치단체" as const,
  homepageUrl: "https://www.gangdong.go.kr/",
  seedUrls: ["https://www.gangdong.go.kr/"],
  source: "wiseon_public_institution_list" as const,
};
const gangdong = {
  organizationName: "강동구",
  organizationType: "기초자치단체" as const,
  homepageUrl: "https://www.gangdong.go.kr/",
  seedUrls: ["https://www.gangdong.go.kr/"],
  source: "wiseon_public_institution_list" as const,
};
const ftc = {
  organizationName: "공정거래위원회",
  organizationType: "중앙부처" as const,
  homepageUrl: "https://www.ftc.go.kr/",
  seedUrls: ["https://www.ftc.go.kr/"],
  source: "wiseon_public_institution_list" as const,
};

{
  const peers = [gangnam, gangdong, ftc];
  const bad = reviewOfficialSiteSeed(gangnam, peers);
  assert.equal(bad.status, "needs_review");
  assert.equal(bad.reason, "domain_mismatch");
  const okDong = reviewOfficialSiteSeed(gangdong, peers);
  assert.equal(okDong.status, "ok");
  const okFtc = reviewOfficialSiteSeed(ftc, peers);
  assert.equal(okFtc.status, "ok");
  console.log("  PASS  강남구→gangdong.go.kr needs_review; 강동구/FTC ok");
}

{
  const missing = reviewOfficialSiteSeed({
    ...ftc,
    homepageUrl: "",
  });
  assert.equal(missing.status, "needs_review");
  assert.equal(missing.reason, "missing_homepage");
  console.log("  PASS  missing homepage → needs_review");
}

{
  const seeds = loadOfficialInstitutionSeeds();
  const reviews = reviewOfficialSiteSeeds(seeds);
  const mismatches = reviews.filter((row) => row.reason === "domain_mismatch");
  const gangnamLive = mismatches.find((row) => row.organizationName === "강남구");
  assert.ok(gangnamLive, "expected 강남구 domain mismatch in live seeds");
  console.log(
    `  PASS  live seeds: ${mismatches.length} domain_mismatch (sample 강남구)`,
  );
}

{
  const repo = source("lib/collector/officialSiteRepository.ts");
  assert.ok(repo.includes("seed_review_status"));
  assert.ok(repo.includes("needs_review"));
  assert.ok(repo.includes("listDueOfficialInstitutionSites"));
  assert.ok(repo.includes("seed_review_status.eq.ok"));
  console.log("  PASS  due crawl excludes needs_review seeds");
}

console.log("\nofficial-site-seed-mapping-check: ok");
