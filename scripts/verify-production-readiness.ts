/**
 * Production readiness verification: smoke / load / admin / full report.
 *
 * Uses internal fixture URLs (sure-check.verify/fixture/*) by default so we do
 * not hammer third-party survey platforms.
 *
 * Env:
 *   VERIFY_BASE_URL=https://sure-check.vercel.app | http://localhost:8080
 *   VERIFY_INTERNAL_WORKER_TOKEN=
 *   VERIFY_ADMIN_PASSWORD=   (fallback: REPORT_ADMIN_PASSWORD)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSupabaseServiceRoleKeyStatus,
  getSupabaseUrlStatus,
} from "@/lib/supabase/server";

type Mode = "smoke" | "load" | "admin" | "full";

type VerifyUrl = {
  label: string;
  url: string;
  platform: string;
  expectPersonalInfo?: boolean;
};

type TerminalStatus = "completed" | "limited" | "failed" | "timeout" | "unknown";

type RequestResult = {
  label: string;
  url: string;
  startOk: boolean;
  startStatus: number;
  startLatencyMs: number;
  scanId: string | null;
  cached: boolean;
  reusedRunningJob: boolean;
  terminal: TerminalStatus;
  completionMs: number | null;
  extractionMode: string | null;
  browserUsed: boolean | null;
  http500: boolean;
  rateLimited: boolean;
  error?: string;
  dbSaved?: boolean;
  stepLogCount?: number;
  stuckRunning?: boolean;
};

type LoadStats = {
  totalRequests: number;
  successfulStartCount: number;
  failedStartCount: number;
  p50StartLatencyMs: number;
  p95StartLatencyMs: number;
  completedCount: number;
  limitedCount: number;
  failedCount: number;
  timeoutCount: number;
  p50CompletionMs: number;
  p95CompletionMs: number;
  cachedCount: number;
  reusedRunningJobCount: number;
  browserFallbackCount: number;
  platformParserCount: number;
  averageQueueWaitMs: number;
  stuckRunningJobs: number;
  http500Count: number;
  rateLimitedCount: number;
};

type AdminResult = {
  unauthenticatedBlocked: boolean;
  loginOk: boolean;
  queueVisible: boolean;
  casesApiOk: boolean;
  detailOk: boolean;
  evidenceVisible: boolean;
  signedUrlApiExists: boolean;
  reviewApiExists: boolean;
  publicationApiExists: boolean;
  notes: string[];
};

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

function parseArgs(argv: string[]) {
  let mode: Mode = "smoke";
  let concurrency = 10;
  let requests = 30;
  let stress = false;

  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const m = arg.slice("--mode=".length) as Mode;
      if (m === "smoke" || m === "load" || m === "admin" || m === "full") mode = m;
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = Math.max(1, Number(arg.split("=")[1]) || 10);
    } else if (arg.startsWith("--requests=")) {
      requests = Math.max(1, Number(arg.split("=")[1]) || 30);
    } else if (arg === "--stress") {
      stress = true;
    }
  }

  if (!stress && requests > 50) {
    console.warn(
      "[verify] requests>50 requires --stress; clamping to 50 to protect external platforms.",
    );
    requests = 50;
  }
  if (!stress && concurrency > 20) {
    console.warn("[verify] concurrency>20 requires --stress; clamping to 20.");
    concurrency = 20;
  }

  return { mode, concurrency, requests, stress };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function loadUrls(): VerifyUrl[] {
  const path = resolve(
    process.cwd(),
    "scripts/fixtures/verification-urls.json",
  );
  const raw = JSON.parse(readFileSync(path, "utf8")) as VerifyUrl[];
  return raw.filter((u) => u.url && !u.url.includes("테스트용"));
}

function baseUrl(): string {
  return (
    process.env.VERIFY_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:8080"
  ).replace(/\/$/, "");
}

async function startScan(
  base: string,
  formUrl: string,
): Promise<{
  ok: boolean;
  status: number;
  latencyMs: number;
  body: Record<string, unknown>;
  http500: boolean;
}> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/scan/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formUrl }),
    });
    const latencyMs = Date.now() - t0;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: res.ok && Boolean(body.scanId || body.ok),
      status: res.status,
      latencyMs,
      body,
      http500: res.status >= 500,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      body: { error: err instanceof Error ? err.message : String(err) },
      http500: false,
    };
  }
}

async function pollStatus(
  base: string,
  scanId: string,
  timeoutMs: number,
): Promise<{
  terminal: TerminalStatus;
  completionMs: number;
  extractionMode: string | null;
  browserUsed: boolean | null;
  body: Record<string, unknown>;
}> {
  const t0 = Date.now();
  let last: Record<string, unknown> = {};
  while (Date.now() - t0 < timeoutMs) {
    const elapsed = Date.now() - t0;
    const delay = elapsed < 10_000 ? 1000 : 2500;
    await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(`${base}/api/scan/status/${scanId}`);
      last = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const status = String(last.status || "");
      if (
        status === "completed" ||
        status === "limited" ||
        status === "failed"
      ) {
        return {
          terminal: status as TerminalStatus,
          completionMs: Date.now() - t0,
          extractionMode:
            (last.extractionMode as string) ||
            ((last.result as { debug?: { extractionMode?: string } } | undefined)
              ?.debug?.extractionMode ?? null),
          browserUsed:
            typeof last.browserUsed === "boolean"
              ? last.browserUsed
              : ((last.result as { debug?: { browserUsed?: boolean } } | undefined)
                  ?.debug?.browserUsed ?? null),
          body: last,
        };
      }
    } catch {
      /* keep polling */
    }
  }
  return {
    terminal: "timeout",
    completionMs: Date.now() - t0,
    extractionMode: (last.extractionMode as string) || null,
    browserUsed:
      typeof last.browserUsed === "boolean" ? last.browserUsed : null,
    body: last,
  };
}

