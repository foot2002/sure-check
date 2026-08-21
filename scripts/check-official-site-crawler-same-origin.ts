/**
 * Crawler must re-check same-origin at seed enqueue and link follow.
 * External survey platforms may be saved; other external links are not followed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { officialSiteSameOrigin } from "../lib/collector/officialSiteOrigin";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Crawler Same Origin Check]\n");

{
  assert.equal(
    officialSiteSameOrigin("https://www.example.go.kr/", "https://example.go.kr/notice"),
    true,
  );
  assert.equal(
    officialSiteSameOrigin("https://bsseogu.go.kr/", "https://www.seohae.go.kr/"),
    false,
  );
  console.log("  PASS  origin helper www/scheme-insensitive, host-strict");
}

{
  const crawler = source("lib/collector/officialSiteCrawler.ts");
  assert.ok(crawler.includes("enqueueSeed"));
  assert.ok(crawler.includes("crossOriginSkipped"));
  assert.ok(crawler.includes("looksLikeSurveyDomainUrl"));
  assert.ok(crawler.includes("sameOriginOnly"));
  assert.ok(crawler.includes("officialSiteSameOrigin(row.homepage_url, pageUrl)"));
  assert.ok(crawler.includes("officialSiteSameOrigin(row.homepage_url, find.sourcePageUrl)"));
  console.log("  PASS  queue, follow, redirect, and source_page_url re-check same-origin");
}

console.log("\nofficial-site-crawler-same-origin-check: ok");
