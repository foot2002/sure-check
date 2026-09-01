import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAnonymousCases, enrichAnonymousCase } from "../lib/weekly/anonymousCases";
import { WEEKLY_NOTICE_EXAMPLE_NOTE } from "../lib/weekly/copy";
import type { WeeklyAnonymousCase } from "../lib/weekly/types";

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
  console.log("[Weekly Risk Case Format Check]");

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
    topTool: "외부 설문도구",
  });
  check("builds 3-5 cases", cases.length >= 3 && cases.length <= 5);

  const fields: Array<keyof WeeklyAnonymousCase> = [
    "whyRisky",
    "respondentBlindSpot",
    "operatorMissed",
    "quickFixNotice",
    "weakNoticeExample",
    "improvedNoticeExample",
  ];
  for (const field of fields) {
    check(
      `templates include ${field}`,
      cases.every((row) => {
        const value = row[field];
        return Array.isArray(value) ? value.length > 0 : String(value || "").length > 0;
      }),
    );
  }

  const legacy = enrichAnonymousCase({
    id: "event-application",
    title: "행사·프로그램 참가신청서형",
    orgType: "공공·민간 혼재",
    surveyPattern: "참가신청·접수",
    tool: "외부 설문도구",
    collectedInfo: ["이름", "연락처"],
    noticeGaps: ["수집 목적 안내"],
    respondentRisk: "보관 기간을 알기 어렵습니다.",
    operatorFix: "고지 항목을 첫 화면에 안내해야 합니다.",
    similarCount: 12,
    whyRisky: "",
    respondentBlindSpot: "",
    operatorMissed: [],
    quickFixNotice: "",
    weakNoticeExample: "",
    improvedNoticeExample: "",
  });
  check("enrich fills whyRisky", legacy.whyRisky.length > 0);
  check("enrich fills respondentBlindSpot", legacy.respondentBlindSpot.length > 0);
  check("enrich fills quickFixNotice", legacy.quickFixNotice.length > 0);

  const editorial = read("components/weekly/WeeklyEditorial.tsx");
  check("card renders 왜 위험한가", editorial.includes("왜 위험한가"));
  check("card renders 응답자는 무엇을 알기 어려운가", editorial.includes("응답자는 무엇을 알기 어려운가"));
  check("card renders 운영자가 빠뜨린 것", editorial.includes("운영자가 빠뜨린 것"));
  check("card renders 바로 고치는 문구", editorial.includes("바로 고치는 문구"));
  check("card renders 미흡한 안내 예시", editorial.includes("미흡한 안내 예시"));
  check("card renders 개선된 안내 예시", editorial.includes("개선된 안내 예시"));
  check("WEEKLY_NOTICE_EXAMPLE_NOTE present", editorial.includes("WEEKLY_NOTICE_EXAMPLE_NOTE"));
  check(
    "notice example note copy",
    WEEKLY_NOTICE_EXAMPLE_NOTE.includes("실제 설문 문구가 아니라"),
  );

  const templates = read("lib/weekly/anonymousCases.ts");
  const templateText = JSON.stringify(cases);
  check("templates have no http URL", !/https?:\/\//.test(templates) && !/https?:\/\//.test(templateText));
  check("templates have no 롯데", !templates.includes("롯데") && !templateText.includes("롯데"));
  check("templates have no 서울대학교", !templates.includes("서울대학교"));
  check("templates have no docs.google.com", !templates.includes("docs.google.com"));
  check("list page has no 공개 진단 사례", !read("components/weekly/WeeklyListView.tsx").includes("공개 진단 사례"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:risk-case-format-check PASS");
}

main();
