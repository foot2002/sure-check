import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  console.log("[Weekly Evidence Unit Check]");

  const types = read("lib/weekly/types.ts");
  const detail = read("components/weekly/WeeklyDetailView.tsx");
  const gen = read("lib/weekly/generateWeeklyReport.ts");
  const dash = read("lib/report/buildPublicDashboard.ts");

  check("metrics have evidenceSurveyCount", types.includes("evidenceSurveyCount: number"));
  check("metrics have evidenceImageCount", types.includes("evidenceImageCount: number"));
  check(
    "core stats or quality use 증빙 확보 설문",
    detail.includes("증빙 확보 설문"),
  );
  check("quality uses 증빙 캡처 이미지", detail.includes("증빙 캡처 이미지"));
  check("survey unit uses 건", detail.includes('fmt(evidenceSurveyCount, "건")'));
  check("quality uses 개 for images", detail.includes('fmt(evidenceImageCount, "개")'));
  check(
    "quality explains survey vs image unit",
    detail.includes("설문 건수와 다른 단위입니다"),
  );
  check(
    "evidence period labeled",
    detail.includes("이번 주") && detail.includes("전체 누적"),
  );
  check(
    "generate maps evidence survey and image",
    gen.includes("evidenceSurveyCount: dash.diagnosisQualityStats.evidenceSurveyCount") &&
      gen.includes("evidenceImageCount: dash.diagnosisQualityStats.evidenceImageCount"),
  );
  check(
    "dashboard distinguishes survey ids vs captured pages",
    dash.includes("evidenceSurveyIds") && dash.includes("evidenceImageCount"),
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:evidence-unit-check PASS");
}

main();
