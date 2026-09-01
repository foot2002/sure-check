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
    "page headline",
    page.includes("대한민국 온라인 수집 개인정보 보호지수가 100이 될때까지") &&
      page.includes("소중한 우리의 개인정보를 지킵니다"),
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
  check("privacy trend panel", list.includes("PrivacyIndexTrendPanel"));
  check(
    "privacy trend before featured card",
    list.lastIndexOf("<PrivacyIndexTrendPanel") >= 0 &&
      list.lastIndexOf("<PrivacyIndexTrendPanel") < list.indexOf("최신 주간 리포트"),
  );
  check("grid cards", list.includes("md:grid-cols-2"));
  check("list uses 1-decimal scores", list.includes("formatScore1"));
  check("list shows diagnosis counts", list.includes("personalInfoCount") && list.includes("attentionNeededCount"));
  check("featured key findings", list.includes("buildKeyFindings") && list.includes("WeeklyKeyFindings"));
  check("list has no 공개 진단 사례", !list.includes("공개 진단 사례"));
  check("list case compact whyRisky", list.includes("whyRisky"));

  const panel = exists("components/weekly/PrivacyIndexTrendPanel.tsx")
    ? read("components/weekly/PrivacyIndexTrendPanel.tsx")
    : "";
  const charts = exists("components/weekly/WeeklyCharts.tsx")
    ? read("components/weekly/WeeklyCharts.tsx")
    : "";
  check("shared privacy index panel exists", panel.includes("export function PrivacyIndexTrendPanel"));
  check("weekly monthly toggle", panel.includes("주간") && panel.includes("월간"));
  check("formula box", panel.includes("WEEKLY_PRIVACY_INDEX_FORMULA") || panel.includes("계산 산식"));
  check("grade meaning box", panel.includes("점수대별 의미"));
  check("animated svg chart", charts.includes("weekly-chart-line") && charts.includes("pathLength"));
  check("no chart library import", !charts.includes("recharts") && !charts.includes("chart.js"));
  check("detail uses same panel", detail.includes("PrivacyIndexTrendPanel"));
  check("detail uses shared chart", detail.includes("WeeklyTrendChart"));

  check("detail list button", detail.includes("목록보기") && detail.includes('href="/weekly"'));
  check("detail report button", detail.includes("수집실태 리포트 보기"));
  check("press copy button", exists("components/weekly/WeeklyPressCopy.tsx"));
  check("press copy label", read("components/weekly/WeeklyPressCopy.tsx").includes("요약 복사"));
  check("detail quality section", detail.includes("진단 신뢰도 및 한계"));
  check("detail insights", detail.includes("정책적 인사이트"));
  check("detail checklist", detail.includes("기관·기업 개선 체크리스트"));
  check("no chart library import", !detail.includes("recharts") && !detail.includes("chart.js"));
  check("detail 1-decimal scores", detail.includes("formatScore1"));
  check("detail key findings", detail.includes("<WeeklyKeyFindings"));
  check("detail press box", detail.includes("<WeeklyPressBox"));
  check("detail public sector", detail.includes("<WeeklyPublicSectorBlock"));
  check("detail evidence survey card", detail.includes("증빙 확보 설문"));
  check("detail evidence image quality", detail.includes("증빙 캡처 이미지"));

  const findingsAt = detail.indexOf("<WeeklyKeyFindings");
  const pressAt = detail.indexOf("<WeeklyPressBox");
  const indexAt = detail.indexOf("<PrivacyIndexTrendPanel");
  const statsAt = detail.indexOf("핵심 통계");
  const publicAt = detail.indexOf("<WeeklyPublicSectorBlock");
  const casesAt = detail.indexOf("대표 개인정보 위험 사례");
  const platformAt = detail.indexOf("플랫폼별 분석");
  const orgAt = detail.indexOf("기관유형별 분석");
  check(
    "detail section order: findings then press then index",
    findingsAt >= 0 && pressAt > findingsAt && indexAt > pressAt,
  );
  check(
    "detail section order: public and cases before platform/org",
    publicAt > statsAt &&
      casesAt > publicAt &&
      platformAt > casesAt &&
      orgAt > platformAt,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-main-card-check PASS");
}

main();
