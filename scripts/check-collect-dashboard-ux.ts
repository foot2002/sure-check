import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectorDiagnosisLabelKo,
  collectorFreshnessLabelKo,
  collectorLaneLabelKo,
  collectorStatusLabelKo,
  collectorTriageLabelKo,
  matchesCollectorHoldReason,
} from "@/lib/collector/collectorDashboardLabels";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  failures.push(detail ? `${name}: ${detail}` : name);
  console.error(`FAIL  ${name}${detail ? `: ${detail}` : ""}`);
}

function main() {
  const view = read("components/report/admin/CollectorConsoleView.tsx");
  check("today collection/diagnosis flow", view.includes("오늘 수집·진단 흐름"));
  check("today vs total heading", view.includes("오늘 공식 사이트 수집") && view.includes("전체 누적 통계"));
  check("today date unknown label", view.includes("오늘 공식 사이트 날짜 불명 보류"));
  check("total date unknown label", view.includes("전체 날짜 불명 보류"));
  check("today recent eligible", view.includes("오늘 공식 사이트 최근 60일 적격"));
  check("total eligible", view.includes("전체 공식 사이트 적격 설문"));
  check("naver plain labels", view.includes("네이버 검색 후보") && view.includes("새로 저장한 설문 링크"));
  check("official site copy", view.includes("네이버 검색과 별도로 동작합니다"));
  check("quality source_page_url", view.includes("source_page_url 저장률"));
  check("real source page rate", view.includes("실제 게시글·하위페이지 저장률"));
  check("today unknown ratio", view.includes("오늘 날짜 불명 비율"));
  check("total unknown ratio", view.includes("전체 날짜 불명 비율"));
  check("seed mismatch", view.includes("seed 오매핑 의심"));
  check("hold reason summary", view.includes("보류·제외 사유 요약"));
  check("quick filters", view.includes("날짜불명 보류") && view.includes("공식 사이트 수집"));
  check("reset filter", view.includes("초기화") && view.includes("적용 필터:"));
  check("admin report link", view.includes("관리자 리포트에서 보기"));
  check("next 20 diagnose", view.includes("다음 20건 진단"));
  check("diagnose confirm copy", view.includes("자동진단 큐에 다음 20건을 등록합니다"));
  check("collapsible logs", view.includes("최근 수집 실행 상세") && view.includes("최근 공식 사이트 수집 로그"));
  check("korean status helper", collectorStatusLabelKo("active") === "응답 가능");
  check("korean discovered", collectorStatusLabelKo("discovered") === "발견됨");
  check("korean closed", collectorStatusLabelKo("closed") === "종료됨");
  check("korean restricted", collectorStatusLabelKo("restricted") === "접근제한");
  check("triage A", collectorTriageLabelKo("A_PRIORITY") === "우선순위 A");
  check("lane date unknown", collectorLaneLabelKo("date_unknown_hold") === "날짜 불명 보류");
  check("diagnosis undiagnosed", collectorDiagnosisLabelKo("undiagnosed") === "아직 진단 전");
  check("diagnosis completed", collectorDiagnosisLabelKo("completed") === "진단 완료");
  check(
    "freshness recent",
    collectorFreshnessLabelKo({ eligibleRecent: true }) === "최근 60일 적격",
  );
  check(
    "hold date unknown matcher",
    matchesCollectorHoldReason({ collectLane: "date_unknown_hold" }, "date_unknown"),
  );
  check("collect alias route", read("app/collect/page.tsx").includes("/report/admin/collector"));
  check(
    "admin diagnose uses dispatcher enqueue-only",
    read("app/api/report/admin/collector/diagnose/route.ts").includes("processInline: false") &&
      read("app/api/report/admin/collector/diagnose/route.ts").includes("ADMIN_DISPATCH_MAX = 20"),
  );
  const list = read("lib/collector/queries.ts");
  check("quick hold filter in list", list.includes("matchesCollectorHoldReason"));
  check("naver source filter", list.includes('sourceType === "naver"'));

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\ncollect-dashboard-ux-check PASS");
}

main();
