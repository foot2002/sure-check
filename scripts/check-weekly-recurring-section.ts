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
  console.log("[Weekly Recurring Section Check]");
  const detail = read("components/weekly/WeeklyDetailView.tsx");
  const editorial = read("components/weekly/WeeklyEditorial.tsx");
  check("collapsed checklists component used", detail.includes("<WeeklyCollapsedChecklists"));
  check("full checklist is inside details", editorial.includes("<details") && editorial.includes("전체 체크리스트 보기"));
  check(
    "respondent tips not a standalone mid-body section",
    !detail.includes("WEEKLY_RESPONDENT_TIPS.title") &&
      detail.includes("WeeklyCollapsedChecklists"),
  );
  const collapsedAt = detail.indexOf("<WeeklyCollapsedChecklists");
  const narrativeAt = detail.indexOf("이번 주 해설");
  check("checklists after narrative", collapsedAt > narrativeAt);
  const qualityAt = detail.indexOf("진단 신뢰도 및 한계");
  check("quality remains at bottom", qualityAt > collapsedAt);

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-recurring-section-check PASS");
}

main();
