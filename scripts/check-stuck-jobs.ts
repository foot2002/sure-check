/**
 * Report stuck pending/running scan and capture jobs for ops triage.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSupabaseServiceRoleKeyStatus,
  getSupabaseUrlStatus,
} from "@/lib/supabase/server";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
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

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function countJobs(
  table: "scan_jobs" | "capture_jobs",
  status: string | string[],
  olderThan: string,
): Promise<number> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .lt("updated_at", olderThan);
  if (Array.isArray(status)) query = query.in("status", status);
  else query = query.eq("status", status);
  const { count, error } = await query;
  if (error) {
    console.warn(`[jobs:stuck-check] ${table}:`, error.message);
    return -1;
  }
  return count ?? 0;
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  console.log("[Stuck Job Check]\n");

  if (
    getSupabaseUrlStatus() !== "OK" ||
    getSupabaseServiceRoleKeyStatus() !== "OK"
  ) {
    console.log("Supabase: FAIL");
    console.log("result: FAIL");
    process.exit(1);
  }

  const scanPending5m = await countJobs(
    "scan_jobs",
    ["pending", "idle"],
    isoMinutesAgo(5),
  );
  const scanRunning2m = await countJobs(
    "scan_jobs",
    "running",
    isoMinutesAgo(2),
  );
  const captureRunning5m = await countJobs(
    "capture_jobs",
    "running",
    isoMinutesAgo(5),
  );

  const supabase = createSupabaseServerClient();
  const since1h = isoMinutesAgo(60);
  const { data: recent, error } = await supabase
    .from("scan_jobs")
    .select("status, total_duration_ms, completed_at")
    .gte("completed_at", since1h)
    .in("status", ["completed", "limited", "failed"]);

  let failedLimitedRatio = "n/a";
  let avgDuration = "n/a";
  if (!error && recent) {
    const total = recent.length || 1;
    const bad = recent.filter(
      (r) => r.status === "failed" || r.status === "limited",
    ).length;
    failedLimitedRatio = `${((bad / total) * 100).toFixed(1)}% (${bad}/${recent.length})`;
    const durations = recent
      .map((r) => Number(r.total_duration_ms))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (durations.length) {
      avgDuration = `${Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length,
      )}ms`;
    }
  }

  console.log(`scan pending > 5m: ${scanPending5m}`);
  console.log(`scan running > 2m: ${scanRunning2m}`);
  console.log(`capture running > 5m: ${captureRunning5m}`);
  console.log(`failed/limited ratio (1h): ${failedLimitedRatio}`);
  console.log(`avg total_duration_ms (1h): ${avgDuration}`);

  const stuck =
    scanPending5m > 0 || scanRunning2m > 0 || captureRunning5m > 0;
  console.log("\nrecommendation:");
  if (stuck) {
    console.log(
      "- Inspect stuck rows; ensure INTERNAL_WORKER_TOKEN cron hits /api/internal/jobs/run-next",
    );
    console.log(
      "- Confirm migrations 002/003 and SCAN_STATUS_STALE_SECONDS=90 are active",
    );
  } else {
    console.log("- No long-stuck jobs detected");
  }

  console.log(`\nresult: ${stuck ? "WARN" : "PASS"}`);
  // WARN is not a hard fail — ops signal only
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
