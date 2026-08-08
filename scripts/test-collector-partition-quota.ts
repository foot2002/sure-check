/**
 * Unit tests: partition canary quotas + phaseTiming wall vs aggregate.
 */
import assert from "node:assert/strict";
import {
  applyCanaryAbCaps,
  triageCandidate,
} from "../lib/collector/candidateTriage";
import { getCanaryDailyCaps } from "../lib/collector/canaryPolicy";
import {
  formatCapMarker,
  parseCapMarker,
} from "../lib/collector/dailyCanaryCap";
import {
  assertPartitionQuotasFitDaily,
  COLLECTOR_PARTITION_CANARY_QUOTAS,
  emptyCapUsageTriple,
  resolvePartitionCanaryCaps,
} from "../lib/collector/partitionCanaryQuota";
import {
  addAggregateWorkerMs,
  createPhaseTiming,
  finalizePhaseTiming,
  timePhase,
  topPhase,
} from "../lib/collector/phaseTiming";

assert.equal(assertPartitionQuotasFitDaily(), true);
assert.deepEqual(COLLECTOR_PARTITION_CANARY_QUOTAS.a, {
  maxA: 70,
  maxB: 10,
  maxAb: 80,
});
assert.deepEqual(COLLECTOR_PARTITION_CANARY_QUOTAS.b, {
  maxA: 30,
  maxB: 10,
  maxAb: 40,
});

const daily = getCanaryDailyCaps(true);
assert.deepEqual(daily, { maxA: 100, maxB: 20, maxAb: 120 });

// Fresh day: A cannot invade B reservation
{
  const aCaps = resolvePartitionCanaryCaps({
    partition: "a",
    remainingDaily: daily,
    usedByPartition: { a: emptyCapUsageTriple(), b: emptyCapUsageTriple() },
    canaryEnabled: true,
  });
  assert.deepEqual(
    { maxA: aCaps.maxA, maxB: aCaps.maxB, maxAb: aCaps.maxAb },
    { maxA: 70, maxB: 10, maxAb: 80 },
  );
  assert.deepEqual(aCaps.reservedOther, { maxA: 30, maxB: 10, maxAb: 40 });
}

// After A used 70/10: B still gets 30/10/40
{
  const remaining = { maxA: 30, maxB: 10, maxAb: 40 };
  const bCaps = resolvePartitionCanaryCaps({
    partition: "b",
    remainingDaily: remaining,
    usedByPartition: {
      a: { a: 70, b: 10, ab: 80 },
      b: emptyCapUsageTriple(),
    },
    canaryEnabled: true,
  });
  assert.deepEqual(
    { maxA: bCaps.maxA, maxB: bCaps.maxB, maxAb: bCaps.maxAb },
    { maxA: 30, maxB: 10, maxAb: 40 },
  );
}

// A underfills: still cannot take B's reserved slot
{
  const remaining = { maxA: 60, maxB: 15, maxAb: 75 }; // A only used 40/5
  const aAgain = resolvePartitionCanaryCaps({
    partition: "a",
    remainingDaily: remaining,
    usedByPartition: {
      a: { a: 40, b: 5, ab: 45 },
      b: emptyCapUsageTriple(),
    },
    canaryEnabled: true,
  });
  // myLeft A=30/5/35; otherLeft B=30/10/40; min → 30,5,35 but B reserve clips A to maxA=min(30,60-30)=30
  assert.equal(aAgain.maxA, 30);
  assert.equal(aAgain.maxB, 5);
  assert.equal(aAgain.maxAb, 35);
  // Remaining still protects B's 30/10/40
  const bCaps = resolvePartitionCanaryCaps({
    partition: "b",
    remainingDaily: {
      maxA: remaining.maxA - aAgain.maxA,
      maxB: remaining.maxB - aAgain.maxB,
      maxAb: remaining.maxAb - aAgain.maxAb,
    },
    usedByPartition: {
      a: { a: 70, b: 10, ab: 80 },
      b: emptyCapUsageTriple(),
    },
    canaryEnabled: true,
  });
  assert.ok(bCaps.maxA <= 30);
  assert.ok(bCaps.maxB <= 10);
  assert.ok(bCaps.maxAb <= 40);
}

// Daily crumbs with neither partition attributed: reservation may zero both — acceptable.
{
  const tiny = resolvePartitionCanaryCaps({
    partition: "a",
    remainingDaily: { maxA: 5, maxB: 2, maxAb: 6 },
    usedByPartition: { a: emptyCapUsageTriple(), b: emptyCapUsageTriple() },
    canaryEnabled: true,
  });
  assert.equal(tiny.maxA, 0);
}

