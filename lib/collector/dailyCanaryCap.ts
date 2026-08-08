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

const CAP_MARKER = /\[cap\]\s*A=(\d+)\s*B=(\d+)\s*AB=(\d+)/i;

function startOfTodayKstIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00+09:00`).toISOString();
}

export function formatCapMarker(a: number, b: number): string {
  return `[cap] A=${a} B=${b} AB=${a + b}`;
}

export function parseCapMarker(text: string | null | undefined): {
  a: number;
  b: number;
  ab: number;
} | null {
  if (!text) return null;
  const m = text.match(CAP_MARKER);
  if (!m) return null;
  return {
    a: Number(m[1] || 0),
    b: Number(m[2] || 0),
    ab: Number(m[3] || 0),
  };
}

export async function getTodayAbCapUsage(): Promise<{
  aUsed: number;
  bUsed: number;
  abUsed: number;
  runsCounted: number;
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

  if (error) {
    console.error("[collector] getTodayAbCapUsage", error.message);
    return { aUsed: 0, bUsed: 0, abUsed: 0, runsCounted: 0 };
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
  }
  return { aUsed, bUsed, abUsed: aUsed + bUsed, runsCounted };
}

export async function getRemainingDailyAbCaps(): Promise<{
  maxA: number;
  maxB: number;
  maxAb: number;
  used: { aUsed: number; bUsed: number; abUsed: number; runsCounted: number };
}> {
  const canaryOn = isCollectorCanaryEnabled();
  const base = getCanaryDailyCaps(canaryOn);
  const used = canaryOn
    ? await getTodayAbCapUsage()
    : { aUsed: 0, bUsed: 0, abUsed: 0, runsCounted: 0 };

  return {
    maxA: Math.max(0, base.maxA - used.aUsed),
    maxB: Math.max(0, base.maxB - used.bUsed),
    maxAb: Math.max(0, base.maxAb - used.abUsed),
    used,
  };
}
