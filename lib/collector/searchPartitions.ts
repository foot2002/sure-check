/**
 * org_v1.2 search partitions — keep total search volume, split wall-clock
 * across sequential Vercel invocations (never concurrent).
 *
 * A: public / university + Google·Naver forms + date-first
 * B: company / moaform / mixed + sim + deep pages
 */

import {
  buildCollectorSearchQueries,
  type CollectorSearchQuery,
} from "@/lib/collector/searchQueries";
import { COLLECTOR_MAX_API_CALLS } from "@/lib/collector/config";

export type CollectorPartition = "a" | "b" | "all";

export function parseCollectorPartition(
  value: string | null | undefined,
): CollectorPartition {
  const v = (value || "all").trim().toLowerCase();
  if (v === "a" || v === "partition_a" || v === "part-a") return "a";
  if (v === "b" || v === "partition_b" || v === "part-b") return "b";
  return "all";
}

function assignPartition(q: CollectorSearchQuery): "a" | "b" {
  // B first: company / moaform / platform / sim-mixed / deep-company
  if (q.organizationIntent === "company") return "b";
  if (q.organizationIntent === "platform_focus") return "b";
  if (q.formPlatform === "moaform.com/q") return "b";
  if (q.strategyGroup === "sim_relevance" && q.organizationIntent === "mixed") {
    return "b";
  }
  if (q.strategyGroup === "deep_seed" && q.organizationIntent === "mixed") {
    return "b";
  }
  // A: public / university / date-first Google·Naver
  if (
    q.organizationIntent === "public" ||
    q.organizationIntent === "university_official"
  ) {
    return "a";
  }
  if (
    q.strategyGroup === "date_breadth" &&
    (q.formPlatform === "forms.gle" ||
      q.formPlatform === "docs.google.com/forms" ||
      q.formPlatform === "form.naver.com" ||
      q.formPlatform === "naver.me")
  ) {
    return "a";
  }
  return "b";
}

function isPartitionA(q: CollectorSearchQuery): boolean {
  return assignPartition(q) === "a";
}

function isPartitionB(q: CollectorSearchQuery): boolean {
  return assignPartition(q) === "b";
}

/**
 * API budget per partition when running split (sum ≈ full org_v1.2 budget).
 * A gets slightly more (public priority); B keeps deep/sim/company/moaform.
 */
export function getPartitionApiBudget(
  partition: CollectorPartition,
): { maxApiCalls: number; deepReserve: number; inlineBudget: number } {
  if (partition === "a") {
    return { maxApiCalls: 20, deepReserve: 2, inlineBudget: 12 };
  }
  if (partition === "b") {
    return { maxApiCalls: 16, deepReserve: 4, inlineBudget: 8 };
  }
  return {
    maxApiCalls: COLLECTOR_MAX_API_CALLS,
    deepReserve: Math.max(1, Math.floor(COLLECTOR_MAX_API_CALLS * 0.2)),
    inlineBudget: 40,
  };
}

/** Soft wall-clock target per partition (leave headroom under 120s). */
export const COLLECTOR_PARTITION_RUNTIME_TARGET_MS = 60_000;
export const COLLECTOR_PARTITION_RUNTIME_MAX_MS = 75_000;

/**
 * Select page-1 queries for a partition without overlapping ids with the other
 * when both run the same day.
 */
