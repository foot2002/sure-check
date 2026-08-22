/**
 * Admin dashboard counts: evidence/priority section and existing KPI cards.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchesAdminDashboardView } from "../lib/report/adminDashboardViews";
import { isPriorityEvidenceCandidate } from "../lib/report/priorityEvidenceQueue";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

console.log("[Admin Dashboard Count Check]\n");

const consoleView = read("components/report/admin/AdminConsoleView.tsx");
const casesLib = read("lib/report/adminCases.ts");
assert(consoleView.includes("우선 증빙 생성 대상"), "priority evidence section");
assert(consoleView.includes("상위 5건 증빙 생성"), "top 5 button");
assert(consoleView.includes("목록 보기"), "list button");
assert(casesLib.includes("priorityEvidenceCount"), "kpi count");
assert(casesLib.includes("priorityEvidence"), "payload list");
assert(consoleView.includes("증빙 부족"), "evidence missing card");
assert(consoleView.includes("검토 대상 전체") || consoleView.includes("오늘 검토해야 할 설문"), "review kpi");

const sample = {
  id: "1",
  outreachPriority: "A",
  overallRiskLevel: "high",
  publicPrivateType: "public",
  hasPersonalInfo: true,
  platform: "google_forms",
  outreachUiStatus: "unreviewed",
  evidenceStatus: "캡처 필요",
  observedAt: "2026-08-21T00:00:00.000Z",
  userDecisionLabel: null,
  publicCaseStatus: "private",
};
assert(isPriorityEvidenceCandidate(sample), "priority candidate matches");
assert(
  matchesAdminDashboardView(sample, "priorityEvidence"),
  "dashboard view matches priority evidence",
);
assert(
  !matchesAdminDashboardView({ ...sample, outreachPriority: "C" }, "priorityEvidence"),
  "C priority excluded",
);

console.log("  PASS  admin dashboard counts and priority evidence wiring");
console.log("\nadmin-dashboard-count-check: ok");
