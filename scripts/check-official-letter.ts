import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { COLLECTOR_OPS_HALTED } from "../lib/collector/opsPolicy";
import type { AdminCaseDetail } from "../lib/report/adminCaseDetail";
import {
  OFFICIAL_LETTER_TEMPLATE_REL,
  buildOfficialLetterDocx,
  officialLetterAsciiFilename,
  officialLetterContentDisposition,
  officialLetterTemplatePath,
  officialLetterXmlTest,
} from "../lib/report/officialLetterDocx";
import { canDownloadOfficialLetter } from "../lib/report/officialLetterEligibility";
import { officialLetterDocNumber } from "../lib/report/officialLetterModel";

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

function countTables(xml: string): number {
  return officialLetterXmlTest.extractAll(xml, "tbl").length;
}

function mockDetail(): AdminCaseDetail {
  return {
    id: "case-letter-check-001",
    summary: {
      surveyTitle: "공문 생성 점검용 설문",
      surveyUrl: "https://docs.google.com/forms/d/e/example/viewform",
      finalUrl: "https://docs.google.com/forms/d/e/example/viewform",
      platform: "google_forms",
      operatorName: "서울특별시",
      subjectType: "public_agency",
      publicPrivateType: "public",
      overallRiskLevel: "high",
      score: 40,
      userDecisionLabel: "신고 검토",
      diagnosisStatus: "completed",
      confidence: "high",
      questionCount: 4,
      personalInfoQuestionCount: 2,
      sensitiveQuestionCount: 0,
      highRiskQuestionCount: 0,
      hasPersonalInfo: true,
      hasSensitiveInfo: false,
      hasHighRiskInfo: false,
      captureCompleteness: "complete",
      captureStatus: "completed",
      evidenceCount: 2,
      reviewStatus: "none",
      publishStatus: "draft",
      publicationStatus: "private",
      observedAt: "2026-09-15T03:00:00.000Z",
      observedDateKst: "2026-09-15",
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
    findings: [
      {
        id: "f1",
        findingType: "notice",
        checkDomain: "notice",
        severity: "high",
        title: "파기 기준 안내 부족",
        description: "파기 시점과 방법이 설문 화면에서 확인되지 않았습니다.",
        recommendation: "파기 시점 및 방법을 안내하세요",
        evidenceNote: null,
        legalBasisCodes: ["PIPA_ART_21"],
        status: "open",
      },
    ],
    complianceChecks: [],
    indexScores: null,
    questions: [
      {
        id: "q1",
        questionNumber: "Q1",
        pageNumber: 1,
        questionLabel: "이름",
        questionType: "text",
        isRequired: true,
        dataRiskLevel: "high",
        hasPersonalInfo: true,
        hasSensitiveInfo: false,
        hasHighRiskInfo: false,
        categories: [
          {
            categoryCode: "name",
            categoryLabel: "이름",
            riskCategory: "direct",
            matchedKeyword: "이름",
          },
        ],
      },
      {
        id: "q2",
        questionNumber: "Q2",
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
    ],
    captureJobs: [],
    evidenceFiles: [
      {
        id: "shot-1",
        evidenceType: "key_screenshot",
        evidenceTypeLabel: "핵심 화면",
        isKeyEvidence: true,
        createdAt: "2026-09-15T03:00:00.000Z",
        retentionLevel: "standard",
        mimeType: "image/png",
        byteSize: 1000,
        sha256: null,
        label: "page-1",
        expiresAt: null,
        pageNumber: 1,
      },
    ],
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
  check("ops halt is on", COLLECTOR_OPS_HALTED === true);
  const haltRoutes = [
    "app/api/internal/collector/official-sites/route.ts",
    "app/api/internal/collector/diagnosis-dispatch/route.ts",
    "app/api/internal/jobs/run-next/route.ts",
    "lib/collector/handleCollectorRun.ts",
    "app/api/internal/collector/revalidate/route.ts",
    "app/api/report/admin/collector/run/route.ts",
    "app/api/report/admin/collector/diagnose/route.ts",
  ];
  for (const file of haltRoutes) {
    check(`${file} respects halt`, /COLLECTOR_OPS_HALTED/.test(read(file)));
  }

  check("template path exists", existsSync(officialLetterTemplatePath()));
  check(
    "template is in repo path",
    existsSync(resolve(process.cwd(), OFFICIAL_LETTER_TEMPLATE_REL)),
  );

  const templateZip = await JSZip.loadAsync(
    readFileSync(officialLetterTemplatePath()),
  );
  check("template keeps header", Boolean(templateZip.file("word/header1.xml")));
  check("template keeps footer", Boolean(templateZip.file("word/footer2.xml") || templateZip.file("word/footer1.xml")));
  check(
    "template keeps media",
    Object.keys(templateZip.files).some((name) => name.startsWith("word/media/")),
  );
  const templateDoc = await templateZip.file("word/document.xml")!.async("string");
  check("template has 10 tables", countTables(templateDoc) === 10);
  check("template uses 9072 tblW", /w:w="9072"/.test(templateDoc));
  check(
    "template keeps run fonts",
    /<w:rFonts/.test(templateDoc) || /w:asciiTheme/.test(templateDoc),
  );

  check(
    "eligibility allows completed normal",
    canDownloadOfficialLetter({
      diagnosisStatus: "completed",
      overallRiskLevel: "high",
    }),
  );
  check(
    "eligibility blocks limited",
    !canDownloadOfficialLetter({
      diagnosisStatus: "limited",
      overallRiskLevel: "limited",
      limitedReason: "JavaScript 기반 문항을 자동으로 읽지 못했습니다",
    }),
  );
  check(
    "eligibility blocks closed",
    !canDownloadOfficialLetter({
      diagnosisStatus: "limited",
      overallRiskLevel: "limited",
      userDecisionLabel: "문항 분석 불가",
      limitedReason: "설문이 종료되었습니다",
    }),
  );
  check("doc number is stable", officialLetterDocNumber("abc") === officialLetterDocNumber("abc"));
  check(
    "content-disposition has rfc5987",
    officialLetterContentDisposition("제목", "id-1").includes("filename*=UTF-8''") &&
      officialLetterContentDisposition("제목", "id-1").includes(officialLetterAsciiFilename("id-1")),
  );

  const bytes = await buildOfficialLetterDocx(mockDetail());
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
  check("generated still has 10 tables", countTables(doc) === 10);
  check("generated uses cloned tblW", /w:w="9072"/.test(doc));
  check("generated fills title", doc.includes("공문 생성 점검용 설문"));
  check("generated fills operator", doc.includes("서울특별시"));
  check("generated does not keep sample title", !doc.includes("생태 아웃도어 숲놀이"));
  check(
    "disclaimer drops 수기 검토",
    !doc.includes("수기 검토") && doc.includes("자동진단 도구(SURE-CHECK)를 통해"),
  );
  check("API route requires admin auth", /getAdminSessionFromCookies/.test(read("app/api/report/admin/cases/[id]/official-letter/route.ts")));
  check(
    "API route uses cloned builder",
    /buildOfficialLetterDocx/.test(read("app/api/report/admin/cases/[id]/official-letter/route.ts")),
  );
  check(
    "list shows 공문down",
    read("components/report/admin/AdminCaseRowActions.tsx").includes("공문down"),
  );
  check(
    "action bar shows 공문down",
    read("components/report/admin/AdminCaseActionBar.tsx").includes("공문down"),
  );
  check(
    "list disables non-reportable",
    /letterEligible/.test(read("components/report/admin/AdminCaseRowActions.tsx")),
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nadmin:official-letter-check PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