export function selectOrgV1QueriesForPartition(
  partition: CollectorPartition,
  maxApiCalls: number,
  deepReserve: number,
): CollectorSearchQuery[] {
  const all = buildCollectorSearchQueries({ strategy: "org_v1" });
  const breadthBudget = Math.max(1, maxApiCalls - deepReserve);

  if (partition === "all") {
    // Delegate shape: date then sim fill (same as selectOrgV1PageOneQueries)
    const datePool = all.filter(
      (q) =>
        q.strategyGroup === "date_breadth" || q.strategyGroup === "deep_seed",
    );
    const simPool = all.filter((q) => q.strategyGroup === "sim_relevance");
    const selected: CollectorSearchQuery[] = [];
    const used = new Set<string>();
    for (const item of datePool) {
      if (selected.length >= breadthBudget) break;
      if (used.has(item.id)) continue;
      selected.push(item);
      used.add(item.id);
    }
    for (const item of simPool) {
      if (selected.length >= breadthBudget) break;
      if (used.has(item.id)) continue;
      selected.push(item);
      used.add(item.id);
    }
    for (const item of all) {
      if (selected.length >= breadthBudget) break;
      if (used.has(item.id)) continue;
      selected.push(item);
      used.add(item.id);
    }
    return selected;
  }

  const pool =
    partition === "a" ? all.filter(isPartitionA) : all.filter(isPartitionB);

  // Prefer strategy mix within partition
  const preferred =
    partition === "a"
      ? [
          ...pool.filter((q) => q.strategyGroup === "date_breadth"),
          ...pool.filter((q) => q.strategyGroup !== "date_breadth"),
        ]
      : [
          ...pool.filter((q) => q.strategyGroup === "sim_relevance"),
          ...pool.filter((q) => q.strategyGroup === "deep_seed"),
          ...pool.filter(
            (q) =>
              q.strategyGroup !== "sim_relevance" &&
              q.strategyGroup !== "deep_seed",
          ),
        ];

  const selected: CollectorSearchQuery[] = [];
  const used = new Set<string>();
  for (const item of preferred) {
    if (selected.length >= breadthBudget) break;
    if (used.has(item.id)) continue;
    selected.push(item);
    used.add(item.id);
  }
  return selected;
}

export function selectDeepQueriesForPartition(
  partition: CollectorPartition,
  pageOneExecuted: CollectorSearchQuery[],
  limit: number,
): CollectorSearchQuery[] {
  const all = buildCollectorSearchQueries({ strategy: "org_v1" }).filter(
    (q) => q.depthEnabled,
  );
  const pool =
    partition === "all"
      ? all
      : partition === "a"
        ? all.filter(isPartitionA)
        : all.filter(isPartitionB);
  const out: CollectorSearchQuery[] = [];
  const seen = new Set<string>();
  for (const item of [...pageOneExecuted.filter((q) => q.depthEnabled), ...pool]) {
    if (out.length >= limit) break;
    if (seen.has(item.id)) continue;
    if (partition !== "all") {
      if (partition === "a" && !isPartitionA(item)) continue;
      if (partition === "b" && !isPartitionB(item)) continue;
    }
    out.push(item);
    seen.add(item.id);
  }
  return out;
}

export function summarizePartitionQueries(partition: CollectorPartition): {
  partition: CollectorPartition;
  catalogSize: number;
  pageOneSelected: number;
  maxApiCalls: number;
  deepReserve: number;
  inlineBudget: number;
  intents: Record<string, number>;
  platforms: Record<string, number>;
  strategyGroups: Record<string, number>;
} {
  const budget = getPartitionApiBudget(partition);
  const selected = selectOrgV1QueriesForPartition(
    partition,
    budget.maxApiCalls,
    budget.deepReserve,
  );
  const intents: Record<string, number> = {};
  const platforms: Record<string, number> = {};
  const strategyGroups: Record<string, number> = {};
  for (const q of selected) {
    intents[q.organizationIntent || "mixed"] =
      (intents[q.organizationIntent || "mixed"] || 0) + 1;
    platforms[q.formPlatform || "mixed"] =
      (platforms[q.formPlatform || "mixed"] || 0) + 1;
    strategyGroups[q.strategyGroup || "date_breadth"] =
      (strategyGroups[q.strategyGroup || "date_breadth"] || 0) + 1;
  }
  const catalog =
    partition === "all"
      ? buildCollectorSearchQueries({ strategy: "org_v1" }).length
      : buildCollectorSearchQueries({ strategy: "org_v1" }).filter(
          partition === "a" ? isPartitionA : isPartitionB,
        ).length;
  return {
    partition,
    catalogSize: catalog,
    pageOneSelected: selected.length,
    ...budget,
    intents,
    platforms,
    strategyGroups,
  };
}
