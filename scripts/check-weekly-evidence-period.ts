import { evidencePeriodLabel } from "../lib/weekly/narrative";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  console.log("[Weekly Evidence Period Check]");
  check("greater than analyzable is 전체 누적", evidencePeriodLabel(205, 144) === "전체 누적");
  check("within week is 이번 주", evidencePeriodLabel(80, 144) === "이번 주");
  const detail = read("components/weekly/WeeklyDetailView.tsx");
  check("detail uses evidencePeriodLabel", detail.includes("evidencePeriodLabel"));
  check("detail prints period label", detail.includes("{evidencePeriod} 증빙 확보 설문"));

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-evidence-period-check PASS");
}

main();
