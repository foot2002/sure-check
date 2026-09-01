import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAnonymousCases,
  selectWeeklyFeaturedCases,
} from "../lib/weekly/anonymousCases";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures.push(detail ? `${name}: ${detail}` : name);
    console.error(`FAIL  ${failures[failures.length - 1]}`);
  }
}

function main() {
  console.log("[Weekly Risk Case Selection Check]");
  const all = buildAnonymousCases({
    schoolCount: 7,
    publicCount: 80,
    medicalCount: 3,
    personalInfoCount: 132,
    sensitiveCount: 11,
    highRiskCount: 9,
    publicExternalToolCount: 83,
    nameCount: 200,
    phoneCount: 180,
    emailCount: 90,
    affiliationCount: 70,
    analyzableCount: 144,
    noticeGaps: ["고지문 미흡"],
    topTool: "Google Forms",
  });
  const picked = selectWeeklyFeaturedCases(all, 3);
  check("selects 2-3 cases", picked.length >= 2 && picked.length <= 3);
  check("does not keep full catalog on detail", picked.length < all.length || all.length <= 3);
  check(
    "generate uses selectWeeklyFeaturedCases",
    read("lib/weekly/generateWeeklyReport.ts").includes("selectWeeklyFeaturedCases"),
  );
  check(
    "detail title is 이번 주 대표",
    read("components/weekly/WeeklyDetailView.tsx").includes("이번 주 대표 개인정보 위험 사례"),
  );
  check(
    "list keeps type catalog",
    read("app/weekly/page.tsx").includes("weeklyCaseCatalog"),
  );

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-risk-case-selection-check PASS");
}

main();
