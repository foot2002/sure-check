import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function exists(rel: string): boolean {
  return existsSync(resolve(process.cwd(), rel));
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
  console.log("[Weekly Main Card Check]");

  check("weekly page exists", exists("app/weekly/page.tsx"));
  check("weekly list view exists", exists("components/weekly/WeeklyListView.tsx"));
  check("weekly detail exists", exists("app/weekly/[weekId]/page.tsx"));

  const page = read("app/weekly/page.tsx");
  const list = read("components/weekly/WeeklyListView.tsx");
  const detail = read("components/weekly/WeeklyDetailView.tsx");

  check("page title", page.includes("SURE Check 주간 리포트"));
  check(
    "page subtitle",
    page.includes("공개 온라인 설문에서 확인된 개인정보 수집·고지 미흡 신호를 주간"),
  );
  check("disclaimer copy", page.includes("개별 기관이나 기업을 지목하지 않고"));
  check("featured card", list.includes("최신 주간 리포트"));
  check("featured CTA", list.includes("이번 주 리포트 보기"));
  check("card list CTA", list.includes("상세 리포트 보기"));
  check("partial badge", list.includes("부분 주간"));
  check("filter 전체", list.includes('label: "전체"'));
  check("filter 최근 4주", list.includes("최근 4주"));
  check("filter 공공부문", list.includes("공공부문 이슈"));
  check("filter 학교", list.includes("학교·교육기관 이슈"));
  check("sort 최신순", list.includes("최신순"));
  check("sort score", list.includes("개인정보 보호 수준지수 낮은순"));
  check("anonymous cases section", list.includes("대표 개인정보 위험 사례"));
  check("checklist summary", list.includes("운영자 개선 체크리스트 요약"));
  check("report shortcut", list.includes("수집실태 리포트 바로가기"));
  check("privacy trend", list.includes("개인정보 보호 수준지수 추세 요약"));
  check("grid cards", list.includes("md:grid-cols-2"));

  check("detail list button", detail.includes("목록보기") && detail.includes('href="/weekly"'));
  check("detail report button", detail.includes("수집실태 리포트 보기"));
  check("press copy button", exists("components/weekly/WeeklyPressCopy.tsx"));
  check("press copy label", read("components/weekly/WeeklyPressCopy.tsx").includes("요약 복사"));
  check("detail quality section", detail.includes("진단 신뢰도 및 한계"));
  check("detail insights", detail.includes("정책적 인사이트"));
  check("detail checklist", detail.includes("기관·기업 개선 체크리스트"));
  check("no chart library import", !detail.includes("recharts") && !detail.includes("chart.js"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-main-card-check PASS");
}

main();
