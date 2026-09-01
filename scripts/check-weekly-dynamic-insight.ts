import { buildWeeklyInsights } from "../lib/weekly/copy";
import { buildWeeklyNarrative } from "../lib/weekly/narrative";

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures.push(detail ? `${name}: ${detail}` : name);
    console.error(`FAIL  ${failures[failures.length - 1]}`);
  }
}

function main() {
  console.log("[Weekly Dynamic Insight Check]");
  const highNotice = buildWeeklyInsights({
    personalInfoRate: 92,
    attentionNeededRate: 83,
    publicCount: 20,
    publicExternalToolCount: 18,
    schoolCount: 0,
    retentionGapCount: 10,
    destructionGapCount: 8,
    topIssue: "고지문 미흡",
    grade: "주의",
    scoreDelta: 1.6,
  });
  const downRisk = buildWeeklyInsights({
    personalInfoRate: 70,
    attentionNeededRate: 60,
    publicCount: 0,
    publicExternalToolCount: 0,
    schoolCount: 4,
    retentionGapCount: 0,
    destructionGapCount: 0,
    topIssue: "담당자 연락처 미흡",
    grade: "위험",
    scoreDelta: -3,
    sensitiveRate: 12,
  });
  const a = highNotice.map((row) => row.text).join("\n");
  const b = downRisk.map((row) => row.text).join("\n");
  check("insights differ by week data", a !== b);
  check("high notice mentions 표준 고지문 or 고지문 미흡", a.includes("고지문"));
  check("down week mentions 하락", b.includes("하락"));
  check("school only when present", b.includes("학교·교육기관") && !a.includes("학교·교육기관"));
  check("sensitive insight when rate high", b.includes("민감정보"));

  const n1 = buildWeeklyNarrative({
    weekLabel: "w1",
    analyzable: 144,
    personalInfoCount: 132,
    personalInfoRate: 91.7,
    attentionNeededCount: 119,
    attentionNeededRate: 82.6,
    sensitiveCount: 1,
    sensitiveRate: 1,
    avgScore: 49.2,
    grade: "주의",
    scoreDelta: 1.6,
    publicPersonalInfoCount: 83,
    publicExternalToolCount: 83,
    schoolCount: 0,
    topIssue: "고지문 미흡",
    previousTopIssue: null,
    previousPersonalInfoRate: 90,
    previousAttentionRate: 80,
    previousPublicExternalTool: 70,
    platforms: [],
    orgs: [],
    questionTop: [],
    retentionGap: 1,
    destructionGap: 1,
  });
  const n2 = buildWeeklyNarrative({
    weekLabel: "w2",
    analyzable: 11,
    personalInfoCount: 11,
    personalInfoRate: 100,
    attentionNeededCount: 4,
    attentionNeededRate: 36,
    sensitiveCount: 0,
    sensitiveRate: 0,
    avgScore: 40.8,
    grade: "주의",
    scoreDelta: -6,
    publicPersonalInfoCount: 0,
    publicExternalToolCount: 0,
    schoolCount: 5,
    topIssue: "담당자 연락처 미흡",
    previousTopIssue: "고지문 미흡",
    previousPersonalInfoRate: 90,
    previousAttentionRate: 80,
    previousPublicExternalTool: 0,
    platforms: [],
    orgs: [],
    questionTop: [],
    retentionGap: 0,
    destructionGap: 0,
  });
  check("narratives differ across weeks", n1.join(" ") !== n2.join(" "));

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-dynamic-insight-check PASS");
}

main();
