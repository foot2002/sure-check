/**
 * needs_review / excluded official-site seeds must not enter auto-crawl.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Needs Review Exclusion Check]\n");

{
  const repo = source("lib/collector/officialSiteRepository.ts");
  assert.ok(repo.includes('seed_review_status.eq.ok'));
  assert.ok(repo.includes("needs_review"));
  assert.ok(repo.includes("excluded"));
  const run = source("lib/collector/runOfficialSiteCollection.ts");
  assert.ok(run.includes('seed_review_status !== "needs_review"'));
  assert.ok(run.includes('seed_review_status !== "excluded"'));
  console.log("  PASS  due query and run loop exclude needs_review / excluded");
}

{
  const crawler = source("lib/collector/officialSiteCrawler.ts");
  assert.ok(crawler.includes("officialSiteSameOrigin"));
  assert.ok(!/for \(const seed of \[row\.homepage_url, \.\.\.row\.seed_urls\]\)/.test(crawler));
  console.log("  PASS  crawler no longer blindly queues every seed_url");
}

console.log("\nofficial-site-needs-review-exclusion-check: ok");
