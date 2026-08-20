/**
 * Recent 60-day diagnosis eligibility and date_unknown_hold.
 */
import assert from "node:assert/strict";
import {
  evaluateSurveyFreshness,
  getKstParts,
} from "../lib/collector/surveyFreshness";
import { isAutoDiagnosisTarget } from "../lib/collector/collectConfirmedPolicy";

function ymdOffset(days: number, now = new Date()): string {
  const kst = getKstParts(new Date(now.getTime() + days * 24 * 60 * 60 * 1000));
  return kst.ymd;
}

console.log("[Freshness Eligibility Check]\n");
const kst = getKstParts();
const year = kst.year;

{
  const recent = evaluateSurveyFreshness({
    title: `${year} 주민 만족도`,
    snippet: `응답기간 ${ymdOffset(-10).replace(/-/g, ".")} ~ ${ymdOffset(10).replace(/-/g, ".")}`,
    url: "https://forms.gle/recent-window",
    mode: "search",
  });
  assert.equal(recent.shouldDiagnose, true);
  assert.equal(recent.record.diagnosis_eligible_recent, true);
  console.log("  PASS  overlapping period → recent eligible");
}

{
  const oldYear = evaluateSurveyFreshness({
    title: "2024학년도 만족도 조사",
    snippet: "2024년 교육 만족도",
    url: "https://forms.gle/y2024",
    mode: "search",
  });
  assert.equal(oldYear.shouldDiagnose, false);
  assert.ok(
    oldYear.reasonCode === "stale_year" || oldYear.reasonCode === "stale_topic_year",
  );
  console.log("  PASS  2024학년도 excluded");
}

{
  const y2025 = evaluateSurveyFreshness({
    title: "2025년 고객 만족도",
    snippet: "2025년도 사업 평가",
    url: "https://forms.gle/y2025",
    mode: "page",
    confirmedLive: true,
  });
  assert.equal(y2025.shouldDiagnose, false);
  console.log("  PASS  2025 year excluded even if live");
}

{
  const prev = evaluateSurveyFreshness({
    title: "구청 설문",
    snippet: "작년 전년도 지난해 만족도 조사입니다",
    url: "https://forms.gle/prev",
    mode: "search",
  });
  assert.equal(prev.shouldDiagnose, false);
  assert.equal(prev.reasonCode, "previous_year_phrase");
  console.log("  PASS  작년/전년도/지난해 excluded");
}

{
  const unknown = evaluateSurveyFreshness({
    title: "의견 설문",
    snippet: "아래 링크에서 응답해 주세요",
    url: "https://forms.gle/unknown",
    mode: "page",
    confirmedLive: true,
  });
  assert.equal(unknown.shouldDiagnose, false);
  assert.equal(unknown.reasonCode, "date_unknown_hold");
  assert.equal(unknown.record.diagnosis_exclusion_reason, "date_unknown_hold");
  assert.equal(
    isAutoDiagnosisTarget({
      status: unknown.status,
      freshness: unknown.record,
    }),
    false,
  );
  console.log("  PASS  date unknown → date_unknown_hold");
}

{
  const running = evaluateSurveyFreshness({
    title: "수요조사",
    snippet: "현재 진행 중이며 참여 가능합니다",
    url: "https://forms.gle/running",
    mode: "search",
  });
  assert.equal(running.shouldDiagnose, true);
  assert.equal(running.reasonCode, "in_progress_phrase");
  console.log("  PASS  in-progress phrase without old year → eligible");
}

{
  const oldPub = evaluateSurveyFreshness({
    title: "구청 설문",
    snippet: "안내",
    url: "https://forms.gle/oldpub",
    publishedAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString(),
    mode: "search",
  });
  assert.equal(oldPub.shouldDiagnose, false);
  assert.equal(oldPub.reasonCode, "published_too_old");
  console.log("  PASS  published > 60 days excluded");
}

console.log("\nfreshness-eligibility-check: ok");
