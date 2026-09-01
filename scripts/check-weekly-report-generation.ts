import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatWeekLabel, getKstWeek, isCompletedReportWeek, latestCompletedKstWeek, mondayOfIso } from "../lib/weekly/week";
import { weeklyPrivacyGrade, monthlyPrivacyIndexSeries, privacyIndexChartRange, roundScore1 } from "../lib/weekly/privacyIndex";
import { buildHeadline, buildPressSummary, buildWeeklyInsights } from "../lib/weekly/copy";
import { buildAnonymousCases } from "../lib/weekly/anonymousCases";
import { isPublicWeeklyIssue } from "../lib/weekly/issueCopy";

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
  console.log("[Weekly Report Generation Check]");

  const w = getKstWeek("2026-08-24");
  check("weekId is Monday", w.weekId === "2026-08-24");
  check("week end is Sunday", w.weekEnd === "2026-08-30");
  check(
    "August week 4 label",
    w.label === "2026년 8월 4주차 (8.24~8.30)",
    w.label,
  );

  const w5 = getKstWeek("2026-08-31");
  check(
    "August week 5 crosses September",
    w5.label === "2026년 8월 5주차 (8.31~9.06)",
    w5.label,
  );

  const july = getKstWeek("2026-07-24");
  check("July 24 uses July weekStart", july.weekStart === "2026-07-20");
  check(
    "July 24 is not August week 4",
    !july.label.includes("8월 4주차"),
    july.label,
  );
  check(
    "crossing month uses weekStart month",
    formatWeekLabel("2026-07-27", "2026-08-02") ===
      "2026년 7월 4주차 (7.27~8.02)",
  );
  check("mondayOfIso normalizes Friday", mondayOfIso("2026-08-28") === "2026-08-24");
  check(
    "in-progress week is not complete on Sep 1",
    isCompletedReportWeek("2026-08-31", "2026-09-01") === false,
  );
  check(
    "in-progress week is not complete on Sunday",
    isCompletedReportWeek("2026-08-31", "2026-09-06") === false,
  );
  check(
    "week becomes complete the next day",
    isCompletedReportWeek("2026-08-31", "2026-09-07") === true,
  );
  check(
    "latest completed on Sep 1 is Aug 24 week",
    latestCompletedKstWeek(new Date("2026-09-01T05:00:00.000Z")).weekId ===
      "2026-08-24",
  );
  check(
    "chart range uses min-15 max+15",
    JSON.stringify(privacyIndexChartRange([40.8, 49.3])) ===
      JSON.stringify({ yMin: 25.8, yMax: 64.3 }),
  );

  check("grade 47.9 is 주의", weeklyPrivacyGrade(47.9) === "주의");
  check("grade 62 is 보통", weeklyPrivacyGrade(62) === "보통");
  check("grade 80 is 양호", weeklyPrivacyGrade(80) === "양호");
  check("grade 39 is 위험", weeklyPrivacyGrade(39) === "위험");
  check("round 49.32 to 1 decimal", roundScore1(49.32) === 49.3);
  check("round 47.67 to 1 decimal", roundScore1(47.67) === 47.7);
  check("round 40.82 to 1 decimal", roundScore1(40.82) === 40.8);

  const monthly = monthlyPrivacyIndexSeries([
    { weekId: "2026-07-27", avgScore: 47.67, analyzableCount: 6 },
    { weekId: "2026-08-03", avgScore: 47.46, analyzableCount: 71 },
    { weekId: "2026-08-24", avgScore: 49.19, analyzableCount: 144 },
  ]);
  check("monthly series groups by weekStart month", monthly.length === 2);
  check("july monthly label", monthly[0]?.label === "2026년 7월");
  check("august monthly label", monthly[1]?.label === "2026년 8월");
  check(
    "august is analyzable-count weighted",
    monthly[1]?.value ===
      roundScore1((47.46 * 71 + 49.19 * 144) / (71 + 144)),
  );

  const headline = buildHeadline(84, 81);
  check("headline 10중 9", headline.includes("10건 중 9건"));

  const insights = buildWeeklyInsights({
    personalInfoRate: 96,
    attentionNeededRate: 93,
    publicCount: 10,
    publicExternalToolCount: 8,
    schoolCount: 3,
    retentionGapCount: 20,
    destructionGapCount: 18,
  });
  check("insights 3-5", insights.length >= 3 && insights.length <= 5);
  check("public insight only with public data", insights.some((row) => row.text.includes("공공부문")));

  const noSchool = buildWeeklyInsights({
    personalInfoRate: 90,
    attentionNeededRate: 80,
    publicCount: 0,
    publicExternalToolCount: 0,
    schoolCount: 0,
    retentionGapCount: 1,
    destructionGapCount: 1,
  });
  check(
    "no school insight without school data",
    !noSchool.some((row) => row.text.includes("학교·교육기관")),
  );
  check(
    "no public insight without public data",
    !noSchool.some((row) => row.text.includes("공공부문 설문은 국민")),
  );

  const press = buildPressSummary({
    weekLabel: w.label,
    headline,
    analyzable: 84,
    personalInfoCount: 81,
    attentionNeededCount: 78,
    publicNarrative: "공공부문 확인 필요 신호가 반복적으로 나타났습니다.",
  });
  check("press has headline", press.includes(headline));
  check("press has disclaimer", press.includes("위법 여부를 확정하는 자료는 아닙니다"));
  check("press no 위반 확정", !/위반 확정입니다/.test(press));

  const cases = buildAnonymousCases({
    schoolCount: 4,
    publicCount: 10,
    medicalCount: 1,
    personalInfoCount: 81,
    sensitiveCount: 3,
    highRiskCount: 1,
    publicExternalToolCount: 8,
    nameCount: 40,
    phoneCount: 50,
    emailCount: 30,
    affiliationCount: 20,
    analyzableCount: 84,
    noticeGaps: ["수집 목적 안내", "보유기간 안내"],
    topTool: "Google Forms",
  });
  check("anonymous cases 3-5", cases.length >= 3 && cases.length <= 5);
  const caseText = JSON.stringify(cases);
  check("anonymous cases have no URL", !/https?:\/\//.test(caseText));
  check("anonymous cases have no org name 롯데", !caseText.includes("롯데"));
  check("cases use type titles", cases.some((row) => row.title.includes("참가신청서형")));

  check("filters technical HTML 진단", !isPublicWeeklyIssue("Google Forms HTML 진단"));
  check("filters platform_parser", !isPublicWeeklyIssue("platform_parser"));
  check("keeps 고지문 미흡", isPublicWeeklyIssue("고지문 미흡"));

  const files = [
    "db/migrations/015_weekly_reports.sql",
    "lib/weekly/generateWeeklyReport.ts",
    "lib/weekly/repository.ts",
    "app/weekly/page.tsx",
    "app/weekly/[weekId]/page.tsx",
    "app/report/admin/weekly/page.tsx",
    "app/api/report/admin/weekly/generate/route.ts",
    "components/weekly/WeeklyListView.tsx",
    "components/weekly/WeeklyDetailView.tsx",
  ];
  for (const file of files) {
    check(`${file} exists`, exists(file));
  }

  const gen = read("lib/weekly/generateWeeklyReport.ts");
  check("uses completed dashboard range", gen.includes("buildPublicDashboard"));
  check("stores snapshot", read("lib/weekly/repository.ts").includes("snapshot_json"));
  check("admin generate route", exists("app/api/report/admin/weekly/generate/route.ts"));
  check("published-only public list", read("lib/weekly/repository.ts").includes('status: "published"'));
  check(
    "public list hides in-progress weeks",
    read("lib/weekly/repository.ts").includes("isCompletedReportWeek"),
  );
  check(
    "completed-week snapshots only",
    read("lib/weekly/generateWeeklyReport.ts").includes("listRecentCompletedKstWeeks"),
  );
  check(
    "auto publish helper",
    read("lib/weekly/generateWeeklyReport.ts").includes("publishCompletedWeeklyReports"),
  );
  check("weekly publish cron route", exists("app/api/internal/weekly/publish/route.ts"));
  const vercel = read("vercel.json");
  check(
    "vercel weekly publish cron",
    vercel.includes('"/api/internal/weekly/publish"') &&
      vercel.includes('"30 15 * * *"'),
  );

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "package.json weekly:report-check",
    pkg.scripts["weekly:report-check"] === "tsx scripts/check-weekly-report-generation.ts",
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:report-check PASS");
}

main();
