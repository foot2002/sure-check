/**
 * Auto-diagnosis dispatcher is enqueue-only: no page fetch, no inline scan.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { triageCandidate } from "../lib/collector/candidateTriage";
import {
  candidateFetchPageSize,
  filterAndSortEligible,
  isEligibleTriage,
} from "../lib/collector/diagnosisBridge";
import { getKstDayBounds } from "../lib/collector/diagnosisLinkRepository";
import type { CollectorPlatform } from "../lib/collector/types";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Auto Diagnosis Dispatch Check]\n");

{
  const bridge = source("lib/collector/diagnosisBridge.ts");
  assert.ok(!bridge.includes("checkSurveyFreshnessAndAvailability"));
  assert.ok(!bridge.includes("precheckBeforeDiagnosisEnqueue"));
  assert.ok(bridge.includes("enqueueOnly: true"));
  assert.ok(!/processInline:\s*Boolean\(input\?\.processInline\)/.test(bridge));
  console.log("  PASS  dispatcher does not open pages or run inline diagnosis");
}

{
  assert.equal(candidateFetchPageSize(3), 20);
  assert.equal(candidateFetchPageSize(20), 60);
  console.log("  PASS  candidate page size is limit*3 with floor 20");
}

{
  const route = source("app/api/internal/collector/diagnosis-dispatch/route.ts");
  assert.ok(route.includes("processInline: false"));
  assert.ok(/maxDuration = (60|120|300)/.test(route));
  assert.ok(!route.includes("inlineParam"));
  console.log("  PASS  HTTP dispatcher is enqueue-only");
}

{
  const start = source("lib/jobs/startUrlScanJob.ts");
  assert.ok(start.includes("enqueueOnly"));
  assert.ok(start.includes("if (!input.enqueueOnly)"));
  console.log("  PASS  startUrlScanJob can enqueue without processScanJob");
}

{
  const publicA = triageCandidate({
    sourceTitle: "송파구청 만족도 조사",
    sourceUrl: "https://www.songpa.go.kr/x",
    sortMode: "date",
    firstSeenThisRun: true,
  });
  assert.equal(isEligibleTriage({ ...publicA, queue: "A_PRIORITY", organization: "public" }), true);

  const eligible = filterAndSortEligible([
    {
      id: "active-ok",
      canonicalUrl: "https://forms.gle/ok",
      platform: "google_forms" as CollectorPlatform,
      title: "송파구청 만족도",
      status: "active",
      triage: { ...publicA, queue: "A_PRIORITY", organization: "public" },
    },
    {
      id: "closed",
      canonicalUrl: "https://forms.gle/closed",
      platform: "google_forms" as CollectorPlatform,
      title: "송파구청 만족도",
      status: "closed",
      triage: { ...publicA, queue: "A_PRIORITY", organization: "public" },
    },
    {
      id: "restricted",
      canonicalUrl: "https://forms.gle/restricted",
      platform: "google_forms" as CollectorPlatform,
      title: "송파구청 만족도",
      status: "restricted",
      triage: { ...publicA, queue: "A_PRIORITY", organization: "public" },
    },
    {
      id: "discovered",
      canonicalUrl: "https://forms.gle/disc",
      platform: "google_forms" as CollectorPlatform,
      title: "송파구청 만족도",
      status: "discovered",
      triage: { ...publicA, queue: "A_PRIORITY", organization: "public" },
    },
    {
      id: "stale",
      canonicalUrl: "https://forms.gle/stale",
      platform: "google_forms" as CollectorPlatform,
      title: "송파구청 만족도",
      status: "active",
      triage: { ...publicA, queue: "A_PRIORITY", organization: "public" },
      freshness: { freshness_status: "stale_candidate", should_diagnose: false },
    },
  ]);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]!.surveyLinkId, "active-ok");
  console.log("  PASS  closed/restricted/stale/discovered are not queued");
}

{
  const bounds = getKstDayBounds(new Date("2026-08-20T04:00:00.000Z"));
  assert.equal(bounds.kstDate, "2026-08-20");
  assert.equal(bounds.startUtcIso, "2026-08-19T15:00:00.000Z");
  console.log("  PASS  today-attempt window is KST day (queued included by created_at)");
}

{
  const bridge = source("lib/collector/diagnosisBridge.ts");
  assert.ok(bridge.includes("candidateFetchPageSize"));
  assert.ok(bridge.includes("findScanJobsByCacheKeys"));
  assert.ok(bridge.includes("insertDiagnosisLinks"));
  assert.ok(!bridge.includes("fetchLimit * 50"));
  assert.ok(!bridge.includes("findRunningScanByCacheKey"));
  assert.ok(!bridge.includes("findAnyCompletedScanByCacheKey"));
  assert.ok(!bridge.includes("checkSurveyFreshnessAndAvailability"));
  console.log("  PASS  dispatcher uses paged fetch + bulk scan_job lookups");
}

{
  const queries = source("lib/collector/queries.ts");
  assert.ok(queries.includes("attempted: today.total"));
  assert.ok(queries.includes("queued: today.byStatus.queued"));
  console.log("  PASS  admin today attempts include queued/running/skipped/failed");
}

console.log("\nresult: PASS");
