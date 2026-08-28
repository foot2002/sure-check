/**
 * Dispatcher sourceType=official_site must not mix search-API candidates.
 * Official-site collected open surveys always enter diagnosis, including
 * date-unknown and old-year rows. Closed/restricted stay excluded.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { triageCandidate } from "../lib/collector/candidateTriage";
import { filterAndSortEligible } from "../lib/collector/diagnosisBridge";
import { evaluateSurveyFreshness, getKstParts } from "../lib/collector/surveyFreshness";
import type { CollectorPlatform } from "../lib/collector/types";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Diagnosis Dispatch Source Filter Check]\n");

{
  const route = source("app/api/internal/collector/diagnosis-dispatch/route.ts");
  assert.ok(route.includes("sourceType"));
  assert.ok(route.includes("official_site"));
  const bridge = source("lib/collector/diagnosisBridge.ts");
  assert.ok(bridge.includes('sourceType === "official_site"'));
  assert.ok(bridge.includes("fetchOfficialSiteSurveyPage"));
  assert.ok(bridge.includes('.in("status", ["active", "stale", "discovered"])'));
  console.log("  PASS  route/bridge accept sourceType=official_site");
}

const publicA = triageCandidate({
  sourceTitle: "송파구청 만족도 조사",
  sourceUrl: "https://www.songpa.go.kr/bbs/view.do",
  sortMode: "date",
  firstSeenThisRun: true,
});
const triage = {
  ...publicA,
  queue: "A_PRIORITY" as const,
  organization: "public" as const,
};
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

const rows = [
  {
    id: "search-recent",
    canonicalUrl: "https://forms.gle/search",
    platform: "google_forms" as CollectorPlatform,
    title: `${year} 검색 수집 만족도`,
    status: "active",
    triage,
    freshness: recent.record,
    sourceTypes: ["web"],
  },
  {
    id: "official-recent",
    canonicalUrl: "https://forms.gle/official",
    platform: "google_forms" as CollectorPlatform,
    title: `${year} 공식 사이트 만족도`,
    status: "active",
    triage,
    freshness: recent.record,
    sourceTypes: ["official_site"],
  },
  {
    id: "official-unknown",
    canonicalUrl: "https://forms.gle/unknown",
    platform: "google_forms" as CollectorPlatform,
    title: "날짜 불명",
    status: "active",
    triage,
    freshness: unknown.record,
    sourceTypes: ["official_site"],
  },
  {
    id: "official-old",
    canonicalUrl: "https://forms.gle/old",
    platform: "google_forms" as CollectorPlatform,
    title: "2024학년도",
    status: "active",
    triage,
    freshness: { ...oldYear.record, old_year_signal: true },
    sourceTypes: ["official_site"],
  },
  {
    id: "official-closed",
    canonicalUrl: "https://forms.gle/closed",
    platform: "google_forms" as CollectorPlatform,
    title: "종료된 구청 설문",
    status: "closed",
    triage,
    freshness: {
      should_diagnose: false,
      diagnosis_eligible_recent: false,
      reason_code: "closed_phrase",
    },
    sourceTypes: ["official_site"],
  },
];

{
  const mixed = filterAndSortEligible(rows);
  assert.ok(mixed.some((row) => row.surveyLinkId === "search-recent"));
  const officialOnly = filterAndSortEligible(rows, { sourceType: "official_site" });
  const officialIds = officialOnly.map((row) => row.surveyLinkId).sort();
  assert.deepEqual(officialIds, [
    "official-old",
    "official-recent",
    "official-unknown",
  ]);
  assert.equal(
    officialOnly.some((row) => row.surveyLinkId === "search-recent"),
    false,
  );
  assert.equal(
    officialOnly.some((row) => row.surveyLinkId === "official-closed"),
    false,
  );
  console.log("  PASS  official_site filter includes unknown/old year, excludes search/closed");
}

console.log("\ndiagnosis-dispatch-source-filter-check: ok");
