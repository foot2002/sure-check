/**
 * Unit tests for collector diagnosis bridge eligibility / diversity / limits.
 */
import assert from "node:assert/strict";
import { triageCandidate } from "../lib/collector/candidateTriage";
import {
  COLLECTOR_DIAGNOSIS_DAILY_MAX,
  COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
  COLLECTOR_DIAGNOSIS_BACKPRESSURE_PENDING,
  filterAndSortEligible,
  isEligibleTriage,
  pickWithPlatformDiversity,
} from "../lib/collector/diagnosisBridge";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "../lib/collector/cronAuth";
import { getKstDayBounds } from "../lib/collector/diagnosisLinkRepository";
import type { CollectorPlatform } from "../lib/collector/types";

function makeTriage(partial: Parameters<typeof triageCandidate>[0]) {
  return triageCandidate(partial);
}

// A_PRIORITY public recent → eligible
{
  const t = makeTriage({
    sourceTitle: "중랑구청 주민 만족도 조사",
    sourceUrl: "https://www.jungnang.go.kr/notice/1",
    sortMode: "date",
    firstSeenThisRun: true,
  });
  assert.equal(t.queue, "A_PRIORITY");
  assert.ok(isEligibleTriage(t));
}

// Academic → not eligible
{
  const t = makeTriage({
    sourceTitle: "석사 논문 연구 참여자 모집 설문",
    sourceUrl: "https://blog.naver.com/x/1",
  });
  assert.ok(t.queue === "C_ARCHIVE" || t.organization === "individual_or_academic");
  assert.equal(isEligibleTriage(t), false);
}

// filterAndSortEligible drops non-active and C
{
  const publicA = makeTriage({
    sourceTitle: "송파구청 만족도 조사",
    sourceUrl: "https://www.songpa.go.kr/x",
    sortMode: "date",
    firstSeenThisRun: true,
  });
  const rows = [
    {
      id: "1",
      canonicalUrl: "https://forms.gle/aaa",
      platform: "google_forms" as CollectorPlatform,
      title: "a",
      status: "active",
      triage: {
        ...publicA,
        queue: "A_PRIORITY" as const,
        organization: "public" as const,
      },
    },
    {
      id: "2",
      canonicalUrl: "https://forms.gle/bbb",
      platform: "google_forms" as CollectorPlatform,
      title: "b",
      status: "closed",
      triage: {
        ...publicA,
        queue: "A_PRIORITY" as const,
        organization: "public" as const,
      },
    },
    {
      id: "3",
      canonicalUrl: "https://forms.gle/ccc",
      platform: "moaform" as CollectorPlatform,
      title: "c",
      status: "active",
      triage: {
        ...publicA,
        queue: "C_ARCHIVE" as const,
        organization: "individual_or_academic" as const,
      },
    },
  ];
  const eligible = filterAndSortEligible(rows);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]!.surveyLinkId, "1");
}

// Platform diversity pick
{
  const base = makeTriage({
    sourceTitle: "중랑구청 만족도",
    sourceUrl: "https://www.jungnang.go.kr/x",
    sortMode: "date",
    firstSeenThisRun: true,
  });
  const candidates = (
    [
      ["g1", "google_forms"],
      ["g2", "google_forms"],
      ["n1", "naver_form"],
      ["m1", "moaform"],
    ] as const
  ).map(([id, platform], i) => ({
    surveyLinkId: id,
    canonicalUrl: `https://example.com/${id}`,
    platform: platform as CollectorPlatform,
    title: id,
    triage: {
      ...base,
      queue: "A_PRIORITY" as const,
      organization: "public" as const,
      recency: (i === 0 ? "recent_high" : "recent_possible") as const,
    },
    scanCacheKey: id,
    normalizedScanUrl: `https://example.com/${id}`,
  }));
  const picked = pickWithPlatformDiversity(candidates, 3);
  assert.equal(picked.length, 3);
  const plats = new Set(picked.map((p) => p.platform));
  assert.ok(plats.has("google_forms"));
  assert.ok(plats.has("naver_form"));
  assert.ok(plats.has("moaform"));
}

assert.equal(COLLECTOR_DIAGNOSIS_DISPATCH_MAX, 10);
assert.equal(COLLECTOR_DIAGNOSIS_BACKPRESSURE_PENDING, 10);
assert.equal(COLLECTOR_DIAGNOSIS_DAILY_MAX, 100);

// KST day bounds: 2026-08-08 17:30Z is still KST Aug 9 02:30 → day starts 08-08 15:00Z
{
  const bounds = getKstDayBounds(new Date("2026-08-08T17:30:00.000Z"));
  assert.equal(bounds.kstDate, "2026-08-09");
  assert.equal(bounds.startUtcIso, "2026-08-08T15:00:00.000Z");
  assert.equal(bounds.endUtcIso, "2026-08-09T15:00:00.000Z");
}
{
  const bounds = getKstDayBounds(new Date("2026-08-08T14:59:59.000Z"));
  assert.equal(bounds.kstDate, "2026-08-08");
  assert.equal(bounds.startUtcIso, "2026-08-07T15:00:00.000Z");
}

assert.equal(typeof authorizeCollectorCronRequest, "function");
assert.equal(typeof isCollectorCronAuthConfigured, "function");
authorizeCollectorCronRequest(new Request("http://localhost/x"));

console.log("test-collector-diagnosis-bridge: ok");
