/**
 * Dispatcher must enqueue recent-eligible surveys only.
 */
import assert from "node:assert/strict";
import { triageCandidate } from "../lib/collector/candidateTriage";
import { AUTO_DIAGNOSIS_TARGET_LANES } from "../lib/collector/collectConfirmedPolicy";
import { filterAndSortEligible } from "../lib/collector/diagnosisBridge";
import { evaluateSurveyFreshness, getKstParts } from "../lib/collector/surveyFreshness";
import type { CollectorPlatform } from "../lib/collector/types";

console.log("[Diagnosis Dispatch Recent-Only Check]\n");

{
  assert.ok(
    !(AUTO_DIAGNOSIS_TARGET_LANES as readonly string[]).includes(
      "active_unknown_date",
    ),
  );
  assert.ok(
    !(AUTO_DIAGNOSIS_TARGET_LANES as readonly string[]).includes(
      "date_unknown_hold",
    ),
  );
  console.log("  PASS  unknown-date lane is not an auto-diagnosis target");
}

const publicA = triageCandidate({
  sourceTitle: "송파구청 만족도 조사",
  sourceUrl: "https://www.songpa.go.kr/x",
  sortMode: "date",
  firstSeenThisRun: true,
});
const triage = { ...publicA, queue: "A_PRIORITY" as const, organization: "public" as const };
const year = getKstParts().year;
const recent = evaluateSurveyFreshness({
  title: `${year} 송파구청 만족도`,
  snippet: "현재 진행 중",
  url: "https://forms.gle/ok",
  mode: "search",
});
const unknown = evaluateSurveyFreshness({
  title: "송파구청 만족도",
  snippet: "아래 링크에서 응답해 주세요",
  url: "https://forms.gle/unknown",
  mode: "page",
  confirmedLive: true,
});
const oldYear = evaluateSurveyFreshness({
  title: "2024학년도 송파구청 만족도",
  snippet: "2024년 조사",
  url: "https://forms.gle/old",
  mode: "search",
});

const eligible = filterAndSortEligible([
  {
    id: "recent-ok",
    canonicalUrl: "https://forms.gle/ok",
    platform: "google_forms" as CollectorPlatform,
    title: `${year} 송파구청 만족도`,
    status: "active",
    triage,
    freshness: recent.record,
  },
  {
    id: "date-unknown",
    canonicalUrl: "https://forms.gle/unknown",
    platform: "google_forms" as CollectorPlatform,
    title: "송파구청 만족도",
    status: "active",
    triage,
    freshness: unknown.record,
  },
  {
    id: "old-year",
    canonicalUrl: "https://forms.gle/old",
    platform: "google_forms" as CollectorPlatform,
    title: "2024학년도 송파구청 만족도",
    status: "active",
    triage,
    freshness: oldYear.record,
  },
]);

assert.equal(eligible.length, 1);
assert.equal(eligible[0]!.surveyLinkId, "recent-ok");
assert.equal(unknown.reasonCode, "date_unknown_hold");
assert.equal(oldYear.shouldDiagnose, false);
console.log("  PASS  dispatcher keeps recent only; old year + date unknown excluded");

console.log("\ndiagnosis-dispatch-recent-only-check: ok");
