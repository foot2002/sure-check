/**
 * 3-day query performance evaluation from collection_query_stats.
 * Usage: npx tsx scripts/test-collector-query-eval.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { buildCollectorSearchQueries } from "../lib/collector/searchQueries";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]?.trim()) {
        process.env[key] = value;
      }
    }
  }
}

type Agg = {
  searchQuery: string;
  runs: number;
  results: number;
  candidates: number;
  newSurveys: number;
  duplicates: number;
  invalid: number;
  unreachable: number;
  errors: number;
};

function classify(a: Agg): {
  tier: "keep" | "improve" | "stop_review";
  reason: string;
} {
  const candRate = a.results > 0 ? a.candidates / a.results : 0;
  if (a.newSurveys >= 3 || (a.newSurveys >= 1 && a.runs >= 2)) {
    return {
      tier: "keep",
      reason: `3일 누적 신규 ${a.newSurveys}건 (실행 ${a.runs}회)`,
    };
  }
  if (a.newSurveys >= 1) {
    return {
      tier: "keep",
      reason: `누적 신규 ${a.newSurveys}건 — 플랫폼 균형용으로 유지`,
    };
  }
  if (a.candidates >= 5 && a.newSurveys === 0) {
    return {
      tier: "improve",
      reason: `후보 ${a.candidates}이나 신규 0 — 오탐/중복·검증 한도 점검`,
    };
  }
  if (a.candidates > 0 && candRate < 0.05) {
    return {
      tier: "improve",
      reason: `후보 전환율 ${(candRate * 100).toFixed(1)}%로 낮음`,
    };
  }
  if (a.candidates === 0 && a.results > 0) {
    return {
      tier: "stop_review",
      reason: `결과 ${a.results}이나 후보 0이 ${a.runs}회 반복 — 중단 검토`,
    };
  }
  if (a.candidates <= 2 && a.newSurveys === 0) {
    return {
      tier: "stop_review",
      reason: `누적 후보 ${a.candidates}, 신규 0 — 중단 검토 (단 즉시 삭제 금지)`,
    };
  }
  return {
    tier: "improve",
    reason: `성과 미약 (신규 ${a.newSurveys}, 후보 ${a.candidates}) — 보완`,
  };
}

async function main() {
  loadLocalEnvFiles();
  const supabase = createSupabaseServerClient();

  // 3-day admin completed runs
  const { data: runs } = await supabase
    .from("collection_runs")
    .select("id, started_at, new_surveys_count, status, trigger")
    .eq("trigger", "admin")
    .eq("status", "completed")
    .gte("started_at", "2026-08-05T15:00:00.000Z")
    .order("started_at", { ascending: true });

  const runIds = (runs || []).map((r) => r.id);
  const configured = buildCollectorSearchQueries().map((q) => q.query);

  const { data: stats } = await supabase
    .from("collection_query_stats")
    .select("*")
    .in("collection_run_id", runIds.length ? runIds : ["00000000-0000-0000-0000-000000000000"]);

  const byQuery = new Map<string, Agg>();
  for (const q of configured) {
    byQuery.set(q, {
      searchQuery: q,
      runs: 0,
      results: 0,
      candidates: 0,
      newSurveys: 0,
      duplicates: 0,
      invalid: 0,
      unreachable: 0,
      errors: 0,
    });
  }

  const runSeen = new Map<string, Set<string>>();
  for (const row of stats || []) {
    const q = String(row.search_query);
    const agg = byQuery.get(q) || {
      searchQuery: q,
      runs: 0,
      results: 0,
      candidates: 0,
      newSurveys: 0,
      duplicates: 0,
      invalid: 0,
      unreachable: 0,
      errors: 0,
    };
    const runId = String(row.collection_run_id);
    if (!runSeen.has(q)) runSeen.set(q, new Set());
    runSeen.get(q)!.add(runId);
    agg.results += Number(row.results_count || 0);
    agg.candidates += Number(row.candidate_count || 0);
    agg.newSurveys += Number(row.new_survey_count || 0);
    agg.duplicates += Number(row.duplicate_survey_count || 0);
    agg.invalid += Number(row.invalid_count || 0);
    agg.unreachable += Number(row.unreachable_count || 0);
    agg.errors += Number(row.error_count || 0);
    byQuery.set(q, agg);
  }
  for (const [q, set] of runSeen) {
    const agg = byQuery.get(q);
    if (agg) agg.runs = set.size;
  }

  const evaluated = [...byQuery.values()]
    .map((a) => {
      const { tier, reason } = classify(a);
      return {
        ...a,
        candidateRate:
          a.results > 0
            ? Number(((a.candidates / a.results) * 100).toFixed(1))
            : 0,
        tier,
        reason,
      };
    })
    .sort((a, b) => b.newSurveys - a.newSurveys || b.candidates - a.candidates);

  const keep = evaluated.filter((e) => e.tier === "keep");
  const improve = evaluated.filter((e) => e.tier === "improve");
  const stop = evaluated.filter((e) => e.tier === "stop_review");

  const report = {
    runsConsidered: (runs || []).map((r) => ({
      id: r.id,
      started_at: r.started_at,
      new_surveys_count: r.new_surveys_count,
    })),
    totalNewFromRuns: (runs || []).reduce(
      (a, r) => a + Number(r.new_surveys_count || 0),
      0,
    ),
    queryCount: evaluated.length,
    keep,
    improve,
    stop,
    summary: {
      keep: keep.length,
      improve: improve.length,
      stop_review: stop.length,
    },
  };

  const out = resolve(process.cwd(), "scripts/tmp-query-eval-3day.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
