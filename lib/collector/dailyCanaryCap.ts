/**
 * Shared daily A/B canary cap across sequential partitions.
 * Partition A and B must NOT each get a full 120 — remaining is computed
 * from prior org runs today (KST).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCanaryDailyCaps,
  isCollectorCanaryEnabled,
} from "@/lib/collector/canaryPolicy";
import type { CapUsageTriple } from "@/lib/collector/partitionCanaryQuota";
import { emptyCapUsageTriple } from "@/lib/collector/partitionCanaryQuota";

/** Prefer `[cap] partition=a A=n B=m AB=k`; also accept legacy without partition. */
const CAP_MARKER =
  /\[cap\](?:\s*partition=(a|b|all))?\s*A=(\d+)\s*B=(\d+)\s*AB=(\d+)/i;
const OUTER_PARTITION = /partition=(a|b|all)/i;

function startOfTodayKstIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00+09:00`).toISOString();
}

export function formatCapMarker(
  a: number,
  b: number,
  partition?: "a" | "b" | "all",
): string {
  if (partition === "a" || partition === "b" || partition === "all") {
    return `[cap] partition=${partition} A=${a} B=${b} AB=${a + b}`;
  }
  return `[cap] A=${a} B=${b} AB=${a + b}`;
}

export function parseCapMarker(text: string | null | undefined): {
  a: number;
  b: number;
  ab: number;
  partition: "a" | "b" | "all" | "unknown";
} | null {
  if (!text) return null;
  const m = text.match(CAP_MARKER);
  if (!m) return null;
  let partition: "a" | "b" | "all" | "unknown" = "unknown";
  if (m[1] === "a" || m[1] === "b" || m[1] === "all") {
    partition = m[1];
  } else {
    const outer = text.match(OUTER_PARTITION);
    if (outer?.[1] === "a" || outer?.[1] === "b" || outer?.[1] === "all") {
      partition = outer[1];
    }
  }
  return {
    a: Number(m[2] || 0),
    b: Number(m[3] || 0),
    ab: Number(m[4] || 0),
    partition,
  };
}

export async function getTodayAbCapUsage(): Promise<{
  aUsed: number;
  bUsed: number;
  abUsed: number;
  runsCounted: number;
  byPartition: { a: CapUsageTriple; b: CapUsageTriple; unknown: CapUsageTriple };
}> {
  const supabase = createSupabaseServerClient();
  const since = startOfTodayKstIso();
  const { data, error } = await supabase
    .from("collection_runs")
    .select("id, error_summary, status, started_at")
    .gte("started_at", since)
    .in("status", ["completed", "failed"])
    .order("started_at", { ascending: true })
    .limit(50);

  const byPartition = {
    a: emptyCapUsageTriple(),
    b: emptyCapUsageTriple(),
    unknown: emptyCapUsageTriple(),
  };

  if (error) {
    console.error("[collector] getTodayAbCapUsage", error.message);
    return { aUsed: 0, bUsed: 0, abUsed: 0, runsCounted: 0, byPartition };
  }

  let aUsed = 0;
  let bUsed = 0;
  let runsCounted = 0;
  for (const row of data || []) {
    const parsed = parseCapMarker(row.error_summary);
    if (!parsed) continue;
    aUsed += parsed.a;
    bUsed += parsed.b;
    runsCounted += 1;
    const bucket =
      parsed.partition === "a" || parsed.partition === "b"
        ? byPartition[parsed.partition]
        : byPartition.unknown;
    bucket.a += parsed.a;
    bucket.b += parsed.b;
    bucket.ab += parsed.ab;
  }
  return { aUsed, bUsed, abUsed: aUsed + bUsed, runsCounted, byPartition };
}

export async function getRemainingDailyAbCaps(): Promise<{
  maxA: number;
  maxB: number;
  maxAb: number;
  used: {
    aUsed: number;
    bUsed: number;
    abUsed: number;
    runsCounted: number;
    byPartition: {
      a: CapUsageTriple;
      b: CapUsageTriple;
      unknown: CapUsageTriple;
    };
  };
}> {
  const canaryOn = isCollectorCanaryEnabled();
  const base = getCanaryDailyCaps(canaryOn);
  const used = canaryOn
    ? await getTodayAbCapUsage()
    : {
        aUsed: 0,
        bUsed: 0,
        abUsed: 0,
        runsCounted: 0,
        byPartition: {
          a: emptyCapUsageTriple(),
          b: emptyCapUsageTriple(),
          unknown: emptyCapUsageTriple(),
        },
      };

  return {
    maxA: Math.max(0, base.maxA - used.aUsed),
    maxB: Math.max(0, base.maxB - used.bUsed),
    maxAb: Math.max(0, base.maxAb - used.abUsed),
    used,
  };
}
