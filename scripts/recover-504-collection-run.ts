/**
 * Inspect + safely recover the stuck 504 collection_run (no survey_links deleted).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  loadLocalEnvFiles();
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const runId = "6b7386a1-d307-4cb1-9641-3121452bed98";
  const { data: run } = await sb
    .from("collection_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  const started = run?.started_at ? Date.parse(run.started_at) : null;
  const windowStart = started
    ? new Date(started - 60_000).toISOString()
    : new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const windowEnd = started
    ? new Date(started + 10 * 60 * 1000).toISOString()
    : new Date().toISOString();

  const { data: qstats } = await sb
    .from("collection_query_stats")
    .select("*")
    .eq("collection_run_id", runId);

  const { count: linksInWindow } = await sb
    .from("survey_links")
    .select("id", { count: "exact", head: true })
    .gte("first_discovered_at", windowStart)
    .lte("first_discovered_at", windowEnd);

  const { count: sourcesInWindow } = await sb
    .from("survey_sources")
    .select("id", { count: "exact", head: true })
    .gte("discovered_at", windowStart)
    .lte("discovered_at", windowEnd);

  const { data: sampleLinks } = await sb
    .from("survey_links")
    .select("id, canonical_url, status, first_discovered_at, discovery_count")
    .gte("first_discovered_at", windowStart)
    .lte("first_discovered_at", windowEnd)
    .order("first_discovered_at", { ascending: false })
    .limit(20);

  const ageMs = started ? Date.now() - started : null;
  const shouldRecover =
    run?.status === "running" && ageMs != null && ageMs > 3 * 60 * 1000;

  let recovered = false;
  if (shouldRecover) {
    const { error } = await sb
      .from("collection_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_count: 1,
        error_summary:
          "Production 504 FUNCTION_INVOCATION_TIMEOUT 복구 (survey_links 유지, lock 해제)",
      })
      .eq("id", runId)
      .eq("status", "running");
    recovered = !error;
  }

  const { data: stillRunning } = await sb
    .from("collection_runs")
    .select("id, started_at, status")
    .eq("status", "running");

  const report = {
    run,
    ageMs,
    queryStatsCount: qstats?.length ?? 0,
    queryStatsSample: (qstats || []).slice(0, 5).map((q) => ({
      search_query: q.search_query,
      results_count: q.results_count,
      candidate_count: q.candidate_count,
      error_count: q.error_count,
    })),
    window: { windowStart, windowEnd },
    linksFirstDiscoveredInWindow: linksInWindow,
    sourcesInWindow,
    sampleLinks,
    recovered,
    stillRunning: stillRunning || [],
  };

  const path = resolve(process.cwd(), "scripts/tmp-504-run-detail.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
