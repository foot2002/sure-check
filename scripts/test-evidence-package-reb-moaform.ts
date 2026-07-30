/**
 * evidence package - public agency moaform with valid privacy notice
 *
 * 실행: npx tsx scripts/test-evidence-package-reb-moaform.ts
 */
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { buildReportEvidenceModel } from "@/lib/evidence/buildEvidenceModel";
import { buildComplaintDraft } from "@/lib/evidence/buildComplaintDraft";
import { buildEvidencePackage } from "@/lib/evidence/buildEvidencePackage";
import type { ScanReport } from "@/lib/types/scan";

const PRIVACY_NOTICE = [
  "개인정보 수집·이용 목적 : 설문조사 경품 지급",
  "수집하려는 개인정보 항목 : 성명, 휴대폰번호",
  "개인정보 보유·이용 기간 : 경품 발송 완료 등 행사 종료 시",
  "동의 거부권 및 불이익 : 동의를 거부할 권리, 거부 시 경품지급 제한",
  "경품 발송 완료 등 행사 종료 후 지체없이 파기",
].join("\n");

function buildFixtureReport(): ScanReport {
  return {
    scanId: "test-reb-moaform-notice",
    formUrl: "https://moaform.com/q/reb-public-data",
    platform: "moaform",
    mockKey: "moaform_employee_high_risk",
    diagnosisStatus: "completed",
    grade: "high_risk",
    score: 82,
    confidence: "high",
    summary: "공공기관 Moaform 개인정보 수집 설문",
    sections: {
      dataCollectionRisk: "",
      toolProcessingRisk: "",
      noticeConsentGap: "",
      managementRisk: "",
      detectedPersonalData: ["성명", "휴대폰번호"],
      missingObligations: [],
      respondentGuidance: [],
      operatorRecommendations: [],
      evidenceItems: [],
      legalBasisSummary: "",
      disclaimer: "",
    },
    findings: [],
    form: {
      platform: "moaform",
      title: "한국부동산원 공공데이터 이용 활성화를 위한 설문조사",
      url: "https://moaform.com/q/reb-public-data",
      operatorType: "한국부동산원 (확인 필요)",
      hasPrivacyNotice: true,
      hasConsent: true,
      hasRetentionNotice: true,
      hasOverseasTransferNotice: false,
      extractedFromHtml: true,
      notices: {
        description: "한국부동산원 공공데이터 이용 활성화 설문",
        privacyNotice: PRIVACY_NOTICE,
      },
      metadata: {
        noticeTexts: [PRIVACY_NOTICE],
        operatorHint: "한국부동산원",
        extractionMethod: "moaform_json",
        source: { kind: "url" },
      },
      questions: [
        {
          id: "consent",
          label: PRIVACY_NOTICE,
          questionText: PRIVACY_NOTICE,
          type: "privacy_consent",
          required: true,
          hasPersonalData: false,
          riskTags: ["privacy_consent"],
          detectedCategories: [],
          questionIndex: 0,
        },
        {
          id: "q1",
          label: "성명",
          questionText: "성명을 입력해 주세요",
          type: "short_text",
          required: true,
          hasPersonalData: true,
          personalDataTypes: ["이름"],
          detectedCategories: ["name"],
          dataRiskLevel: "D3",
          questionIndex: 1,
        },
        {
          id: "q2",
          label: "휴대폰번호",
          questionText: "휴대폰번호를 입력해 주세요",
          type: "short_text",
          required: true,
          hasPersonalData: true,
          personalDataTypes: ["연락처"],
          detectedCategories: ["phone"],
          dataRiskLevel: "D3",
          questionIndex: 2,
        },
        {
          id: "q3",
          label: "성별",
          questionText: "성별을 선택해 주세요",
          type: "single_choice",
          required: false,
          hasPersonalData: true,
          personalDataTypes: ["성별"],
          detectedCategories: ["gender"],
          dataRiskLevel: "D2",
          questionIndex: 3,
        },
        {
          id: "q4",
          label: "연령",
          questionText: "연령대를 선택해 주세요",
          type: "single_choice",
          required: false,
          hasPersonalData: true,
          personalDataTypes: ["연령대"],
          detectedCategories: ["age_range"],
          dataRiskLevel: "D2",
          questionIndex: 4,
        },
        {
          id: "q5",
          label: "정책 방향",
          questionText: "공공데이터 정책 방향에 대한 의견",
          type: "long_text",
          required: false,
          hasPersonalData: false,
          personalDataTypes: [],
          semanticCategories: ["policy_opinion"],
          detectedCategories: ["policy_opinion"],
          dataRiskLevel: "D1",
          questionIndex: 5,
        },
        {
          id: "q6",
          label: "서비스 의견",
          questionText: "서비스 개선 의견",
          type: "long_text",
          required: false,
          hasPersonalData: false,
          personalDataTypes: [],
          semanticCategories: ["service_feedback"],
          detectedCategories: ["service_feedback"],
          dataRiskLevel: "D1",
          questionIndex: 6,
        },
      ],
    },
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    debug: {
      inputUrl: "https://moaform.com/q/reb-public-data",
      normalizedUrl: "https://moaform.com/q/reb-public-data",
      platform: "moaform",
      extractorName: "MoaformExtractor",
      questionCount: 6,
      partialScan: false,
      isLimited: false,
      contextLabels: ["public_sector"],
      publicSectorDetected: true,
      publicSectorEvidence: ["한국부동산원"],
      publicInstitutionEvidence: {
        matchedName: "한국부동산원",
        matchedBy: "exact_list",
        evidenceText: "설문 제목에서 한국부동산원 확인",
      },
      obligations: [],
      missingNotices: [],
      managementItems: [],
      overrideRules: [],
    },
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const report = buildFixtureReport();
  const audience = composeAudienceReport(report);
  const model = buildReportEvidenceModel(report, audience);
  const draft = buildComplaintDraft(model);
  const pkg = await buildEvidencePackage(model);

  console.log("operatorName:", model.operatorName);
  console.log("subjectType:", model.subjectType);
  console.log("toolName:", model.toolName);
  console.log("noticeChecks:");
  for (const row of model.noticeChecks) {
    console.log(`  - ${row.item}: ${row.status}`);
  }
  console.log("coreReasons:", model.coreReasons);
  console.log("detectedQuestions:", model.detectedQuestions.map((q) => q.questionNumber));
  console.log("zip:", pkg.fileName);

  assert(model.operatorName === "한국부동산원", "operatorName must be 한국부동산원");
  assert(model.subjectType === "public_agency", "subjectType must be public_agency");
  assert(/Moaform/i.test(model.toolName), "toolName must be Moaform");

  const statusOf = (item: string) =>
    model.noticeChecks.find((n) => n.item === item)?.status;

  assert(statusOf("수집 목적") === "확인됨", "수집 목적 must be 확인됨");
  assert(statusOf("수집 항목") === "확인됨", "수집 항목 must be 확인됨");
  assert(statusOf("보유기간") === "확인됨", "보유기간 must be 확인됨");
  assert(statusOf("파기 기준") === "확인됨", "파기 기준 must be 확인됨");
  assert(
    statusOf("동의 거부권 및 불이익") === "확인됨",
    "동의 거부권 및 불이익 must be 확인됨",
  );
  assert(
    statusOf("담당부서/문의처") === "미확인",
    "담당부서/문의처 must be 미확인",
  );
  assert(
    statusOf("위탁/외부도구 처리 기준") === "미확인",
    "위탁/외부도구 처리 기준 must be 미확인",
  );
  assert(
    statusOf("원자료 접근권한") === "미확인",
    "원자료 접근권한 must be 미확인",
  );
  assert(
    !model.noticeChecks.some((n) => n.item.includes("국외")),
    "국외이전 check must not appear for Moaform",
  );

  const forbiddenReasons = [
    "수집 목적 미확인",
    "수집 항목 미확인",
    "보유기간 미확인",
    "파기 기준 미확인",
    "동의 거부권 미확인",
    "국외이전 미확인",
  ];
  for (const bad of forbiddenReasons) {
    assert(
      !model.coreReasons.some((r) => r.includes(bad)),
      `coreReasons must not include ${bad}`,
    );
    assert(!draft.includes(bad), `complaint draft must not include ${bad}`);
  }

  assert(
    model.coreReasons.some((r) => /외부 설문도구|외부도구/.test(r)),
    "coreReasons should mention external tool",
  );
  assert(
    model.coreReasons.some((r) => /CSAP/.test(r)),
    "coreReasons should mention CSAP",
  );
  assert(
    draft.includes("일부 확인됩니다"),
    "complaint draft should acknowledge confirmed notices",
  );
  assert(
    draft.includes("검토를 요청드립니다"),
    "complaint draft must end with review request",
  );
  assert(
    !draft.includes("위반 확정"),
    "complaint draft must not say 위반 확정",
  );

  assert(
    !model.detectedQuestions.some((q) => /정책 방향|서비스 의견/.test(q.detectedDataType)),
    "policy/service opinions must not be personal data detections",
  );
  assert(
    !model.detectedQuestions.some((q) => q.questionText.includes("개인정보 수집·이용 목적")),
    "privacy notice must not appear as detected question",
  );
  assert(
    model.privacyNotice.rawText.includes("설문조사 경품 지급"),
    "privacyNotice must contain notice text",
  );
  assert(model.totalQuestionCount >= 6, "totalQuestionCount excludes only consent or counts answerable");
  // privacy_consent excluded → 6 answerable
  assert(model.totalQuestionCount === 6, `expected 6 answerable, got ${model.totalQuestionCount}`);
  assert(model.detectedPersonalDataQuestionCount >= 2, "should detect name/phone etc");

  const JSZip = (await import("jszip")).default;
  const zipBytes = await pkg.blob.arrayBuffer();
  const zip = await JSZip.loadAsync(zipBytes);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  console.log("zip entries:", names);

  assert(
    names.includes("01_신고증빙_요약서.html"),
    "summary html missing",
  );
  assert(
    names.every(
      (n) =>
        n === "01_신고증빙_요약서.html" || n.startsWith("02_화면캡처/"),
    ),
    "zip must only contain summary + screenshots",
  );

  const summaryHtml = await zip
    .file("01_신고증빙_요약서.html")!
    .async("string");
  assert(summaryHtml.includes("신고 이유"), "summary must include report reason");
  assert(
    summaryHtml.includes("법·정책") || summaryHtml.includes("고지문"),
    "summary must include diagnosis/legal section",
  );
  assert(
    summaryHtml.includes("수집 목적") && summaryHtml.includes("확인됨"),
    "summary must reflect notice check results",
  );
  assert(pkg.fileCount === names.length, "fileCount must match zip entries");

  console.log("\nPASS: evidence package - public agency moaform with valid privacy notice");
}

main().catch((error) => {
  console.error("\nFAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
