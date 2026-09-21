import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import type { AdminCaseDetail } from "../lib/report/adminCaseDetail";
import {
  OFFICIAL_NOTICE_TEMPLATE_REL,
  buildOfficialNoticeDocx,
  officialNoticeContentDisposition,
  officialNoticeTemplatePath,
  officialNoticeXmlTest,
} from "../lib/report/officialNoticeDocx";
import {
  buildOfficialNoticeModel,
  noticeRecipient,
} from "../lib/report/officialNoticeModel";
import { officialNoticeAsciiFilename } from "../lib/report/officialNoticeModel";

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

function mockDetail(): AdminCaseDetail {
  return {
    id: "case-notice-check-001",
    summary: {
      surveyTitle: "공문 생성 점검용 설문",
      surveyUrl: "https://docs.google.com/forms/d/e/example/viewform",
      finalUrl: "https://docs.google.com/forms/d/e/example/viewform",
      platform: "google_forms",
      operatorName: "서울특별시",
      subjectType: "public_agency",
      publicPrivateType: "public",
      overallRiskLevel: "critical",
      score: 20,
      userDecisionLabel: "신고 검토",
      diagnosisStatus: "completed",
      confidence: "high",
      questionCount: 3,
      personalInfoQuestionCount: 2,
      sensitiveQuestionCount: 1,
      highRiskQuestionCount: 0,
      hasPersonalInfo: true,
      hasSensitiveInfo: true,
      hasHighRiskInfo: false,
      captureCompleteness: "complete",
      captureStatus: "completed",
      evidenceCount: 2,
      reviewStatus: "none",
      publishStatus: "draft",
      publicationStatus: "private",
      observedAt: "2026-08-09T03:00:00.000Z",
      observedDateKst: "2026-08-09",
      scanReportId: "scan-1",
      scanJobId: "job-1",
      externalScanId: "scan-1",
      hasTemporaryZip: false,
      hasScreenshots: true,
      downloadableEvidenceTypes: ["key_screenshot"],
      temporaryZipId: null,
      screenshotFileIds: ["shot-1"],
      publicCaseStatus: "private",
      publicId: null,
    },
    publicCase: null,
    performance: {
      extractionMode: "html",
      browserUsed: false,
      browserReason: null,
      fastExtractorConfidence: "high",
      fallbackTriggered: false,
      fallbackReason: null,
      totalDurationMs: 1000,
      extractDurationMs: 400,
      analysisDurationMs: 400,
      saveDurationMs: 200,
    },
    findings: [],
    complianceChecks: [],
    indexScores: null,
    questions: [
      {
        id: "q1",
        questionNumber: "Q1",
        pageNumber: 1,
        questionLabel: "연락처",
        questionType: "text",
        isRequired: true,
        dataRiskLevel: "high",
        hasPersonalInfo: true,
        hasSensitiveInfo: false,
        hasHighRiskInfo: false,
        categories: [
          {
            categoryCode: "phone",
            categoryLabel: "연락처",
            riskCategory: "direct",
            matchedKeyword: "연락처",
          },
        ],
      },
      {
        id: "q2",
        questionNumber: "Q2",
        pageNumber: 1,
        questionLabel: "장애 유형",
        questionType: "choice",
        isRequired: false,
        dataRiskLevel: "high",
        hasPersonalInfo: true,
        hasSensitiveInfo: true,
        hasHighRiskInfo: false,
        categories: [
          {
            categoryCode: "disability",
            categoryLabel: "장애 유형",
            riskCategory: "sensitive",
            matchedKeyword: "장애",
          },
        ],
      },
    ],
    captureJobs: [],
    evidenceFiles: [],
    evidenceEmptyState: {
      kind: "files_present",
      title: "",
      detail: "",
    },
    reportJson: null,
    reviewCase: null,
  } as AdminCaseDetail;
}

