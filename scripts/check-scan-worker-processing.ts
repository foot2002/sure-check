/**
 * Scan worker claims pending jobs and syncs survey_diagnosis_links.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { linkageStatusFromScanOutcome } from "../lib/collector/diagnosisLinkRepository";
import { recoverStaleScanJobs } from "../lib/jobs/scanJobQueue";
import { processNextScanJob } from "../lib/jobs/processScanJob";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Scan Worker Processing Check]\n");

assert.equal(typeof processNextScanJob, "function");
assert.equal(typeof recoverStaleScanJobs, "function");
console.log("  PASS  processNextScanJob / recoverStaleScanJobs exported");

{
  assert.equal(
    linkageStatusFromScanOutcome({
      scanStatus: "completed",
    }),
    "completed",
  );
  assert.equal(
    linkageStatusFromScanOutcome({
      scanStatus: "limited",
      limitedReason: "Google Forms 응답이 종료되었습니다.",
    }),
    "skipped_closed",
  );
  assert.equal(
    linkageStatusFromScanOutcome({
      scanStatus: "limited",
      limitedReason: "로그인이 필요합니다.",
    }),
    "skipped_restricted",
  );
  assert.equal(
    linkageStatusFromScanOutcome({
      scanStatus: "failed",
      errorMessage: "진단 중 오류가 발생했습니다.",
    }),
    "failed_retryable",
  );
  assert.equal(
    linkageStatusFromScanOutcome({
      scanStatus: "limited",
      errorMessage: "진단 시간이 초과되어 제한 처리되었습니다. 다시 시도해 주세요.",
    }),
    "timeout",
  );
  console.log("  PASS  scan outcomes map to linkage statuses");
}

{
  const worker = source("lib/jobs/processScanJob.ts");
  assert.ok(worker.includes("syncCollectorDiagnosisLink"));
  assert.ok(worker.includes("processClaimedScanJob"));
  console.log("  PASS  worker syncs survey_diagnosis_links on terminal status");
}

{
  const route = source("app/api/internal/jobs/run-next/route.ts");
  assert.ok(route.includes("processNextScanJob"));
  assert.ok(!route.includes('kind = "capture"'));
  assert.ok(route.includes("scanBatch"));
  console.log("  PASS  run-next cron processes scan jobs (not capture-only)");
}

{
  const queue = source("lib/jobs/scanJobQueue.ts");
  assert.ok(queue.includes("recoverStaleScanJobs"));
  assert.ok(queue.includes("syncDiagnosisLinksByExternalScanIds"));
  const recoverFn = queue.slice(
    queue.indexOf("export async function recoverStaleScanJobs"),
    queue.indexOf("export async function markScanJobClientTimeout"),
  );
  assert.ok(recoverFn.includes('.eq("status", "running")'));
  assert.ok(!recoverFn.includes("pending"));
  console.log("  PASS  stale recover only expires running jobs, not queued pending");
}

console.log("\nresult: PASS");
