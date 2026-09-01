import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WEEKLY_OPERATOR_QUOTE, buildHeadline, buildPressSummary } from "../lib/weekly/copy";

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
  console.log("[Weekly Press Summary Check]");

  const headline = buildHeadline(144, 132);
  const press = buildPressSummary({
    weekLabel: "2026년 8월 4주차 (8.24~8.30)",
    headline,
    analyzable: 144,
    personalInfoCount: 132,
    personalInfoRate: 91.7,
    attentionNeededCount: 119,
    attentionNeededRate: 82.6,
    publicExternalToolCount: 62,
    publicNarrative: "공공부문 확인 필요 신호가 반복적으로 나타났습니다.",
  });

  check("has 보도 제목 후보", press.includes("보도 제목 후보"));
  check("has 리드문", press.includes("리드문"));
  check("has 핵심 통계", press.includes("핵심 통계"));
  check("has 운영팀 코멘트", press.includes("운영팀 코멘트") && press.includes(WEEKLY_OPERATOR_QUOTE));
  check("no 위반 확정", !press.includes("위반 확정"));
  check("no 불법", !press.includes("불법"));
  check("three key stats", (press.match(/^- /gm) || []).length >= 3);

  const detail = read("components/weekly/WeeklyDetailView.tsx");
  const findingsAt = detail.indexOf("<WeeklyKeyFindings");
  const pressAt = detail.indexOf("<WeeklyPressBox");
  const indexAt = detail.indexOf("<PrivacyIndexTrendPanel");
  check(
    "WeeklyPressBox is after findings and before index",
    findingsAt >= 0 && pressAt > findingsAt && pressAt < indexAt,
  );

  const pressCopy = read("components/weekly/WeeklyPressCopy.tsx");
  check("copy button exists", pressCopy.includes("요약 복사"));
  check("editorial press box uses compact copy", read("components/weekly/WeeklyEditorial.tsx").includes("compact"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:press-summary-check PASS");
}

main();
