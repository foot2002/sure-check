/**
 * Official-site posted date extraction: board labels, meta, json-ld, table/dl.
 */
import assert from "node:assert/strict";
import {
  extractOfficialPageDates,
} from "../lib/collector/officialSiteEvidence";
import {
  evaluateSurveyFreshness,
  extractPostedDateYmd,
  getKstParts,
} from "../lib/collector/surveyFreshness";

console.log("[Official Site Date Extraction Check]\n");
const year = getKstParts().year;

{
  assert.equal(extractPostedDateYmd("등록일 2026-08-21"), "2026-08-21");
  assert.equal(extractPostedDateYmd("작성일 2026.08.21"), "2026-08-21");
  assert.equal(extractPostedDateYmd("게시일 2026. 08. 21."), "2026-08-21");
  assert.equal(extractPostedDateYmd("공지일 2026.8.21"), "2026-08-21");
  assert.equal(extractPostedDateYmd("작성날짜 2026년 8월 21일"), "2026-08-21");
  assert.equal(extractPostedDateYmd("최초등록일 2026/08/21"), "2026-08-21");
  assert.equal(extractPostedDateYmd("등록시간 08-21-2026"), "2026-08-21");
  console.log("  PASS  posted date patterns");
}

{
  const meta = extractOfficialPageDates(`
    <html><head>
      <meta property="article:published_time" content="2026-08-21T00:00:00+09:00" />
      <meta name="date" content="2026-08-21" />
    </head><body>
      <time datetime="2026-08-21">등록</time>
      <script type="application/ld+json">{"datePublished":"2026-08-21","dateModified":"2026-08-22"}</script>
      <article><h1>수요조사</h1></article>
      <footer>Copyright 2026</footer>
    </body></html>
  `);
  assert.equal(meta.postedYmd, "2026-08-21");
  console.log("  PASS  meta/time/jsonld extraction");
}

{
  const table = extractOfficialPageDates(`
    <html><body>
      <table><tr><th>등록일</th><td>2026.08.21</td></tr></table>
      <dl><dt>작성일</dt><dd>2026년 8월 21일</dd></dl>
    </body></html>
  `);
  assert.equal(table.postedYmd, "2026-08-21");
  console.log("  PASS  table/dl extraction");
}

{
  const footer = extractOfficialPageDates(`
    <html><body>
      <h1>안내</h1>
      <p>아래 링크에서 응답해 주세요</p>
      <footer>© 2026 공공기관. Copyright 2026</footer>
    </body></html>
  `);
  assert.equal(footer.postedYmd, null);
  const evalFooter = evaluateSurveyFreshness({
    title: "안내",
    snippet: "아래 링크에서 응답해 주세요",
    pageText: "footer Copyright 2026 공공기관",
    url: "https://forms.gle/footer-year",
    mode: "page",
    confirmedLive: true,
  });
  assert.equal(evalFooter.shouldDiagnose, false);
  assert.equal(evalFooter.reasonCode, "date_unknown_hold");
  const yearOnly = evaluateSurveyFreshness({
    title: `${year} 안내`,
    snippet: "홈페이지를 방문해 주세요",
    pageText: `Copyright ${year}`,
    url: "https://forms.gle/year-only",
    mode: "page",
    confirmedLive: true,
  });
  assert.equal(yearOnly.shouldDiagnose, false);
  assert.equal(yearOnly.reasonCode, "date_unknown_hold");
  console.log("  PASS  footer/current-year false positive blocked");
}

console.log("\nofficial-site-date-extraction-check: ok");
