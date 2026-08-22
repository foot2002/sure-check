/**
 * Priority evidence queue: A/high/public/missing evidence, async enqueue only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isPriorityEvidenceCandidate,
  pickPriorityEvidenceCases,
  PRIORITY_EVIDENCE_MAX_ENQUEUE,
} from "../lib/report/priorityEvidenceQueue";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

console.log("[Evidence Priority Queue Check]\n");

assert.equal(PRIORITY_EVIDENCE_MAX_ENQUEUE, 5);

const ready = {
  id: "ok",
  outreachPriority: "A",
  overallRiskLevel: "critical",
  publicPrivateType: "public",
  hasPersonalInfo: true,
  platform: "google_forms",
  outreachUiStatus: "unreviewed",
  evidenceStatus: "증거 부족",
};
assert.equal(isPriorityEvidenceCandidate(ready), true);
assert.equal(
  isPriorityEvidenceCandidate({ ...ready, outreachPriority: "B" }),
  false,
);
assert.equal(
  isPriorityEvidenceCandidate({ ...ready, evidenceStatus: "증거 확보" }),
  false,
);
assert.equal(
  isPriorityEvidenceCandidate({ ...ready, publicPrivateType: "private" }),
  false,
);

const picked = pickPriorityEvidenceCases(
  [ready, { ...ready, id: "2" }, { ...ready, id: "3" }, { ...ready, id: "4" }, { ...ready, id: "5" }, { ...ready, id: "6" }],
  5,
);
assert.equal(picked.length, 5);
console.log("  PASS  priority evidence filter and top-5 cap");

{
  const route = source("app/api/report/admin/evidence/priority-queue/route.ts");
  assert.ok(route.includes("enqueuePendingCaptureJob"));
  assert.ok(!route.includes("processCaptureJob"));
  assert.ok(route.includes("PRIORITY_EVIDENCE_MAX_ENQUEUE"));
  assert.ok(route.includes("processInline: false") || route.includes("async: true"));
  const view = source("components/report/admin/AdminConsoleView.tsx");
  assert.ok(view.includes("우선 증빙 생성 대상"));
  assert.ok(view.includes("상위 5건 증빙 생성"));
  assert.ok(view.includes("비동기 큐에 등록"));
  const collect = source("components/report/admin/CollectorConsoleView.tsx");
  assert.ok(collect.includes("우선 증빙 생성 대상"));
  console.log("  PASS  async capture enqueue only, no bulk/sync capture");
}

console.log("\nevidence-priority-queue-check: ok");
