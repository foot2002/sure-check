/**
 * Collect metric calculation: date_unknown_hold ratio 0–100%, today vs total.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clampUnitRatio,
  dateUnknownHoldRatios,
  formatUnitPct,
  officialSiteCrawlSplit,
  qualityWarningFlags,
} from "../lib/collector/collectMetrics";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Collect Metric Calculation Check]\n");

{
  assert.equal(clampUnitRatio(1, 0), null);
  assert.equal(clampUnitRatio(3, 10), 0.3);
  assert.equal(clampUnitRatio(411, 70), null);
  assert.equal(formatUnitPct(null), "—");
  assert.equal(formatUnitPct(5.87), "계산 불가");
  assert.equal(formatUnitPct(0.587), "58.7%");
  console.log("  PASS  ratios clamp to 0–100% and reject 587%");
}

{
  const split = dateUnknownHoldRatios({
    todayHold: 1,
    todayFound: 31,
    totalHold: 411,
    totalFound: 700,
  });
  assert.equal(split.today.pctLabel, "3.2%");
  assert.equal(split.total.pctLabel, "58.7%");
  assert.notEqual(split.today.ratio, split.total.ratio);
  console.log("  PASS  today vs total date-unknown ratios stay separate");
}

{
  const crawl = officialSiteCrawlSplit({
    cronInstitutions: 32,
    manualInstitutions: 46,
    totalExplored: 78,
    plannedDaily: 32,
    hasRunRecords: true,
  });
  assert.equal(crawl.exceedsPlan, true);
  assert.equal(crawl.cronInstitutions, 32);
  assert.equal(crawl.manualInstitutions, 46);
  console.log("  PASS  regular vs manual official crawls split");
}

{
  const flags = qualityWarningFlags({
    sourcePageUrlSaveRate: 0.71,
    postedDateExtractRate: 0.09,
    todayDateUnknownHoldRatio: 0.32,
    timeoutToday: 0,
    stuckRunning: 0,
  });
  assert.equal(flags.sourcePageUrlLow, true);
  assert.equal(flags.postedDateLow, true);
  assert.equal(flags.dateUnknownHoldHigh, true);
  console.log("  PASS  quality warning thresholds");
}

{
  const queries = source("lib/collector/queries.ts");
  assert.ok(queries.includes("dateUnknownHoldRatios"));
  assert.ok(queries.includes("todayDateUnknownHoldRatio"));
  assert.ok(queries.includes("totalDateUnknownHoldRatio"));
  assert.ok(!queries.includes("totalDateUnknownHold / officialSurveysForRatio"));
  const view = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(!view.includes("date_unknown_hold 비율"));
  assert.ok(view.includes("오늘 날짜 불명 비율"));
  assert.ok(view.includes("전체 날짜 불명 비율"));
  assert.ok(view.includes("계산 불가") || source("lib/collector/collectMetrics.ts").includes("계산 불가"));
  console.log("  PASS  loader/UI do not mix today and total unknown rates");
}

console.log("\ncollect-metric-calculation-check: ok");