async function main() {
  check("template path exists", existsSync(officialNoticeTemplatePath()));
  check(
    "template is in repo path",
    existsSync(resolve(process.cwd(), OFFICIAL_NOTICE_TEMPLATE_REL)),
  );

  const templateZip = await JSZip.loadAsync(
    readFileSync(officialNoticeTemplatePath()),
  );
  check("template keeps header", Boolean(templateZip.file("word/header1.xml")));
  check(
    "template keeps footer",
    Boolean(templateZip.file("word/footer2.xml") || templateZip.file("word/footer1.xml")),
  );
  check(
    "template keeps media",
    Object.keys(templateZip.files).some((name) => name.startsWith("word/media/")),
  );

  check("서울특별시 -> 서울특별시장", noticeRecipient("서울특별시") === "서울특별시장");
  check("종로구청장", noticeRecipient("서울특별시 종로구") === "종로구청장");
  check("한국수력원자력 keeps name", noticeRecipient("한국수력원자력") === "한국수력원자력");

  const now = new Date("2026-09-21T07:00:00.000Z");
  const model = buildOfficialNoticeModel(mockDetail(), now);
  check("recipient is 서울특별시장", model.recipient === "서울특별시장");
  check("keeps survey title", model.surveyTitle === "공문 생성 점검용 설문");
  check("keeps survey url", model.surveyUrl.includes("docs.google.com"));
  check("diagnosed date from kst", model.diagnosedAtKo.includes("2026년 8월 9일"));
  check("risk uses Critical", model.riskLabel.startsWith("Critical"));
  check("sensitive violation present", model.violationTitles.some((t) => t.includes("민감정보")));
  check("external tool violation present", model.violationTitles.some((t) => t.includes("외부 무인증")));
  check("focus request uses titles", model.focusRequest.includes("특히 위 4항"));
  check("attachment uses title", model.attachmentReportLine.includes("공문 생성 점검용 설문"));
  check("receipt uses issued date", model.receiptLine.includes("2026. 09. 21."));
  check(
    "content-disposition has rfc5987",
    officialNoticeContentDisposition("제목", "id-1").includes("filename*=UTF-8''") &&
      officialNoticeContentDisposition("제목", "id-1").includes(
        officialNoticeAsciiFilename("id-1"),
      ),
  );

  const bytes = await buildOfficialNoticeDocx(mockDetail(), now);
  const out = await JSZip.loadAsync(bytes);
  check("generated keeps header", Boolean(out.file("word/header1.xml")));
  check(
    "generated keeps media",
    Object.keys(out.files).some((name) => name.startsWith("word/media/")),
  );
  const stylesIn = await templateZip.file("word/styles.xml")!.async("string");
  const stylesOut = await out.file("word/styles.xml")!.async("string");
  check("styles.xml unchanged", stylesIn === stylesOut);
  const doc = await out.file("word/document.xml")!.async("string");
  const text = officialNoticeXmlTest
    .parseBody(doc.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] || "")
    .map((part) => officialNoticeXmlTest.texts(part.xml))
    .join("\n");
  check("generated fills title", text.includes("공문 생성 점검용 설문"));
  check("generated fills recipient", text.includes("서울특별시장"));
  check("generated fills url", text.includes("docs.google.com/forms/d/e/example"));
  check("generated fills diagnosed date", text.includes("2026년 8월 9일"));
  check("generated drops sample title", !text.includes("유니버설디자인"));
  check("generated drops sample recipient dept", !text.includes("디자인정책과"));
  check("generated keeps static title", text.includes("실태조사 결과 통보 및 개선 권고"));
  check("generated keeps 안내사항", text.includes("개인정보보호위원회"));
  check("table count stays 3", officialNoticeXmlTest.extractAll(doc, "tbl").length === 3);

  check(
    "API route requires admin auth",
    /getAdminSessionFromCookies/.test(
      read("app/api/report/admin/cases/[id]/official-notice/route.ts"),
    ),
  );
  check(
    "list shows 공문",
    /^\s*공문\s*$/m.test(read("components/report/admin/AdminCaseRowActions.tsx")) ||
      read("components/report/admin/AdminCaseRowActions.tsx").includes(">\n        공문\n      <") ||
      read("components/report/admin/AdminCaseRowActions.tsx").includes("        공문"),
  );
  check(
    "list shows 리포트최종",
    read("components/report/admin/AdminCaseRowActions.tsx").includes("리포트최종"),
  );
  check(
    "list removed 리포트 button",
    !read("components/report/admin/AdminCaseRowActions.tsx").includes("        리포트\n"),
  );
  check(
    "action bar shows 공문",
    read("components/report/admin/AdminCaseActionBar.tsx").includes("        공문"),
  );
  check(
    "action bar shows 리포트최종",
    read("components/report/admin/AdminCaseActionBar.tsx").includes("리포트최종"),
  );
  check(
    "next config traces notice template",
    read("next.config.ts").includes("sure-check-official-notice.docx"),
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nadmin:official-notice-check PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
