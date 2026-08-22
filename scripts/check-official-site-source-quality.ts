/**
 * Official-site source_page_url quality: article vs homepage, host mismatch.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isExternalSurveyPlatformUrl,
  isHomepageLikeSource,
  isRealOfficialSourcePage,
  sourcePageHostMismatch,
  summarizeOfficialSourceQuality,
} from "../lib/collector/officialSiteSourceQuality";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Source Quality Check]\n");

{
  const home = "https://www.ftc.go.kr/";
  const article = "https://www.ftc.go.kr/www/selectBoardArticle.do?nttId=1";
  assert.equal(isHomepageLikeSource(home, home), true);
  assert.equal(isHomepageLikeSource(article, home), false);
  assert.equal(isRealOfficialSourcePage({ sourcePageUrl: article, homepageUrl: home }), true);
  assert.equal(isRealOfficialSourcePage({ sourcePageUrl: home, homepageUrl: home }), false);
  assert.equal(
    isRealOfficialSourcePage({
      sourcePageUrl: "https://docs.google.com/forms/d/e/abc/viewform",
      homepageUrl: home,
    }),
    false,
  );
  assert.equal(isExternalSurveyPlatformUrl("https://form.naver.com/response/x"), true);
  assert.equal(sourcePageHostMismatch("https://other.go.kr/x", home), true);
  console.log("  PASS  homepage vs article vs platform URL classification");
}

{
  const summary = summarizeOfficialSourceQuality([
    {
      source_page_url: "https://www.ftc.go.kr/www/selectBoardArticle.do?nttId=1",
      source_institution_homepage: "https://www.ftc.go.kr/",
    },
    {
      source_page_url: "https://www.ftc.go.kr/",
      source_institution_homepage: "https://www.ftc.go.kr/",
    },
    {
      source_page_url: "https://docs.google.com/forms/d/e/abc/viewform",
      source_institution_homepage: "https://www.ftc.go.kr/",
    },
    { source_page_url: null, source_institution_homepage: "https://www.ftc.go.kr/" },
  ]);
  assert.equal(summary.sampleSize, 4);
  assert.equal(summary.withSourcePageUrl, 3);
  assert.equal(summary.realSourcePageCount, 1);
  assert.ok(summary.hostMismatchCount >= 1);
  assert.equal(summary.sourcePageUrlSaveRate, 0.75);
  assert.equal(summary.realSourcePageRate, 0.25);
  console.log("  PASS  source_page_url save vs real source page rates");
}

{
  const view = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(view.includes("source_page_url 저장률"));
  assert.ok(view.includes("실제 게시글·하위페이지 저장률"));
  assert.ok(view.includes("source_page_url host mismatch"));
  const repo = source("lib/collector/officialSiteRepository.ts");
  assert.ok(repo.includes("realSourcePageRate"));
  assert.ok(repo.includes("sourcePageHostMismatchCount"));
  console.log("  PASS  admin UI and snapshot expose source quality split");
}

console.log("\nofficial-site-source-quality-check: ok");
