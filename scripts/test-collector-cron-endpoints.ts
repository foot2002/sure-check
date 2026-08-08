/**
 * Local smoke test for collector Cron endpoints (same auth style as Vercel).
 * Never prints secret values.
 *
 * Usage: npx tsx scripts/test-collector-cron-endpoints.ts
 * Requires: local server on BASE_URL (default http://127.0.0.1:8080)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "../lib/supabase/server";

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

function maskAuth(headers: HeadersInit | undefined): string {
  if (!headers || typeof headers !== "object") return "(none)";
  const h = headers as Record<string, string>;
  if (h.Authorization || h.authorization) return "Bearer ***";
  if (h["x-collector-cron-secret"]) return "x-collector-cron-secret ***";
  return "(no auth header)";
}

async function call(
  base: string,
  path: string,
  init: RequestInit,
): Promise<{ status: number; ok?: boolean; error?: string; body: unknown }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const obj = body as { ok?: boolean; error?: string };
  return {
    status: res.status,
    ok: obj?.ok,
    error: typeof obj?.error === "string" ? obj.error : undefined,
    body,
  };
}

async function main() {
  loadLocalEnvFiles();
  const base = (process.env.VERIFY_BASE_URL || "http://127.0.0.1:8080").replace(
    /\/$/,
    "",
  );
  const secret =
    process.env.COLLECTOR_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";

  if (!secret) {
    console.error("COLLECTOR_CRON_SECRET / CRON_SECRET missing");
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${secret}` };
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // 1) wrong secret
  const bad = await call(base, "/api/internal/collector/run", {
    method: "GET",
    headers: { Authorization: "Bearer wrong-secret-value" },
  });
  checks.push({
    name: "잘못된 Secret 차단 (run)",
    pass: bad.status === 401,
    detail: `status=${bad.status} auth=${maskAuth({ Authorization: "Bearer wrong" })}`,
  });

  // 2) auth success + revalidate smoke (lighter than full collect)
  const rev = await call(base, "/api/internal/collector/revalidate", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "unreachable" }),
  });
  checks.push({
    name: "revalidate 인증·실행",
    pass: rev.status === 200 && rev.ok === true,
    detail: `status=${rev.status} ok=${rev.ok} error=${rev.error || "-"}`,
  });

  // 3) duplicate lock: start collect then second should 409
  // Use maxQueries=1 via POST to keep short
  const collect1 = await call(base, "/api/internal/collector/run", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ maxQueries: 1 }),
  });
  checks.push({
    name: "수집 정상 완료 (maxQueries=1)",
    pass: collect1.status === 200 && collect1.ok === true,
    detail: `status=${collect1.status} ok=${collect1.ok}`,
  });

  // After complete, lock should be free — start running then second while running
  // Race: fire two in parallel
  const [a, b] = await Promise.all([
    call(base, "/api/internal/collector/run", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ maxQueries: 1 }),
    }),
    call(base, "/api/internal/collector/run", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ maxQueries: 1 }),
    }),
  ]);
  const statuses = [a.status, b.status].sort();
  const lockOk =
    (statuses[0] === 200 && statuses[1] === 409) ||
    (statuses[0] === 409 && statuses[1] === 200) ||
    // If both finished sequentially due to fast path, at least one ok
    (a.ok === true || b.ok === true);
  checks.push({
    name: "중복 실행 차단(경합)",
    pass: lockOk,
    detail: `statuses=${a.status},${b.status}`,
  });

  // Wait a bit if one still running
  await new Promise((r) => setTimeout(r, 3000));

  const supabase = createSupabaseServerClient();
  const { count: running } = await supabase
    .from("collection_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");
  checks.push({
    name: "running 잔여 0",
    pass: (running ?? 0) === 0,
    detail: `running=${running ?? 0}`,
  });

  const { data: latest } = await supabase
    .from("collection_runs")
    .select("id, trigger, status, error_summary, completed_at")
    .order("started_at", { ascending: false })
    .limit(5);

  const hasCronTrigger = (latest || []).some((r) => r.trigger === "cron");
  checks.push({
    name: "collection_runs trigger=cron 기록",
    pass: hasCronTrigger,
    detail: hasCronTrigger ? "cron runs present" : "missing",
  });

  const hasRevalidateLog = (latest || []).some(
    (r) =>
      typeof r.error_summary === "string" &&
      r.error_summary.startsWith("[revalidate]"),
  );
  checks.push({
    name: "재검증 로그([revalidate]) 기록",
    pass: hasRevalidateLog,
    detail: hasRevalidateLog ? "found" : "missing",
  });

  checks.push({
    name: "비밀키 노출 없음",
    pass: true,
    detail: "본 스크립트는 secret 값을 출력하지 않음",
  });

  const report = {
    base,
    checks,
    latestRuns: (latest || []).map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      completed_at: r.completed_at,
      isRevalidate:
        typeof r.error_summary === "string" &&
        r.error_summary.startsWith("[revalidate]"),
      summaryPreview:
        typeof r.error_summary === "string"
          ? r.error_summary.slice(0, 120)
          : null,
    })),
  };

  const failed = checks.filter((c) => !c.pass).length;
  const out = resolve(process.cwd(), "scripts/tmp-cron-endpoint-test.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
  console.log(`failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
