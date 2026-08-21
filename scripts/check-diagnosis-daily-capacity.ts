/**
 * Auto-diagnosis capacity: keep scanBatch=3, show 100/day target vs ~66 max.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIAGNOSIS_COMPLETED_DAILY_TARGET,
  estimatedDiagnosisMaxPerDay,
  SCAN_WORKER_CRON_PATH,
  SCAN_WORKER_DEFAULT_BATCH,
  SCAN_WORKER_FUTURE_BATCH,
  countCronJobsForPath,
} from "../lib/collector/opsCapacityPolicy";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Diagnosis Daily Capacity Check]\n");

{
  assert.equal(SCAN_WORKER_DEFAULT_BATCH, 3);
  assert.equal(SCAN_WORKER_FUTURE_BATCH, 5);
  assert.equal(DIAGNOSIS_COMPLETED_DAILY_TARGET, 100);
  const vercel = JSON.parse(source("vercel.json")) as {
    crons?: Array<{ path?: string }>;
  };
  const workerRuns = countCronJobsForPath(vercel.crons || [], SCAN_WORKER_CRON_PATH);
  assert.equal(workerRuns, 22);
  assert.equal(estimatedDiagnosisMaxPerDay(), 66);
  assert.equal(estimatedDiagnosisMaxPerDay(5, 22), 110);
  console.log("  PASS  scanBatch 3 × 22 worker runs = 66/day max (100 target needs later scale)");
}

{
  const route = source("app/api/internal/jobs/run-next/route.ts");
  assert.ok(route.includes("let scanBatch = 3"));
  assert.ok(!/let scanBatch = 5/.test(route));
  console.log("  PASS  worker default scanBatch stays 3");
}

{
  const view = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(view.includes("오늘 정상 진단 완료"));
  assert.ok(view.includes("목표 100건"));
  assert.ok(view.includes("현재 worker 설정 기준 최대 처리량"));
  assert.ok(view.includes("scanBatch 상향"));
  assert.ok(view.includes("scanBatch=3"));
  assert.ok(view.includes("오늘 자동진단 시도"));
  assert.ok(view.includes("오늘 자동진단 완료"));
  assert.ok(view.includes("오늘 타임아웃"));
  assert.ok(view.includes("남은 pending"));
  console.log("  PASS  collector dashboard shows diagnosis capacity vs 100/day target");
}

{
  const queries = source("lib/collector/queries.ts");
  assert.ok(queries.includes("SCAN_WORKER_DEFAULT_BATCH"));
  assert.ok(queries.includes("DIAGNOSIS_COMPLETED_DAILY_TARGET"));
  assert.ok(queries.includes("estimatedMaxPerDay"));
  console.log("  PASS  summary loader computes capacity from current worker settings");
}

console.log("\ndiagnosis-daily-capacity-check: ok");
