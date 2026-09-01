import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildWeeklyInsights } from "../lib/weekly/copy";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  const msg = detail ? `${name}: ${detail}` : name;
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}

function main() {
  console.log("[Weekly Policy Insight Check]");

  const insights = buildWeeklyInsights({
    personalInfoRate: 91.7,
    attentionNeededRate: 82.6,
    publicCount: 20,
    publicExternalToolCount: 18,
    schoolCount: 4,
    retentionGapCount: 30,
    destructionGapCount: 22,
  });
  const text = insights.map((row) => row.text).join("\n");
  check("insights 3-5", insights.length >= 3 && insights.length <= 5);
  check("standard notice insight", text.includes("표준 고지문"));
  check("public trust insight", text.includes("국민") && text.includes("신뢰"));
  check("retention/destruction insight", text.includes("보유기간") && text.includes("파기"));
  check("school insight when schoolCount > 0", text.includes("학교·교육기관"));

  const noPublic = buildWeeklyInsights({
    personalInfoRate: 90,
    attentionNeededRate: 80,
    publicCount: 0,
    publicExternalToolCount: 0,
    schoolCount: 3,
    retentionGapCount: 1,
    destructionGapCount: 1,
  });
  check(
    "public insight omitted when publicCount=0",
    !noPublic.some((row) => row.text.includes("공공부문 설문은 국민")),
  );
  check(
    "school insight kept when schoolCount > 0",
    noPublic.some((row) => row.text.includes("학교·교육기관")),
  );

  const noSchool = buildWeeklyInsights({
    personalInfoRate: 90,
    attentionNeededRate: 80,
    publicCount: 4,
    publicExternalToolCount: 3,
    schoolCount: 0,
    retentionGapCount: 0,
    destructionGapCount: 0,
  });
  check(
    "school insight omitted when schoolCount=0",
    !noSchool.some((row) => row.text.includes("학교·교육기관")),
  );

  const copy = read("lib/weekly/copy.ts");
  check("normalize rebuilds insights", copy.includes("insights: buildWeeklyInsights"));
  check(
    "generate uses buildWeeklyInsights",
    read("lib/weekly/generateWeeklyReport.ts").includes("insights: buildWeeklyInsights"),
  );
  check(
    "detail renders 정책적 인사이트",
    read("components/weekly/WeeklyDetailView.tsx").includes("정책적 인사이트"),
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:policy-insight-check PASS");
}

main();
