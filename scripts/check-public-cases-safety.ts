import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { suggestPublicDisplayName, applyUrlVisibility } from "../lib/report/publicDisplayName";
import {
  PUBLIC_CASE_FORBIDDEN_KEYS,
  assertPublicCaseSafe,
  checkPublicCaseSafe,
  isPubliclyListedCase,
} from "../lib/report/publicCasePolicy";
import {
  classifyPublicEvidenceKind,
  isDefaultSelectedPublicKind,
} from "../lib/report/publicEvidenceKinds";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
  console.log("[Public Cases Safety Check]");

  check(
    "롯데시네마 masks to **시네마",
    suggestPublicDisplayName("롯데시네마", "private") === "**시네마",
  );
  check(
    "삼성전자 masks to **전자",
    suggestPublicDisplayName("삼성전자", "private") === "**전자",
  );
  check(
    "현대자동차 masks to **자동차",
    suggestPublicDisplayName("현대자동차", "private") === "**자동차",
  );
  check(
    "3-letter private masks first char",
    suggestPublicDisplayName("삼성", "private") === "*성",
  );
  check(
    "public org keeps original",
    suggestPublicDisplayName("한국산업인력공단", "public") === "한국산업인력공단",
  );
  check(
    "admin can still type full anonymous later",
    suggestPublicDisplayName("롯데시네마", "private") !== "롯데시네마",
  );

  const full = applyUrlVisibility({
    visibility: "full",
    surveyUrl: "https://docs.google.com/forms/d/abc",
  });
  check("full URL visibility keeps URL", full.surveyUrl?.includes("docs.google.com") === true);
  const domain = applyUrlVisibility({
    visibility: "domain_only",
    surveyUrl: "https://form.naver.com/x",
  });
  check("domain_only hides full URL", domain.surveyUrl === null && domain.urlHost === "form.naver.com");
  const hidden = applyUrlVisibility({
    visibility: "hidden",
    surveyUrl: "https://moaform.com/x",
  });
  check("hidden hides URL and host", hidden.surveyUrl === null && hidden.urlHost === null);

  check(
    "only published+publicId lists",
    isPubliclyListedCase({ publicCaseStatus: "published", publicId: "case-20260821-001" }) &&
      !isPubliclyListedCase({ publicCaseStatus: "private", publicId: "case-20260821-001" }) &&
      !isPubliclyListedCase({ publicCaseStatus: "reviewing", publicId: "case-20260821-001" }) &&
      !isPubliclyListedCase({ publicCaseStatus: "paused", publicId: "case-20260821-001" }) &&
      !isPubliclyListedCase({ publicCaseStatus: "published", publicId: null }),
  );

  check(
    "notice default selected, pii not",
    isDefaultSelectedPublicKind("notice") &&
      isDefaultSelectedPublicKind("first_page") &&
      !isDefaultSelectedPublicKind("pii_question"),
  );
  check(
    "zip is not a public evidence kind",
    classifyPublicEvidenceKind({ evidenceType: "temporary_zip" }) === null,
  );

  const dirty = {
    publicId: "case-20260821-001",
    storage_path: "evidence/x.png",
    signedUrl: "https://xxx.supabase.co/storage/v1/object/sign/x",
    report_json: { a: 1 },
    reviewerNote: "내부 메모",
  };
  const dirtyCheck = checkPublicCaseSafe(dirty);
  check("rejects storage_path", dirtyCheck.violations.some((v) => v.includes("storage_path")));
  check("rejects signedUrl", dirtyCheck.violations.some((v) => /signedurl/i.test(v)));
  check("rejects report_json", dirtyCheck.violations.some((v) => v.includes("report_json")));
  check("rejects reviewerNote", dirtyCheck.violations.some((v) => v.includes("reviewerNote")));
  assert(PUBLIC_CASE_FORBIDDEN_KEYS.includes("storage_path"), "forbidden key list");

  const safe = {
    publicId: "case-20260821-001",
    displayName: "**시네마",
    surveyTitle: "고객 만족 조사",
    surveyUrl: null,
    urlHost: "docs.google.com",
    evidence: [{ id: "e1", imageUrl: "/api/public/cases/case-20260821-001/evidence/e1" }],
  };
  assertPublicCaseSafe(safe);
  check("safe public payload accepted", true);

  const files = [
    "app/cases/page.tsx",
    "app/cases/[publicId]/page.tsx",
    "app/api/public/cases/route.ts",
    "app/api/public/cases/[publicId]/route.ts",
    "app/api/public/cases/[publicId]/evidence/[evidenceId]/route.ts",
    "lib/report/publicCases.ts",
    "components/HeaderNav.tsx",
    "components/report/admin/AdminPublishCaseModal.tsx",
    "db/migrations/013_public_cases.sql",
    "scripts/check-public-cases-safety.ts",
  ];
  for (const file of files) {
    check(`${file} exists`, exists(file));
  }

  const header = read("components/HeaderNav.tsx");
  check("nav adds 공개 진단 사례", header.includes('label: "공개 진단 사례"'));
  check("nav active on /cases", header.includes('pathname.startsWith("/cases/")'));

  const listPage = read("app/cases/page.tsx");
  check("list page title", listPage.includes("공개 진단 사례"));
  check("list published-only fetch", /listPublishedPublicCases/.test(listPage));
  check("list has disclaimer", listPage.includes("PUBLIC_CASE_DISCLAIMER"));
  check(
    "disclaimer copy",
    read("lib/report/publicCasePolicy.ts").includes(
      "위법 여부를 확정하는 자료가 아니며",
    ),
  );
  check("list has no 위반 확정 claim", !/위반 확정입니다/.test(listPage));

  const detailPage = read("app/cases/[publicId]/page.tsx");
  check("detail uses publicId", detailPage.includes("getPublishedPublicCase"));
  check("detail no 불법", !detailPage.includes("불법"));
  check("detail no storage_path", !detailPage.includes("storage_path"));
  check("detail no signed URL", !/signedUrl|signed_url/.test(detailPage));
  check("detail no report_json", !detailPage.includes("report_json"));

  const publicApi = [
    read("app/api/public/cases/route.ts"),
    read("app/api/public/cases/[publicId]/route.ts"),
    read("app/api/public/cases/[publicId]/evidence/[evidenceId]/route.ts"),
    read("lib/report/publicCases.ts"),
  ].join("\n");
  check("public API uses published-only", /public_case_status., .published/.test(publicApi) || publicApi.includes('eq("public_case_status", "published")'));
  check("public API does not return storage_path", !/storage_path:/.test(publicApi.split("return")[0] || "") && !publicApi.includes("storage_path: file"));
  check(
    "evidence proxy checks selected ids",
    publicApi.includes("selected_evidence_file_ids") &&
      publicApi.includes("selected.includes"),
  );
  check("public API omits report_json in payload", !/report_json:/.test(publicApi));
  check("public list mapper drops unpublished", publicApi.includes("isPubliclyListedCase"));

  const modal = read("components/report/admin/AdminPublishCaseModal.tsx");
  check("modal title", modal.includes("공개 진단 사례 등록"));
  check("modal masking is editable", modal.includes("공개용 기관/기업명"));
  check("modal URL visibility", modal.includes("도메인만 공개") && modal.includes("비공개"));
  check("modal evidence selection", modal.includes("공개할 캡처 이미지 선택"));
  check(
    "required confirmations",
    modal.includes("자동진단 결과가 위반 확정이 아니라는 점을 확인했습니다.") &&
      modal.includes("공개용 기관/기업명과 설문 제목을 확인했습니다.") &&
      modal.includes("설문 URL 공개 범위를 확인했습니다."),
  );
  check("publish disabled until confirmations", modal.includes("canSubmit"));
  check("URL warning copy", modal.includes("설문 URL을 공개하면 외부 사용자가"));

  const actionBar = read("components/report/admin/AdminCaseActionBar.tsx");
  check("publish button in action bar", actionBar.includes("공개 사례 등록"));
  check("pause button", actionBar.includes("공개 중지"));
  check("resume via modal", actionBar.includes("다시 공개"));
  check("summary DOCX still wired", actionBar.includes("reviewReportDownloadUrl"));
  check("detail HTML report button", actionBar.includes("상세리포트"));

  const row = read("components/report/admin/AdminCaseRowActions.tsx");
  check("row 요약리포트", row.includes("요약리포트"));
  check("row 상세리포트", row.includes("상세리포트"));
  check("row 공개 사례", row.includes("공개 사례"));

  const consoleView = read("components/report/admin/AdminConsoleView.tsx");
  check("separate 개선안내 상태 column", consoleView.includes("개선안내 상태"));
  check("separate 공개 사례 상태 column", consoleView.includes("공개 사례 상태"));

  const html = read("lib/report/adminDetailReportHtml.ts");
  check("detail report has questions", html.includes("전체 문항 목록"));
  check("detail report has letter copy", html.includes("공문용 문구"));
  check("detail report filename helper", exists("app/api/report/admin/cases/[id]/detail-report/route.ts"));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "package.json cases:public-safety",
    pkg.scripts["cases:public-safety"] === "tsx scripts/check-public-cases-safety.ts",
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\ncases:public-safety PASS");
}

main();
