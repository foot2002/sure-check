import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AdminRangeError,
  appliedAdminRangeLabel,
  resolveAdminRange,
} from "@/lib/report/adminCases";
import { buildAdminReviewReportDocx } from "@/lib/report/adminReviewReportDocx";
import { PUBLIC_REPORT_FORBIDDEN_KEYS } from "@/lib/report/publicReportPolicy";

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

function main() {
  const today = resolveAdminRange("today");
  check("range today", today.range === "today" && Boolean(today.from && today.to));
  const week = resolveAdminRange("7d");
  check("range 7d", week.range === "7d" && Boolean(week.from && week.to));
  const month = resolveAdminRange("30d");
  check("range 30d", month.range === "30d" && Boolean(month.from && month.to));
  const all = resolveAdminRange("all");
  check("range all", all.range === "all" && all.from === null && all.to === null);
  const custom = resolveAdminRange("7d", "2026-08-01", "2026-08-20");
  check(
    "from/to overrides preset",
    custom.range === "custom" &&
      custom.from === "2026-08-01" &&
      custom.to === "2026-08-20",
  );
  check(
    "applied custom label",
    appliedAdminRangeLabel(custom) === "2026-08-01 ~ 2026-08-20",
  );
  check(
    "applied 7d label",
    appliedAdminRangeLabel(week) === "최근 7일",
  );
  let inverted = false;
  try {
    resolveAdminRange("custom", "2026-08-20", "2026-08-01");
  } catch (error) {
    inverted = error instanceof AdminRangeError;
  }
  check("from > to throws AdminRangeError", inverted);

  const casesRoute = read("app/api/report/admin/cases/route.ts");
  check("admin cases no-store header", /Cache-Control.: .no-store/.test(casesRoute));
  check("admin cases from query", /searchParams.get\("from"\)/.test(casesRoute));
  check("admin cases to query", /searchParams.get\("to"\)/.test(casesRoute));
  check("admin cases force-dynamic", /export const dynamic = "force-dynamic"/.test(casesRoute));

  const listLib = read("lib/report/adminCases.ts");
  check(
    "KPI uses same cases array as list",
    /totalScans:\s*cases\.length/.test(listLib),
  );
  check("list item includes surveyUrl", /surveyUrl: \(row\.survey_url/.test(listLib));
  check("list item hasTemporaryZip", /hasTemporaryZip:/.test(listLib));
  check("list item does not expose storage_path", !/storage_path/.test(listLib));

  const publicPolicy = read("lib/report/publicReportPolicy.ts");
  check(
    "public policy forbids surveyUrl",
    PUBLIC_REPORT_FORBIDDEN_KEYS.includes("surveyUrl") &&
      PUBLIC_REPORT_FORBIDDEN_KEYS.includes("survey_url") &&
      /surveyUrl/.test(publicPolicy),
  );

  const publicDashboard = read("lib/report/buildPublicDashboard.ts");
  check(
    "public dashboard omits surveyUrl",
    !/surveyUrl|survey_url/.test(publicDashboard),
  );
  const publicApi = read("app/api/report/public-dashboard/route.ts");
  check("public dashboard API omits surveyUrl", !/surveyUrl/.test(publicApi));

  const reviewRoute = read("app/api/report/admin/cases/[id]/review-report/route.ts");
  check("review-report requires admin auth", /getAdminSessionFromCookies/.test(reviewRoute));
  check(
    "review-report returns DOCX content-type",
    /wordprocessingml\.document/.test(reviewRoute),
  );
  const docxLib = read("lib/report/adminReviewReportDocx.ts");
  check("DOCX includes problem reasons", /3\. 주요 문제/.test(docxLib));
  check("DOCX includes improvement guidance", /5\. 개선 권고/.test(docxLib));
  check("DOCX includes disclaimer", /위법 여부를 확정하는 자료가 아닙니다/.test(docxLib));
  check("DOCX includes score", /점수:/.test(docxLib));
  check("DOCX filename uses caseId", /sure-check-review-report-\$\{caseId\}\.docx/.test(docxLib));
  check(
    "DOCX builder is not a report_json dump",
    !/JSON\.stringify\(detail\.reportJson/.test(docxLib),
  );

  const signed = read(
    "app/api/report/admin/evidence/[evidenceFileId]/signed-url/route.ts",
  );
  check(
    "signed-url JSON omits storage_path",
    /return NextResponse\.json\(/.test(signed) &&
      !/storage_path: data\.storage_path/.test(signed.split("return NextResponse.json")[1] || ""),
  );
  const download = read(
    "app/api/report/admin/evidence/[evidenceFileId]/download/route.ts",
  );
  check("evidence proxy download exists", /supabase\.storage/.test(download));
  check("proxy response omits storage_path header", !/storage_path/.test(
    download.split("return new NextResponse")[1] || "",
  ));

  const uiFiles = [
    "components/report/admin/AdminConsoleView.tsx",
    "components/report/admin/AdminCaseDrawer.tsx",
    "components/report/admin/AdminCaseDetailView.tsx",
    "components/report/admin/AdminOutreachSections.tsx",
    "components/report/admin/AdminEvidenceDownloads.tsx",
    "components/report/admin/AdminCaseActionBar.tsx",
    "components/report/admin/AdminCaseRowActions.tsx",
  ];
  const ui = uiFiles.map((f) => read(f)).join("\n");
  const forbiddenUi = [
    "공개 후보",
    "공개 상태",
    "공개검토",
    "비공개",
    "publication status",
  ];
  for (const label of forbiddenUi) {
    check(`UI omits "${label}"`, !ui.includes(label));
  }
  check("list shows 검토 button", ui.includes(">검토<") || ui.includes("검토"));
  check("list shows 원본 action", /원본/.test(read("components/report/admin/AdminCaseRowActions.tsx")));
  check("list shows 리포트 action", /리포트/.test(read("components/report/admin/AdminCaseRowActions.tsx")));
  check("list shows 증빙 action", /증빙/.test(read("components/report/admin/AdminCaseRowActions.tsx")));
  check("list shows URL 복사 overflow", /URL 복사/.test(read("components/report/admin/AdminCaseRowActions.tsx")));
  const bar = read("components/report/admin/AdminCaseActionBar.tsx");
  for (const label of [
    "원본 설문 열기",
    "설문 URL 복사",
    "검토 리포트 다운로드",
    "신고용 ZIP 다운로드",
    "캡처 이미지 전체 다운로드",
    "새 탭에서 전체 상세 보기",
    "개별 캡처 다운로드",
  ]) {
    check(`action bar exposes ${label}`, bar.includes(label));
  }
  const consoleView = read("components/report/admin/AdminConsoleView.tsx");
  check("custom range option", consoleView.includes("기간 설정"));
  check("custom range date inputs", /type="date"/.test(consoleView));
  check("from/to query for custom range", /params.set\("from"/.test(consoleView));
  check("improvement status filter", consoleView.includes("개선안내 상태"));
  check("letter review chip", consoleView.includes("공문발송 검토"));
  check("row actions stopPropagation", /stopPropagation/.test(read("components/report/admin/AdminCaseRowActions.tsx")));

  const evidenceUi = read("components/report/admin/AdminEvidenceDownloads.tsx");
  check("empty evidence copy", evidenceUi.includes("증거 부족 — 개선안내 전 추가 캡처 권장"));
  check(
    "async capture enqueue only",
    evidenceUi.includes("evidence_full_walkthrough") &&
      !/syncCapture|synchronous|sync_fallback/.test(evidenceUi),
  );

  const detailView = read("components/report/admin/AdminCaseDetailView.tsx");
  check("detail page uses action bar", detailView.includes("AdminCaseActionBar"));
  check("detail page not URL-text only", !/<a[^>]*>\{s\.surveyUrl\}/.test(detailView));

  assert(typeof buildAdminReviewReportDocx === "function", "DOCX builder export");

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nadmin:outreach-actions-check PASS");
}

main();
