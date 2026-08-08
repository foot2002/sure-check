/**
 * Production sequential partition verify: A then B.
 * Usage: npx tsx scripts/prod-verify-partitions.ts
 *
 * Requires COLLECTOR_CRON_SECRET (or CRON_SECRET) and optional
 * COLLECTOR_PROD_BASE_URL (default https://sure-check.vercel.app).
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

async function invokePartition(partition: "a" | "b") {
  const base =
    process.env.COLLECTOR_PROD_BASE_URL?.replace(/\/$/, "") ||
    "https://sure-check.vercel.app";
  const secret =
    process.env.COLLECTOR_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("COLLECTOR_CRON_SECRET or CRON_SECRET required");

  const started = Date.now();
  const res = await fetch(`${base}/api/internal/collector/run/${partition}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const elapsedMs = Date.now() - started;
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { httpStatus: res.status, elapsedMs, json };
}

async function countRunning() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from("collection_runs")
    .select("id, started_at, status")
    .eq("status", "running");
  return data || [];
}

function summarize(label: string, result: Awaited<ReturnType<typeof invokePartition>>) {
  const json = result.json || {};
  const run = (json.run || {}) as Record<string, unknown>;
  const stats = (json.stats || {}) as Record<string, unknown>;
  const meta = (json.meta || {}) as Record<string, unknown>;
  const queues = (meta.queueCounts || {}) as Record<string, number>;
  return {
    label,
    httpStatus: result.httpStatus,
    clientElapsedMs: result.elapsedMs,
    ok: json.ok === true,
    partition: json.partition,
    runStatus: run.status,
    runId: run.id,
    error: json.error || run.error_summary || null,
    apiCalls: stats.apiCalls ?? null,
    resultsCount: stats.resultsCount ?? run.results_count ?? null,
    candidateCount: stats.candidateLinksCount ?? run.candidate_links_count ?? null,
    newSurveys: stats.newSurveysCount ?? run.new_surveys_count ?? null,
    duplicateSurveys: stats.duplicateSurveysCount ?? null,
    errorCount: stats.errorCount ?? run.error_count ?? null,
    aPriority: queues.A_PRIORITY ?? meta.cappedA ?? null,
    bPriority: queues.B_PRIORITY ?? meta.cappedB ?? null,
    cArchive: queues.C_ARCHIVE ?? meta.archivedSkipped ?? null,
    inlinePageValidates: meta.inlinePageValidates ?? null,
    metaElapsedMs: meta.elapsedMs ?? null,
    phaseTiming: meta.phaseTiming ?? null,
    topPhase: meta.topPhase ?? null,
    under75s: (meta.elapsedMs as number) < 75_000,
    under90s: (meta.elapsedMs as number) < 90_000,
    headroomVs120s:
      typeof meta.elapsedMs === "number"
        ? 120_000 - (meta.elapsedMs as number)
        : null,
  };
}

async function main() {
  loadLocalEnvFiles();
  const only = process.argv.includes("--b-only")
    ? "b"
    : process.argv.includes("--a-only")
      ? "a"
      : "both";

  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    base:
      process.env.COLLECTOR_PROD_BASE_URL || "https://sure-check.vercel.app",
  };

  if (only === "a" || only === "both") {
    console.log("=== invoke partition A ===");
    const aRaw = await invokePartition("a");
    const a = summarize("A", aRaw);
    report.a = a;
    report.runningAfterA = await countRunning();
    console.log(JSON.stringify(a, null, 2));

    if (
      a.httpStatus !== 200 ||
      a.runStatus !== "completed" ||
      (a.errorCount as number) > 0 ||
      !a.under90s
    ) {
      report.judgment = "FAIL_A_STOP — do not run B; consider legacy rollback";
      const path = resolve(process.cwd(), "scripts/tmp-prod-partition-verify.json");
      writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }
  }

  if (only === "b" || only === "both") {
    console.log("=== invoke partition B (after A) ===");
    const bRaw = await invokePartition("b");
    const b = summarize("B", bRaw);
    report.b = b;
    report.runningAfterB = await countRunning();
    console.log(JSON.stringify(b, null, 2));
  }

  const a = report.a as Record<string, unknown> | undefined;
  const b = report.b as Record<string, unknown> | undefined;
  const aOk =
    a &&
    a.httpStatus === 200 &&
    a.runStatus === "completed" &&
    (a.errorCount as number) === 0 &&
    a.under90s;
  const bOk =
    b &&
    b.httpStatus === 200 &&
    b.runStatus === "completed" &&
    (b.errorCount as number) === 0 &&
    b.under90s;

  const sharedAb =
    Number(a?.aPriority || 0) +
    Number(a?.bPriority || 0) +
    Number(b?.aPriority || 0) +
    Number(b?.bPriority || 0);

  report.sharedCapCheck = {
    aPlusBfromQueues: sharedAb,
    note: "Queue counts are pre-remaining display; production remaining uses [cap] markers",
    passHint: "AB from capped meta preferred",
    cappedSum:
      Number((a as { } | undefined) && 0) ||
      undefined,
  };

  // Prefer cappedA/B from raw meta if present in stored summaries
  const aCapped =
    Number((a as { aPriority?: number } | undefined)?.aPriority || 0) +
    Number((a as { bPriority?: number } | undefined)?.bPriority || 0);
  const bCapped =
    Number((b as { aPriority?: number } | undefined)?.aPriority || 0) +
    Number((b as { bPriority?: number } | undefined)?.bPriority || 0);
  report.sharedCapApprox = {
    aRunAB: aCapped,
    bRunAB: bCapped,
    sumAB: aCapped + bCapped,
    dailyLimit: 120,
    withinLimit: aCapped + bCapped <= 120,
  };

  report.judgment =
    aOk && bOk
      ? (report.sharedCapApprox as { withinLimit: boolean }).withinLimit
        ? "PASS — Cron 적용 가능 (vercel.json 아직 미반영)"
        : "PASS_RUNTIME — but shared AB cap sum >120 needs review"
      : "FAIL — legacy rollback 대상 / Cron 변경 금지";

  report.cronFinalProposal = {
    kst: {
      "06:00": "/api/internal/collector/run/a",
      "06:20": "/api/internal/collector/run/b",
      "12:00": "/api/internal/collector/revalidate",
      "16:00": "/api/internal/collector/revalidate",
      "20:00": "/api/internal/collector/revalidate",
    },
    utc: {
      "0 21 * * *": "/api/internal/collector/run/a",
      "20 21 * * *": "/api/internal/collector/run/b",
      "0 3 * * *": "/api/internal/collector/revalidate",
      "0 7 * * *": "/api/internal/collector/revalidate",
      "0 11 * * *": "/api/internal/collector/revalidate",
    },
    note: "Not written to vercel.json yet",
  };

  const path = resolve(process.cwd(), "scripts/tmp-prod-partition-verify.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path}`);
  if (report.judgment.toString().startsWith("FAIL")) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
