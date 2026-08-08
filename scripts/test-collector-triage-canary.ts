/**
 * Quick unit checks for triage demotion, survey-owner, canary caps, C promotion.
 */
import assert from "node:assert/strict";
import {
  applyCanaryAbCaps,
  bestTriageAcrossSources,
  compareRecencyForValidation,
  triageCandidate,
} from "../lib/collector/candidateTriage";
import { getCanaryDailyCaps } from "../lib/collector/canaryPolicy";
import { evidenceReviewLabel } from "../lib/collector/independentReview";
import { resolveCollectorSearchStrategy } from "../lib/collector/searchQueries";

function t(partial: Parameters<typeof triageCandidate>[0]) {
  return triageCandidate(partial);
}

// Strategy env aliases (org_v1.2 → internal org_v1)
{
  const prev = process.env.COLLECTOR_SEARCH_STRATEGY;
  process.env.COLLECTOR_SEARCH_STRATEGY = "org_v1.2";
  assert.equal(resolveCollectorSearchStrategy(), "org_v1");
  process.env.COLLECTOR_SEARCH_STRATEGY = "legacy";
  assert.equal(resolveCollectorSearchStrategy(), "legacy");
  delete process.env.COLLECTOR_SEARCH_STRATEGY;
  assert.equal(resolveCollectorSearchStrategy(), "legacy");
  if (prev === undefined) delete process.env.COLLECTOR_SEARCH_STRATEGY;
  else process.env.COLLECTOR_SEARCH_STRATEGY = prev;
}

// Academic hard → C
{
  const r = t({
    sourceTitle: "석사 논문 연구 참여자 모집 설문",
    sourceUrl: "https://blog.naver.com/x/1",
  });
  assert.equal(r.organization, "individual_or_academic");
  assert.equal(r.queue, "C_ARCHIVE");
}

// University official kept
{
  const r = t({
    sourceTitle: "OO대학교 산학협력단 사업 참가자 만족도 조사",
    sourceUrl: "https://www.ac.kr/notice",
  });
  assert.equal(r.organization, "university_official");
  assert.notEqual(r.queue, "C_ARCHIVE");
}

// Personal blog sharing company brand → company (survey owner)
{
  const r = t({
    sourceTitle: "메가박스 고객만족 이벤트 응모",
    sourceUrl: "https://blog.naver.com/fan/123",
    description: "브랜드 설문 참여하고 경품 응모하세요",
  });
  assert.equal(r.organization, "company");
  assert.ok(r.organizationSignals.includes("personal_source_company_owner"));
}

// Recency order
assert.ok(compareRecencyForValidation("recent_high", "likely_old") < 0);
assert.ok(compareRecencyForValidation("unknown", "likely_old") < 0);

// Canary caps A-first
{
  const caps = getCanaryDailyCaps(true);
  assert.deepEqual(caps, { maxA: 100, maxB: 20, maxAb: 120 });
  const a = Array.from({ length: 140 }, (_, i) => ({
    id: `a${i}`,
    triage: t({
      sourceTitle: `중랑구 만족도 조사 ${i}`,
      sourceUrl: "https://www.jungnang.go.kr/x",
      sortMode: "date" as const,
      firstSeenThisRun: true,
    }),
  }));
  const b = Array.from({ length: 50 }, (_, i) => ({
    id: `b${i}`,
    triage: {
      ...t({
        sourceTitle: `기업 상담 신청 ${i}`,
        sourceUrl: "https://example.co.kr/x",
        sortMode: "sim" as const,
      }),
      queue: "B_PRIORITY" as const,
    },
  }));
  // Force A/B queues for cap math
  for (const x of a) {
    (x.triage as { queue: string }).queue = "A_PRIORITY";
  }
  const { cappedAB, counts } = applyCanaryAbCaps(a, b, caps);
  assert.equal(counts.A_PRIORITY, 100);
  assert.equal(counts.B_PRIORITY, 20);
  assert.equal(cappedAB.length, 120);
}

// C promotion via best source
{
  const best = bestTriageAcrossSources([
    {
      sourceTitle: "개인 블로그 스크랩",
      sourceUrl: "https://blog.naver.com/x/1",
      description: "링크 공유",
    },
    {
      sourceTitle: "송파구청 주민 만족도 조사",
      sourceUrl: "https://www.songpa.go.kr/notice/1",
      sortMode: "date",
      firstSeenThisRun: true,
    },
  ]);
  assert.equal(best.organization, "public");
  assert.equal(best.queue, "A_PRIORITY");
}

// Independent evidence: personal share + brand = company
{
  const ev = evidenceReviewLabel({
    sourceUrl: "https://blog.naver.com/x/1",
    sourceTitle: "산돌 고객 만족도 조사 링크",
    snippet: "브랜드 설문",
  });
  assert.equal(ev.label, "company");
  assert.equal(ev.sourceIsPersonalShare, true);
  assert.equal(ev.surveyOwnerLikelyOfficial, true);
}

console.log("test-collector-triage-canary: ok");
