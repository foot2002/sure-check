/**
 * Partition-scoped canary quota reservations within the shared daily cap.
 *
 * Daily (canary): A≤100, B≤20, AB≤120
 * Partition A:    A≤70,  B≤10, AB≤80   (public-first)
 * Partition B:    A≤30,  B≤10, AB≤40   (company-first)
 *
 * A must not consume B's reserved allotment even if A underfills its own.
 */

import type { CollectorPartition } from "@/lib/collector/searchPartitions";
import {
  getCanaryDailyCaps,
  isCollectorCanaryEnabled,
} from "@/lib/collector/canaryPolicy";

export type CapTriple = {
  maxA: number;
  maxB: number;
  maxAb: number;
};

export type CapUsageTriple = {
  a: number;
  b: number;
  ab: number;
};

/** Tunable ops constants — adjust after canary quality review. */
export const COLLECTOR_PARTITION_CANARY_QUOTAS = {
  a: { maxA: 70, maxB: 10, maxAb: 80 },
  b: { maxA: 30, maxB: 10, maxAb: 40 },
} as const satisfies Record<"a" | "b", CapTriple>;

export function getPartitionCanaryQuota(
  partition: "a" | "b",
): CapTriple {
  return { ...COLLECTOR_PARTITION_CANARY_QUOTAS[partition] };
}

export function emptyCapUsageTriple(): CapUsageTriple {
  return { a: 0, b: 0, ab: 0 };
}

/**
 * Resolve effective caps for this partition run.
 *
 * - Daily remaining is the hard ceiling (never exceed shared day cap).
 * - Each partition has its own allotment; unused own quota is fine.
 * - Other partition's *remaining* allotment is reserved and not invaded.
 * - partition=all uses full daily remaining (no split).
 */
export function resolvePartitionCanaryCaps(input: {
  partition: CollectorPartition;
  remainingDaily: CapTriple;
  usedByPartition: {
    a: CapUsageTriple;
    b: CapUsageTriple;
  };
  canaryEnabled?: boolean;
}): CapTriple & {
  partitionQuota: CapTriple | null;
  reservedOther: CapTriple;
} {
  const canaryOn =
    input.canaryEnabled ?? isCollectorCanaryEnabled();
  const remaining = {
    maxA: Math.max(0, input.remainingDaily.maxA),
    maxB: Math.max(0, input.remainingDaily.maxB),
    maxAb: Math.max(0, input.remainingDaily.maxAb),
  };

  if (!canaryOn || input.partition === "all") {
    return {
      ...remaining,
      partitionQuota: null,
      reservedOther: { maxA: 0, maxB: 0, maxAb: 0 },
    };
  }

  const mineKey = input.partition;
  const otherKey = mineKey === "a" ? "b" : "a";
  const mine = getPartitionCanaryQuota(mineKey);
  const other = getPartitionCanaryQuota(otherKey);
  const usedMine = input.usedByPartition[mineKey];
  const usedOther = input.usedByPartition[otherKey];

  const myLeft: CapTriple = {
    maxA: Math.max(0, mine.maxA - usedMine.a),
    maxB: Math.max(0, mine.maxB - usedMine.b),
    maxAb: Math.max(0, mine.maxAb - usedMine.ab),
  };
  const otherLeft: CapTriple = {
    maxA: Math.max(0, other.maxA - usedOther.a),
    maxB: Math.max(0, other.maxB - usedOther.b),
    maxAb: Math.max(0, other.maxAb - usedOther.ab),
  };

  return {
    maxA: Math.min(myLeft.maxA, Math.max(0, remaining.maxA - otherLeft.maxA)),
    maxB: Math.min(myLeft.maxB, Math.max(0, remaining.maxB - otherLeft.maxB)),
    maxAb: Math.min(myLeft.maxAb, Math.max(0, remaining.maxAb - otherLeft.maxAb)),
    partitionQuota: mine,
    reservedOther: otherLeft,
  };
}

/** Sanity: partition quotas must fit inside daily canary caps. */
export function assertPartitionQuotasFitDaily(
  daily = getCanaryDailyCaps(true),
): boolean {
  const a = COLLECTOR_PARTITION_CANARY_QUOTAS.a;
  const b = COLLECTOR_PARTITION_CANARY_QUOTAS.b;
  return (
    a.maxA + b.maxA <= daily.maxA &&
    a.maxB + b.maxB <= daily.maxB &&
    a.maxAb + b.maxAb <= daily.maxAb
  );
}
