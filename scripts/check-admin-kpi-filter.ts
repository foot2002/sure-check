import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatDataCollectionBrief,
  matchesAdminDashboardView,
  pickTodayPriorityCases,
  type AdminDashboardView,
} from "@/lib/report/adminDashboardViews";
import { pickIssueBadges } from "@/lib/report/adminOutreach";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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

function sample(overrides: Record<string, unknown> = {}) {
  return {
    observedAt: "2026-08-21T00:00:00.000Z",
    overallRiskLevel: "high",
    userDecisionLabel: null,
    platform: "google_forms",
    hasPersonalInfo: true,
    publicPrivateType: "public",
    outreachPriority: "A",
    outreachUiStatus: "unreviewed",
    evidenceStatus: "증거 확보",
    publicCaseStatus: "private",
    ...overrides,
  };
}

function main() {
  const consoleView = read("components/report/admin/AdminConsoleView.tsx");
  const listLib = read("lib/report/adminCases.ts");
  const api = read("app/api/report/admin/cases/route.ts");
  const drawer = read("components/report/admin/AdminCaseDrawer.tsx");
  const rowActions = read("components/report/admin/AdminCaseRowActions.tsx");
  const outreach = read("lib/report/adminOutreach.ts");

  check("KPI group 오늘 검토해야 할 설문", consoleView.includes("오늘 검토해야 할 설문"));
  check("KPI group 증빙·리포트 준비 상태", consoleView.includes("증빙·리포트 준비 상태"));
  check("KPI group 자동진단 처리 상태", consoleView.includes("자동진단 처리 상태"));
  check("KPI group 공개 사례 상태", consoleView.includes("공개 사례 상태"));
  check("plain-language 검토 대상 전체", consoleView.includes("검토 대상 전체"));
  check("plain-language 고위험·신고검토", consoleView.includes("고위험·신고검토"));
  check("KPI tooltip help on cards", consoleView.includes("help=") && consoleView.includes("?"));
  check("KPI click applyView", /function applyView/.test(consoleView) && consoleView.includes('applyView("unreviewed")'));
  check("KPI click highOrReport", consoleView.includes('applyView("highOrReport")'));
  check("KPI click evidenceMissing", consoleView.includes('applyView("evidenceMissing")'));
  check("KPI click published", consoleView.includes('applyView("published")'));
  check("today action section", consoleView.includes("오늘 해야 할 일") && consoleView.includes("오늘 우선 확인할 설문"));
  check("usage guide", consoleView.includes("사용 안내") && consoleView.includes("위법 여부를 확정하지 않습니다"));
  check("filter reset", consoleView.includes("필터 초기화"));
  check("applied filters label", consoleView.includes("적용 필터:"));
  check("custom date preserved", consoleView.includes("기간 설정") && /type="date"/.test(consoleView));
  check("filter groups", consoleView.includes("업무 상태") && consoleView.includes("위험도") && consoleView.includes("문제 유형"));
  check("table issue badges slice 3", consoleView.includes("issueBadges.slice(0, 3)"));
  check("readable data summary", consoleView.includes("formatDataCollectionBrief") && consoleView.includes("민감정보 포함"));
  check("evidence column", consoleView.includes(">증빙<"));
  check("row actions visible", rowActions.includes("검토") && rowActions.includes("원본") && rowActions.includes("리포트") && rowActions.includes("증빙"));
  check("P/S/H removed from console", !/P\/S\/H/.test(consoleView));
  check("no 공개 상태 label", !consoleView.includes("공개 상태"));
  check("public case wording", consoleView.includes("공개 사례") && consoleView.includes("공개중"));
  check("KPI from scopedCases", /totalScans:\s*scopedCases\.length/.test(listLib));
  check("list filters after KPI", /const dashboardView = normalizeAdminDashboardView/.test(listLib));
  check("search applied after KPI", /const q = \(query\.q/.test(listLib));
  check("view query on admin API", /searchParams\.get\("view"\)/.test(api));
  check("todayTasks in payload", /todayTasks/.test(listLib));
  check("drawer technical info collapsed", drawer.includes("기술정보") && /<details/.test(drawer));
  check("drawer keeps 개선안내 판단 order", read("components/report/admin/AdminOutreachSections.tsx").includes("개선안내 판단"));
  check("issue badges cap at 3", /badges\.length < 3/.test(outreach) && /slice\(0, 3\)/.test(outreach));
  check("search result copy", consoleView.includes("전체 조건") && consoleView.includes("검색 결과"));

  const unreviewed = sample({ outreachUiStatus: "unreviewed" });
  const reviewed = sample({ outreachUiStatus: "candidate" });
  check(
    "view unreviewed matches only unreviewed",
    matchesAdminDashboardView(unreviewed, "unreviewed") &&
      !matchesAdminDashboardView(reviewed, "unreviewed"),
  );
  check(
    "view highOrReport matches critical/high",
    matchesAdminDashboardView(sample({ overallRiskLevel: "critical" }), "highOrReport") &&
      !matchesAdminDashboardView(sample({ overallRiskLevel: "low", userDecisionLabel: "정상" }), "highOrReport"),
  );
  check(
    "view published matches published cases",
    matchesAdminDashboardView(sample({ publicCaseStatus: "published" }), "published"),
  );

  const today = pickTodayPriorityCases([
    sample({ outreachPriority: "C", outreachUiStatus: "done", overallRiskLevel: "low" }),
    sample({
      outreachPriority: "A",
      outreachUiStatus: "unreviewed",
      overallRiskLevel: "critical",
      observedAt: "2026-08-21T10:00:00.000Z",
    }),
  ]);
  check("today tasks prefer unreviewed A", today.length === 1 && today[0]?.outreachPriority === "A");

  const brief = formatDataCollectionBrief({
    personalCount: 5,
    sensitiveCount: 1,
    categoryLabels: ["이름", "연락처", "이메일"],
    hasPersonalInfo: true,
    hasSensitiveInfo: true,
  });
  check("data brief headline", brief.headline === "개인정보 5개");
  check("data brief items", brief.items === "이름 · 연락처 · 이메일");
  check("data brief sensitive", brief.hasSensitive);

  const badges = pickIssueBadges({
    findingTitles: [
      "고지문 미흡",
      "수집 항목 안내 미흡",
      "보유기간 확인 필요",
      "Google Forms HTML 진단",
      "platform_parser",
    ],
    isPublic: true,
  });
  check("badges max 3", badges.length <= 3);
  check(
    "technical badges excluded",
    !badges.some((b) => /HTML|platform_parser|parser/i.test(b)),
  );

  const views: AdminDashboardView[] = ["unreviewed", "highOrReport", "outreach", "published"];
  check("dashboard views defined", views.every((v) => typeof v === "string"));

  assert(!failures.length, `${failures.length} check(s) failed`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nadmin:kpi-filter-check PASS");
}

main();
