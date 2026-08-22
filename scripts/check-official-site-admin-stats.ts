/**
 * Admin collector stats must separate today official-site vs accumulated totals.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Official Site Admin Stats Check]\n");

{
  const types = source("lib/collector/types.ts");
  assert.ok(types.includes("todayDateUnknownHold"));
  assert.ok(types.includes("totalDateUnknownHold"));
  assert.ok(types.includes("todayRecentEligible"));
  assert.ok(types.includes("totalRecentEligible"));
  assert.ok(types.includes("todayDateUnknownHoldRatio"));
  assert.ok(types.includes("totalDateUnknownHoldRatio"));
  assert.ok(types.includes("realSourcePageRate"));
  assert.ok(types.includes("todayCronCrawled"));
  assert.ok(types.includes("postedDateExtractRate"));
  assert.ok(types.includes("needsReviewSamples"));
  assert.ok(types.includes("sourceComparison"));
  assert.ok(types.includes("estimatedMaxPerDay"));
  console.log("  PASS  summary type has today vs total official-site fields");
}

{
  const queries = source("lib/collector/queries.ts");
  assert.ok(queries.includes("countOfficialSiteFreshnessStats"));
  assert.ok(queries.includes("todayDateUnknownHold"));
  assert.ok(queries.includes("totalDateUnknownHold"));
  assert.ok(queries.includes("countOfficialSiteDiagnosisQueuedToday"));
  console.log("  PASS  admin loader uses official-site-scoped freshness counts");
}

{
  const view = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(view.includes("오늘 날짜 불명 비율"));
  assert.ok(view.includes("전체 날짜 불명 비율"));
  assert.ok(view.includes("오늘 공식 사이트 최근 60일 적격"));
  assert.ok(view.includes("전체 공식 사이트 적격 설문"));
  assert.ok(view.includes("전체 누적 통계"));
  assert.ok(view.includes("source_page_url 저장률"));
  assert.ok(view.includes("seed 오매핑 의심"));
  assert.ok(view.includes("하루 4회"));
  assert.ok(view.includes("회당 최대 8기관"));
  assert.ok(view.includes("cross-origin seed URL"));
  assert.ok(view.includes("needs_review 기관"));
  assert.ok(view.includes("자동 크롤 제외 기관"));
  assert.ok(view.includes("오늘 정상 진단 완료"));
  assert.ok(view.includes("네이버 API와 공식 사이트 비교"));
  console.log("  PASS  admin labels separate today official-site and totals");
}

console.log("\nofficial-site-admin-stats-check: ok");
