/**
 * Official-site collector must store the discovery page, not only the homepage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractOfficialPageDates,
  extractPageTitle,
  isHomepageUrl,
  pickBetterOfficialSource,
  sourcePageScore,
  withOfficialSiteFreshnessMeta,
  type OfficialSiteSurveyFind,
} from "../lib/collector/officialSiteEvidence";
import { extractPostedDateYmd } from "../lib/collector/surveyFreshness";
import { isChromePageTitle, sanitizeSurveyTitle } from "../lib/collector/titleUtils";
import { PUBLIC_REPORT_FORBIDDEN_KEYS } from "../lib/report/publicReportPolicy";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Source Page Check]\n");

{
  const crawler = source("lib/collector/officialSiteCrawler.ts");
  assert.ok(crawler.includes("sourcePageUrl"));
  assert.ok(crawler.includes("sourceAnchorText"));
  assert.ok(crawler.includes("sourceContextExcerpt"));
  assert.ok(crawler.includes("evaluateSurveyFreshness"));
  assert.ok(crawler.includes("isHomepageLikeSource"));
  assert.ok(crawler.includes("freshness_basis: \"form_page\""));
  assert.ok(!/sourceUrl:\s*row\.homepage_url/.test(crawler));
  assert.ok(!/pageText:\s*find\.sourcePageText/.test(crawler));
  console.log("  PASS  crawler stores discovery-page evidence, not homepage-only");
}

{
  const homepage = "https://www.ftc.go.kr/";
  const article =
    "https://www.ftc.go.kr/www/cop/bbs/selectBoardArticle.do?nttId=1";
  assert.equal(isHomepageUrl(homepage, homepage), true);
  assert.equal(isHomepageUrl(article, homepage), false);
  assert.ok(sourcePageScore(article, homepage) > sourcePageScore(homepage, homepage));

  const homeFind: OfficialSiteSurveyFind = {
    surveyUrl: "https://docs.google.com/forms/d/e/abc/viewform",
    sourcePageUrl: homepage,
    sourcePageTitle: "공정거래위원회",
    sourceAnchorText: "설문",
    sourceContextExcerpt: "설문조사",
    sourcePageText: "안내",
    dates: {
      postedYmd: null,
      periodStart: null,
      periodEnd: null,
      deadline: null,
      dateText: null,
    },
  };
  const articleFind: OfficialSiteSurveyFind = {
    ...homeFind,
    sourcePageUrl: article,
    sourcePageTitle: "생활 속 물가 의견수렴 안내",
    sourceAnchorText: "설문조사 참여하기",
    sourceContextExcerpt:
      "생활 속 물가에 대한 국민 의견을 수렴하기 위해 다음과 같이 설문조사를 실시합니다",
  };
  const picked = pickBetterOfficialSource(homeFind, articleFind, homepage);
  assert.equal(picked.sourcePageUrl, article);
  assert.equal(picked.sourcePageTitle.includes("물가"), true);
  console.log("  PASS  article URL preferred over homepage");
}

{
  const html = `
    <html><head><title>농림축산식품부</title></head>
    <body>
      <h1>Skip Navigation</h1>
      <h2>본문 바로가기</h2>
      <h1>수요조사 안내</h1>
    </body></html>
  `;
  assert.equal(extractPageTitle(html), "수요조사 안내");
  assert.equal(isChromePageTitle("Skip Navigation"), true);
  assert.equal(isChromePageTitle("본문 바로가기"), true);
  assert.equal(isChromePageTitle("수요조사 안내"), false);
  assert.equal(sanitizeSurveyTitle("Skip Navigation", "응답 설문"), "응답 설문");
  console.log("  PASS  skip-nav chrome is not used as survey title");
}

{
  const html = `
    <html><body>
      <h1>수요조사 안내</h1>
      <p>등록일: 2026.08.01</p>
      <p>응답기간 2026.08.01 ~ 2026.08.31</p>
      <p>마감일: 2026.08.31</p>
    </body></html>
  `;
  const dates = extractOfficialPageDates(html);
  assert.equal(dates.postedYmd, "2026-08-01");
  assert.ok(dates.periodStart === "2026-08-01" || dates.deadline === "2026-08-31");
  assert.equal(extractPostedDateYmd("작성일 2026년 8월 2일 공지"), "2026-08-02");
  console.log("  PASS  posted date / period extracted from source page");
}

{
  const meta = withOfficialSiteFreshnessMeta(
    {
      diagnosis_eligible_recent: false,
      diagnosis_exclusion_reason: "date_unknown_hold",
      reason_code: "date_unknown_hold",
    },
    {
      postedYmd: null,
      periodStart: null,
      periodEnd: null,
      deadline: null,
      dateText: null,
    },
  );
  assert.equal(meta.freshness_basis, "source_page");
  assert.equal(meta.old_year_signal, false);
  assert.equal(meta.freshness_confidence, "none");
  console.log("  PASS  freshness meta uses source_page basis");
}

{
  const keys = PUBLIC_REPORT_FORBIDDEN_KEYS as readonly string[];
  assert.ok(keys.includes("source_page_url"));
  assert.ok(keys.includes("source_anchor_text"));
  assert.ok(keys.includes("source_institution_homepage"));
  console.log("  PASS  public report forbids source page URLs");
}

{
  const migration = source("db/migrations/012_official_site_source_evidence.sql");
  assert.ok(migration.includes("source_page_url"));
  assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
  console.log("  PASS  migration 012 adds evidence columns + RLS");
}

console.log("\nofficial-site-source-page-check: ok");