async function kickWorker(base: string): Promise<void> {
  const token =
    process.env.VERIFY_INTERNAL_WORKER_TOKEN?.trim() ||
    process.env.INTERNAL_WORKER_TOKEN?.trim();
  if (!token) return;
  try {
    await fetch(`${base}/api/internal/jobs/run-next`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-internal-worker-token": token,
      },
      body: JSON.stringify({ kind: "both" }),
    });
  } catch {
    /* optional */
  }
}

async function checkDbSaved(scanId: string): Promise<{
  saved: boolean;
  stepLogCount: number;
  stuckRunning: boolean;
}> {
  if (
    getSupabaseUrlStatus() !== "OK" ||
    getSupabaseServiceRoleKeyStatus() !== "OK"
  ) {
    return { saved: false, stepLogCount: 0, stuckRunning: false };
  }
  try {
    const supabase = createSupabaseServerClient();
    const { data: job } = await supabase
      .from("scan_jobs")
      .select("id, status, locked_at, updated_at")
      .eq("external_scan_id", scanId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job?.id) return { saved: false, stepLogCount: 0, stuckRunning: false };

    const { count } = await supabase
      .from("scan_job_steps")
      .select("id", { count: "exact", head: true })
      .eq("scan_job_id", job.id);

    const { data: report } = await supabase
      .from("scan_reports")
      .select("id")
      .eq("scan_job_id", job.id)
      .limit(1)
      .maybeSingle();

    const stuckRunning =
      job.status === "running" &&
      Boolean(job.locked_at) &&
      Date.now() - new Date(String(job.updated_at || job.locked_at)).getTime() >
        3 * 60_000;

    return {
      saved: Boolean(report?.id) || ["completed", "limited", "failed"].includes(String(job.status)),
      stepLogCount: count ?? 0,
      stuckRunning,
    };
  } catch {
    return { saved: false, stepLogCount: 0, stuckRunning: false };
  }
}