// Daily ceiling still binds when remaining is below partition quota
{
  const aCaps = resolvePartitionCanaryCaps({
    partition: "a",
    remainingDaily: { maxA: 50, maxB: 8, maxAb: 55 },
    usedByPartition: {
      a: emptyCapUsageTriple(),
      b: { a: 30, b: 10, ab: 40 }, // B already took its allotment
    },
    canaryEnabled: true,
  });
  assert.deepEqual(
    { maxA: aCaps.maxA, maxB: aCaps.maxB, maxAb: aCaps.maxAb },
    { maxA: 50, maxB: 8, maxAb: 55 },
  );
}

// applyCanaryAbCaps respects partition-resolved A70/B10
{
  const aItems = Array.from({ length: 100 }, (_, i) => ({
    id: `a${i}`,
    triage: {
      ...triageCandidate({
        sourceTitle: `중랑구 만족도 ${i}`,
        sourceUrl: "https://www.jungnang.go.kr/x",
      }),
      queue: "A_PRIORITY" as const,
    },
  }));
  const bItems = Array.from({ length: 40 }, (_, i) => ({
    id: `b${i}`,
    triage: {
      ...triageCandidate({
        sourceTitle: `기업 설문 ${i}`,
        sourceUrl: "https://corp.example/x",
      }),
      queue: "B_PRIORITY" as const,
    },
  }));
  const caps = resolvePartitionCanaryCaps({
    partition: "a",
    remainingDaily: daily,
    usedByPartition: { a: emptyCapUsageTriple(), b: emptyCapUsageTriple() },
    canaryEnabled: true,
  });
  const { counts, cappedAB } = applyCanaryAbCaps(aItems, bItems, caps);
  assert.equal(counts.A_PRIORITY, 70);
  assert.equal(counts.B_PRIORITY, 10);
  assert.equal(cappedAB.length, 80);

  const afterA = {
    maxA: daily.maxA - counts.A_PRIORITY,
    maxB: daily.maxB - counts.B_PRIORITY,
    maxAb: daily.maxAb - cappedAB.length,
  };
  const bCaps = resolvePartitionCanaryCaps({
    partition: "b",
    remainingDaily: afterA,
    usedByPartition: {
      a: {
        a: counts.A_PRIORITY,
        b: counts.B_PRIORITY,
        ab: cappedAB.length,
      },
      b: emptyCapUsageTriple(),
    },
    canaryEnabled: true,
  });
  const bApplied = applyCanaryAbCaps(aItems, bItems, bCaps);
  assert.equal(bApplied.counts.A_PRIORITY, 30);
  assert.equal(bApplied.counts.B_PRIORITY, 10);
  assert.equal(bApplied.cappedAB.length, 40);

  // Daily totals never exceed 100/20/120
  assert.ok(counts.A_PRIORITY + bApplied.counts.A_PRIORITY <= 100);
  assert.ok(counts.B_PRIORITY + bApplied.counts.B_PRIORITY <= 20);
  assert.ok(cappedAB.length + bApplied.cappedAB.length <= 120);
}

// Cap marker parse round-trip with partition
{
  const text = formatCapMarker(70, 10, "a");
  assert.equal(text, "[cap] partition=a A=70 B=10 AB=80");
  const parsed = parseCapMarker(
    `[org_v1.2] partition=a ${text} elapsedMs=1`,
  );
  assert.ok(parsed);
  assert.equal(parsed!.partition, "a");
  assert.equal(parsed!.a, 70);
  assert.equal(parsed!.b, 10);

  const legacy = parseCapMarker(
    "[org_v1.2] partition=a [cap] A=100 B=20 AB=120 inline=0",
  );
  assert.ok(legacy);
  assert.equal(legacy!.partition, "a");
  assert.equal(legacy!.a, 100);
}

// phaseTiming: concurrent workers inflate aggregate, not wall
async function testPhaseTimingWallVsAggregate() {
  const timing = createPhaseTiming();
  await timePhase(timing, "db_upsert", async () => {
    await Promise.all([
      (async () => {
        const t0 = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        addAggregateWorkerMs(timing, "db_upsert", Date.now() - t0);
      })(),
      (async () => {
        const t0 = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        addAggregateWorkerMs(timing, "db_upsert", Date.now() - t0);
      })(),
    ]);
  });
  finalizePhaseTiming(timing);
  assert.ok(timing.phaseWallMs.db_upsert < 100, `wall=${timing.phaseWallMs.db_upsert}`);
  assert.ok(
    timing.aggregateWorkerMs.db_upsert >= 60,
    `agg=${timing.aggregateWorkerMs.db_upsert}`,
  );
  assert.ok(timing.aggregateWorkerMs.db_upsert > timing.phaseWallMs.db_upsert);
  assert.equal(topPhase(timing), "db_upsert");
}

testPhaseTimingWallVsAggregate()
  .then(() => {
    console.log("test-collector-partition-quota: ok");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
