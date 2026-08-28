import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchesCollectorHoldReason } from "@/lib/collector/collectorDashboardLabels";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures.push(name);
    console.error(`FAIL  ${name}`);
  }
}

function main() {
  const view = read("components/report/admin/CollectorConsoleView.tsx");
  const page = read("app/report/admin/collector/page.tsx");
  check("quick filter 진단대상", view.includes("진단대상"));
  check("quick filter 진단완료", view.includes("진단완료"));
  check("quick filter 날짜불명", view.includes("날짜불명 보류"));
  check("quick filter 과거연도", view.includes("과거연도 제외"));
  check("quick filter 로그인 제외", view.includes("로그인 제외"));
  check("quick filter 공공 사이트", view.includes("공공 사이트 수집"));
  check("quick filter 네이버", view.includes("네이버 검색 수집"));
  check("applyQuick exists", view.includes("function applyQuick"));
  check("page passes holdReason", page.includes("holdReason"));
  check("list supports holdReason", read("lib/collector/queries.ts").includes("holdReason"));
  check(
    "eligible matcher",
    matchesCollectorHoldReason({ autoDiagnosisTarget: true }, "eligible"),
  );
  check(
    "old year matcher",
    matchesCollectorHoldReason({ status: "stale", reasonCode: "stale_year" }, "old_year"),
  );
  check(
    "restricted matcher",
    matchesCollectorHoldReason({ status: "restricted" }, "restricted"),
  );
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\ncollect:quick-filter-check PASS");
}

main();
