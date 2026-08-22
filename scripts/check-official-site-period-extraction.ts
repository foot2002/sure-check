/**
 * Official-site period / deadline extraction and stale handling.
 */
import assert from "node:assert/strict";
import { extractOfficialPageDates } from "../lib/collector/officialSiteEvidence";
import {
  evaluateSurveyFreshness,
  extractSurveyDateSignals,
  getKstParts,
} from "../lib/collector/surveyFreshness";

console.log("[Official Site Period Extraction Check]\n");
const kst = getKstParts();

{
  const dotted = extractSurveyDateSignals("신청기간 2026.08.01 ~ 2026.08.31");
  assert.equal(dotted.start, "2026-08-01");
  assert.equal(dotted.end, "2026-08-31");
  const iso = extractSurveyDateSignals("접수기간 2026-08-01 ~ 2026-08-31");
  assert.equal(iso.start, "2026-08-01");
  const korean = extractSurveyDateSignals("모집기간 2026년 8월 1일 ~ 8월 31일");
  assert.equal(korean.start, "2026-08-01");
  assert.equal(korean.end, "2026-08-31");
  const until = extractSurveyDateSignals("응답기간 2026.8.1.부터 2026.8.31.까지");
  assert.equal(until.start, "2026-08-01");
  assert.equal(until.end, "2026-08-31");
  const weekday = extractSurveyDateSignals("참여기간 8.1.(목) ~ 8.31.(토)");
  assert.equal(weekday.start, `${kst.year}-08-01`);
  assert.equal(weekday.end, `${kst.year}-08-31`);
  console.log("  PASS  period keywords and formats");
}

{
  const page = extractOfficialPageDates(`
    <html><body>
      <p>접수마감 2026.08.31</p>
      <p>설문기간 2026.08.01 ~ 2026.08.31</p>
    </body></html>
  `);
  assert.ok(page.deadline === "2026-08-31" || page.periodEnd === "2026-08-31");
  console.log("  PASS  deadline extraction");
}

{
  const stale = evaluateSurveyFreshness({
    title: "지난 조사",
    snippet: "운영기간 2024.01.01 ~ 2024.01.31",
    url: "https://forms.gle/stale-period",
    mode: "search",
  });
  assert.equal(stale.shouldDiagnose, false);
  assert.ok(stale.reasonCode === "end_date_passed" || stale.status === "closed");
  console.log("  PASS  stale period handling");
}

{
  const unknown = evaluateSurveyFreshness({
    title: "구청 안내",
    snippet: "아래 링크",
    pageText: "현재 접수 중 현재 진행 중",
    url: "https://forms.gle/hold",
    mode: "page",
    confirmedLive: true,
  });
  assert.equal(unknown.shouldDiagnose, false);
  assert.equal(unknown.reasonCode, "date_unknown_hold");
  console.log("  PASS  date unknown hold retained without nearby date evidence");
}

console.log("\nofficial-site-period-extraction-check: ok");
