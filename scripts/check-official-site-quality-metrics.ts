/**
 * Official-site quality metrics vs targets, seed mismatch, migration warning.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DATE_EXTRACT_RATE_TARGET,
  DATE_UNKNOWN_HOLD_RATIO_TARGET,
  SOURCE_PAGE_URL_RATE_TARGET,
} from "../lib/collector/opsCapacityPolicy";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Quality Metrics Check]\n");

{
  assert.equal(SOURCE_PAGE_URL_RATE_TARGET, 0.9);
  assert.equal(DATE_EXTRACT_RATE_TARGET, 0.5);
  assert.equal(DATE_UNKNOWN_HOLD_RATIO_TARGET, 0.3);
  console.log("  PASS  quality targets 90% / 50% / 30%");
}

{
  const snap = source("lib/collector/officialSiteRepository.ts");
  assert.ok(snap.includes("sourcePageUrlSaveRate"));
  assert.ok(snap.includes("postedDateExtractRate"));
  assert.ok(snap.includes("periodExtractRate"));
  assert.ok(snap.includes("dateExtractSuccessRate"));
  assert.ok(snap.includes("sourceEvidenceSchemaMissing"));
  assert.ok(snap.includes("012_official_site_source_evidence.sql"));
  assert.ok(snap.includes("needs_review"));
  assert.ok(snap.includes("listOfficialSiteNeedsReviewSamples"));
  assert.ok(snap.includes('seed_review_status.eq.ok'));
  console.log("  PASS  snapshot computes source_page_url / date extract / schema warning");
}

{
  const run = source("lib/collector/runOfficialSiteCollection.ts");
  assert.ok(run.includes('seed_review_status !== "needs_review"'));
  const sync = source("lib/collector/officialSiteRepository.ts");
  assert.ok(sync.includes('crawl_priority: needsReview ? "C"'));
  console.log("  PASS  needs_review seeds skipped or lowered to C");
}

{
  const view = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(view.includes("source_page_url 저장률"));
  assert.ok(view.includes("게시일 추출 성공률"));
  assert.ok(view.includes("기간/마감일 추출 성공률"));
  assert.ok(view.includes("날짜 추출 성공률"));
  assert.ok(view.includes("date_unknown_hold 비율"));
  assert.ok(view.includes("seed 오매핑 의심"));
  assert.ok(view.includes("공식 사이트 탐색 성공률"));
  assert.ok(view.includes("012_official_site_source_evidence.sql"));
  console.log("  PASS  collector UI shows quality metrics vs targets");
}

{
  const repo = source("lib/collector/repository.ts");
  assert.ok(repo.includes("012_official_site_source_evidence.sql"));
  console.log("  PASS  source evidence insert warns when columns are missing");
}

console.log("\nofficial-site-quality-metrics-check: ok");