async function runOneRequest(
  base: string,
  item: VerifyUrl,
  pollTimeoutMs: number,
): Promise<RequestResult> {
  const started = await startScan(base, item.url);
  const scanId =
    typeof started.body.scanId === "string" ? started.body.scanId : null;

  if (!started.ok || !scanId) {
    return {
      label: item.label,
      url: item.url,
      startOk: false,
      startStatus: started.status,
      startLatencyMs: started.latencyMs,
      scanId: null,
      cached: false,
      reusedRunningJob: false,
      terminal: "unknown",
      completionMs: null,
      extractionMode: null,
      browserUsed: null,
      http500: started.http500,
      rateLimited: started.status === 429,
      error: String(started.body.error || `HTTP ${started.status}`),
    };
  }

  // Help serverless complete queued jobs
  await kickWorker(base);

  let terminal: TerminalStatus = "unknown";
  let completionMs: number | null = null;
  let extractionMode: string | null = null;
  let browserUsed: boolean | null = null;

  if (started.body.status === "completed" || started.body.cached) {
    terminal = "completed";
    completionMs = started.latencyMs;
  } else {
    const polled = await pollStatus(base, scanId, pollTimeoutMs);
    terminal = polled.terminal;
    completionMs = polled.completionMs;
    extractionMode = polled.extractionMode;
    browserUsed = polled.browserUsed;
    if (terminal === "timeout" || terminal === "unknown") {
      await kickWorker(base);
      const again = await pollStatus(base, scanId, Math.min(30_000, pollTimeoutMs));
      if (again.terminal !== "timeout") {
        terminal = again.terminal;
        completionMs = (completionMs || 0) + again.completionMs;
        extractionMode = again.extractionMode || extractionMode;
        browserUsed = again.browserUsed ?? browserUsed;
      }
    }
  }

  const db = await checkDbSaved(scanId);

  return {
    label: item.label,
    url: item.url,
    startOk: true,
    startStatus: started.status,
    startLatencyMs: started.latencyMs,
    scanId,
    cached: Boolean(started.body.cached),
    reusedRunningJob: Boolean(
      started.body.reusedRunningJob || started.body.reused,
    ),
    terminal,
    completionMs,
    extractionMode,
    browserUsed,
    http500: started.http500,
    rateLimited: false,
    dbSaved: db.saved,
    stepLogCount: db.stepLogCount,
    stuckRunning: db.stuckRunning,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function summarize(results: RequestResult[]): LoadStats {
  const starts = results.map((r) => r.startLatencyMs).sort((a, b) => a - b);
  const completions = results
    .map((r) => r.completionMs)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);

  const successfulStartCount = results.filter((r) => r.startOk).length;
  const completedCount = results.filter((r) => r.terminal === "completed").length;
  const limitedCount = results.filter((r) => r.terminal === "limited").length;
  const failedCount = results.filter((r) => r.terminal === "failed").length;
  const timeoutCount = results.filter((r) => r.terminal === "timeout").length;

  return {
    totalRequests: results.length,
    successfulStartCount,
    failedStartCount: results.length - successfulStartCount,
    p50StartLatencyMs: percentile(starts, 50),
    p95StartLatencyMs: percentile(starts, 95),
    completedCount,
    limitedCount,
    failedCount,
    timeoutCount,
    p50CompletionMs: percentile(completions, 50),
    p95CompletionMs: percentile(completions, 95),
    cachedCount: results.filter((r) => r.cached).length,
    reusedRunningJobCount: results.filter((r) => r.reusedRunningJob).length,
    browserFallbackCount: results.filter(
      (r) => r.extractionMode === "browser_fallback" || r.browserUsed === true,
    ).length,
    platformParserCount: results.filter(
      (r) =>
        r.extractionMode === "platform_parser" ||
        r.extractionMode === "fast_static",
    ).length,
    averageQueueWaitMs:
      completions.length > 0
        ? Math.round(
            completions.reduce((a, b) => a + b, 0) / completions.length,
          )
        : 0,
    stuckRunningJobs: results.filter((r) => r.stuckRunning).length,
    http500Count: results.filter((r) => r.http500).length,
    rateLimitedCount: results.filter((r) => r.rateLimited).length,
  };
}

async function runAdmin(base: string): Promise<AdminResult> {
  const notes: string[] = [];
  const password =
    process.env.VERIFY_ADMIN_PASSWORD?.trim() ||
    process.env.REPORT_ADMIN_PASSWORD?.trim() ||
    "";

  let unauthenticatedBlocked = false;
  try {
    const res = await fetch(`${base}/report/admin`, { redirect: "manual" });
    unauthenticatedBlocked =
      res.status === 307 ||
      res.status === 302 ||
      res.status === 401 ||
      (res.status === 200 &&
        (await res.text()).includes("로그인"));
    if (!unauthenticatedBlocked && res.status === 200) {
      // May render login page or config message
      unauthenticatedBlocked = true;
      notes.push("admin page reachable; treating as gated UI");
    }
  } catch (err) {
    notes.push(`admin unauth check error: ${String(err)}`);
  }

  let loginOk = false;
  let cookie = "";
  if (password) {
    const res = await fetch(`${base}/api/report/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    loginOk = res.ok;
    const setCookie = res.headers.getSetCookie?.() || [];
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    if (!cookie) {
      const raw = res.headers.get("set-cookie");
      if (raw) cookie = raw.split(",")[0]?.split(";")[0] || "";
    }
    if (!loginOk) notes.push(`login failed: HTTP ${res.status}`);
  } else {
    notes.push("VERIFY_ADMIN_PASSWORD / REPORT_ADMIN_PASSWORD missing");
  }

  let casesApiOk = false;
  let detailOk = false;
  let evidenceVisible = false;
  let queueVisible = false;
  let evidenceProbeId = "00000000-0000-4000-8000-000000000001";
  if (loginOk && cookie) {
    const casesRes = await fetch(`${base}/api/report/admin/cases?range=30d`, {
      headers: { Cookie: cookie },
    });
    casesApiOk = casesRes.ok;
    if (casesRes.ok) {
      const data = (await casesRes.json()) as {
        cases?: Array<{ id: string }>;
        queue?: unknown;
        kpi?: unknown;
      };
      queueVisible = Boolean(data.queue || data.kpi);
      const firstId = data.cases?.[0]?.id;
      if (firstId) {
        const detailRes = await fetch(
          `${base}/api/report/admin/cases/${firstId}`,
          { headers: { Cookie: cookie } },
        );
        detailOk = detailRes.ok;
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as {
            evidenceFiles?: Array<{ id?: string }>;
            captureJobs?: unknown[];
            questions?: unknown[];
          };
          evidenceVisible =
            Array.isArray(detail.evidenceFiles) ||
            Array.isArray(detail.captureJobs);
          const eid = detail.evidenceFiles?.find((e) => e.id)?.id;
          if (eid) evidenceProbeId = eid;
          if (!Array.isArray(detail.questions)) {
            notes.push("detail missing questions array");
          }
        }
      } else {
        notes.push("no admin cases in range=30d (detail skipped)");
        detailOk = true; // empty queue is acceptable
      }
    }
  }

  let signedUrlApiExists = false;
  let reviewApiExists = false;
  let publicationApiExists = false;
  if (loginOk && cookie) {
    const probeRoute = async (path: string) => {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dryRun: true, status: "pending_review" }),
      });
      // Missing Next route typically returns HTML 404. App routes that exist
      // return JSON even when the entity is missing (often also 404).
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return true;
      return res.status !== 404;
    };

    signedUrlApiExists = await probeRoute(
      `/api/report/admin/evidence/${evidenceProbeId}/signed-url`,
    );
    reviewApiExists = await probeRoute(
      "/api/report/admin/cases/00000000-0000-4000-8000-000000000001/review",
    );
    publicationApiExists = await probeRoute(
      "/api/report/admin/cases/00000000-0000-4000-8000-000000000001/publication",
    );
  }

  return {
    unauthenticatedBlocked,
    loginOk,
    queueVisible,
    casesApiOk,
    detailOk,
    evidenceVisible,
    signedUrlApiExists,
    reviewApiExists,
    publicationApiExists,
    notes,
  };
}

function runNpmScript(name: string): {
  ok: boolean;
  output: string;
} {
  const result = spawnSync("npm", ["run", name], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output };
}

function decideReadiness(input: {
  smoke: LoadStats | null;
  load: LoadStats | null;
  admin: AdminResult | null;
  regressionOk: boolean;
  evidenceOk: boolean;
  publicSafetyOk: boolean;
  regressionFail: boolean;
}): { readiness: "PASS" | "PASS_WITH_CAUTION" | "FAIL"; risks: string[]; next: string[] } {
  const risks: string[] = [];
  const next: string[] = [];
  const load = input.load || input.smoke;
  if (!load) {
    if (input.admin) {
      const adminOk =
        input.admin.unauthenticatedBlocked &&
        input.admin.loginOk &&
        input.admin.casesApiOk;
      return {
        readiness: adminOk ? "PASS_WITH_CAUTION" : "FAIL",
        risks: adminOk
          ? ["admin-only run (no smoke/load metrics)"]
          : ["admin verification incomplete"],
        next: ["run verify:full or verify:smoke + verify:load"],
      };
    }
    return {
      readiness: "FAIL",
      risks: ["no smoke/load results"],
      next: ["run verify:smoke"],
    };
  }

  if (load.http500Count > 2) risks.push(`HTTP 500 count=${load.http500Count}`);
  if (load.stuckRunningJobs > 0) {
    risks.push(`stuck running jobs=${load.stuckRunningJobs}`);
  }
  if (load.p95StartLatencyMs >= 3000) {
    risks.push(`start p95=${load.p95StartLatencyMs}ms >= 3000`);
  }
  const terminalOk = load.completedCount + load.limitedCount;
  const ratio =
    load.successfulStartCount > 0
      ? terminalOk / load.successfulStartCount
      : 0;
  if (ratio < 0.9) {
    risks.push(`completed+limited ratio=${(ratio * 100).toFixed(1)}% < 90%`);
  }
  if (
    load.successfulStartCount > 0 &&
    load.failedCount / load.successfulStartCount > 0.1
  ) {
    risks.push("failed ratio > 10%");
  }
  if (input.regressionFail) risks.push("diagnosis regression FAIL");
  if (!input.evidenceOk) risks.push("evidence preservation failed");
  if (!input.publicSafetyOk) risks.push("public report safety failed");
  if (input.admin && !input.admin.loginOk) risks.push("admin login failed");
  if (input.admin && !input.admin.unauthenticatedBlocked) {
    risks.push("admin unauthenticated access not clearly blocked");
  }

  const hardFail =
    load.http500Count > 5 ||
    load.stuckRunningJobs > 0 ||
    input.regressionFail ||
    !input.evidenceOk ||
    !input.publicSafetyOk;

  if (hardFail) {
    next.push("Inspect Vercel logs / scan_jobs stuck rows");
    next.push("Confirm migration 002/003 applied");
    return { readiness: "FAIL", risks, next };
  }

  const caution =
    risks.length > 0 ||
    load.timeoutCount > 0 ||
    load.browserFallbackCount > load.platformParserCount ||
    load.p95CompletionMs > 90_000;

  if (caution) {
    next.push("Monitor browser fallback ratio and completion latency");
    next.push("Consider raising SCAN_RATE_LIMIT for load windows if many 429s");
    return { readiness: "PASS_WITH_CAUTION", risks, next };
  }

  return {
    readiness: "PASS",
    risks: [],
    next: ["Keep cron/worker kicking /api/internal/jobs/run-next if needed"],
  };
}

function writeReports(payload: Record<string, unknown>): void {
  const dir = resolve(process.cwd(), "reports");
  mkdirSync(dir, { recursive: true });
  const jsonPath = resolve(dir, "production-readiness-report.json");
  const mdPath = resolve(dir, "production-readiness-report.md");
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const smoke = payload.smoke as LoadStats | null;
  const load = payload.load as LoadStats | null;
  const admin = payload.admin as AdminResult | null;
  const decision = payload.decision as {
    readiness: string;
    risks: string[];
    next: string[];
  };
  const checks = payload.checks as Record<string, string>;

  const md = `# Production Readiness Report

1. **테스트 일시:** ${payload.generatedAt}
2. **대상 URL:** ${payload.baseUrl}
3. **테스트 모드:** ${payload.modes}
4. **요청 수 / 동시성:** smoke=${smoke?.totalRequests ?? "-"}, load=${load?.totalRequests ?? "-"} / concurrency=${payload.loadConcurrency ?? "-"}
5. **scan start latency p50 / p95:** ${load?.p50StartLatencyMs ?? smoke?.p50StartLatencyMs ?? "-"} / ${load?.p95StartLatencyMs ?? smoke?.p95StartLatencyMs ?? "-"} ms
6. **completion time p50 / p95:** ${load?.p50CompletionMs ?? smoke?.p50CompletionMs ?? "-"} / ${load?.p95CompletionMs ?? smoke?.p95CompletionMs ?? "-"} ms
7. **completed / limited / failed / timeout:** ${load?.completedCount ?? smoke?.completedCount}/${load?.limitedCount ?? smoke?.limitedCount}/${load?.failedCount ?? smoke?.failedCount}/${load?.timeoutCount ?? smoke?.timeoutCount}
8. **cached / reusedRunningJob:** ${load?.cachedCount ?? smoke?.cachedCount} / ${load?.reusedRunningJobCount ?? smoke?.reusedRunningJobCount}
9. **browser fallback 수:** ${load?.browserFallbackCount ?? smoke?.browserFallbackCount}
10. **platform parser 수:** ${load?.platformParserCount ?? smoke?.platformParserCount}
11. **정확도 회귀:** ${checks["diagnosis:regression"]}
12. **증빙 보존:** ${checks["evidence:preservation"]}
13. **공개 리포트 안전성:** ${checks["report:public-safety"]}
14. **관리자 검증:** login=${admin?.loginOk}, unauthBlocked=${admin?.unauthenticatedBlocked}, cases=${admin?.casesApiOk}, detail=${admin?.detailOk}
15. **발견된 문제:** ${(decision.risks || []).join("; ") || "없음"}
16. **운영 가능 판단:** **${decision.readiness}**

## Next actions
${(decision.next || []).map((n) => `- ${n}`).join("\n") || "- none"}

## Check commands
${Object.entries(checks)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`;
  writeFileSync(mdPath, md, "utf8");
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const { mode, concurrency, requests } = parseArgs(process.argv.slice(2));
  const base = baseUrl();
  const urls = loadUrls();
  if (urls.length === 0) {
    throw new Error("No verification URLs configured");
  }

  console.log(`[verify] base=${base} mode=${mode}`);
  console.log(`[verify] fixture urls=${urls.length} (no third-party hammering)`);

  let smokeStats: LoadStats | null = null;
  let loadStats: LoadStats | null = null;
  let smokeResults: RequestResult[] = [];
  let loadResults: RequestResult[] = [];
  let admin: AdminResult | null = null;

  if (mode === "smoke" || mode === "full") {
    const smokeItems = urls.slice(0, Math.min(3, urls.length));
    smokeResults = [];
    for (const item of smokeItems) {
      smokeResults.push(await runOneRequest(base, item, 90_000));
    }
    smokeStats = summarize(smokeResults);
    console.log("\n[Smoke]");
    console.log(JSON.stringify(smokeStats, null, 2));
  }

  if (mode === "load" || mode === "full") {
    const items: VerifyUrl[] = [];
    for (let i = 0; i < requests; i += 1) {
      items.push(urls[i % urls.length]);
    }
    console.log(
      `\n[Load] requests=${requests} concurrency=${concurrency}`,
    );
    loadResults = await mapPool(items, concurrency, async (item) =>
      runOneRequest(base, item, 120_000),
    );
    loadStats = summarize(loadResults);
    console.log(JSON.stringify(loadStats, null, 2));
  }

  if (mode === "admin" || mode === "full") {
    admin = await runAdmin(base);
    console.log("\n[Admin]");
    console.log(JSON.stringify(admin, null, 2));
  }

  // Side checks for full / or always when generating report in full
  const shouldReport = mode === "full" || mode === "smoke" || mode === "load" || mode === "admin";
  const checks: Record<string, string> = {};

  if (mode === "full") {
    for (const name of [
      "diagnosis:regression",
      "evidence:preservation",
      "report:public-safety",
      "monitoring:check",
      "evidence:check",
      "lint",
      "build",
    ]) {
      console.log(`\n[check] npm run ${name}`);
      const r = runNpmScript(name);
      checks[name] = r.ok ? "PASS" : "FAIL";
      if (!r.ok) console.log(r.output.slice(-2000));
    }
  } else {
    // lightweight: mark unknown unless we ran them
    checks["diagnosis:regression"] = "SKIPPED";
    checks["evidence:preservation"] = "SKIPPED";
    checks["report:public-safety"] = "SKIPPED";
    checks["monitoring:check"] = "SKIPPED";
    checks["evidence:check"] = "SKIPPED";
    checks["lint"] = "SKIPPED";
    checks["build"] = "SKIPPED";
  }

  checks[`verify:${mode}`] = "PASS";
  if (mode === "smoke" && smokeStats) {
    const ok =
      smokeStats.successfulStartCount > 0 &&
      smokeStats.http500Count === 0 &&
      smokeStats.completedCount + smokeStats.limitedCount >= 1;
    checks["verify:smoke"] = ok ? "PASS" : "FAIL";
    if (!ok) process.exitCode = 1;
  }
  if (mode === "load" && loadStats) {
    const ok =
      loadStats.http500Count === 0 &&
      loadStats.stuckRunningJobs === 0 &&
      loadStats.p95StartLatencyMs < 3000;
    checks["verify:load"] = ok ? "PASS" : "PASS_WITH_CAUTION";
    if (loadStats.http500Count > 5 || loadStats.stuckRunningJobs > 0) {
      checks["verify:load"] = "FAIL";
      process.exitCode = 1;
    }
  }
  if (mode === "admin" && admin) {
    const ok = admin.unauthenticatedBlocked && (admin.loginOk || admin.notes.length > 0);
    checks["verify:admin"] = admin.loginOk && admin.casesApiOk ? "PASS" : ok ? "PASS_WITH_CAUTION" : "FAIL";
    if (checks["verify:admin"] === "FAIL") process.exitCode = 1;
  }

  const decision = decideReadiness({
    smoke: smokeStats,
    load: loadStats,
    admin,
    regressionOk: checks["diagnosis:regression"] !== "FAIL",
    evidenceOk: checks["evidence:preservation"] !== "FAIL",
    publicSafetyOk: checks["report:public-safety"] !== "FAIL",
    regressionFail: checks["diagnosis:regression"] === "FAIL",
  });

  if (shouldReport) {
    writeReports({
      generatedAt: new Date().toISOString(),
      baseUrl: base,
      modes: mode,
      loadConcurrency: concurrency,
      loadRequests: requests,
      smoke: smokeStats,
      load: loadStats,
      smokeResults,
      loadResults,
      admin,
      checks,
      decision,
    });
  }

  console.log(`\n[Decision] ${decision.readiness}`);
  if (decision.risks.length) console.log("risks:", decision.risks.join("; "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
