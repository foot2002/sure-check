/**
 * Form-wide context aggregation regression (notice/org/contact not window-local).
 */
import { buildSurveyFormContext, formWideNoticeCorpus } from "@/lib/analyzer/formContext";
import type { NormalizedForm } from "@/lib/types/scan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseForm(overrides: Partial<NormalizedForm> = {}): NormalizedForm {
  return {
    platform: "google_forms",
    title: "시민 의견 조사",
    url: "https://example.com/form",
    questions: [
      {
        id: "q1",
        label: "성명을 입력해 주세요",
        type: "short_text",
        required: true,
        detectedCategories: ["name"],
      },
      {
        id: "q2",
        label: "연락처",
        type: "short_text",
        required: false,
        detectedCategories: ["phone"],
      },
    ],
    notices: {
      description: "본 조사는 안양시 시청 정책연구팀이 실시합니다.",
      purpose: "정책 수립을 위한 의견 수렴",
      items: "성명, 연락처",
      retention: "보유기간: 수집일로부터 1년",
      privacyNotice: "개인정보 수집·이용에 관한 안내",
      contactDepartment: "문의: 개인정보보호팀 02-1234-5678 / privacy@example.go.kr",
    },
    metadata: {
      noticeTexts: [
        "하단 문의처: 담당자 홍길동 02-1234-5678",
        "개인정보 처리방침은 기관 홈페이지를 참고하세요.",
      ],
    },
    ...overrides,
  } as NormalizedForm;
}

function main(): void {
  let failures = 0;

  // A/B: notice above questions / distant from question
  const topNotice = baseForm();
  const ctxA = buildSurveyFormContext(topNotice);
  try {
    assert(ctxA.privacyNoticeBlocks.length >= 1, "privacy notice blocks missing");
    assert(ctxA.organizationCandidates.length >= 1, "organization not detected from intro");
    assert(ctxA.contactCandidates.length >= 1, "contact not detected form-wide");
    const corpus = formWideNoticeCorpus(topNotice);
    assert(corpus.includes("보유"), "corpus must include retention notice");
    assert(corpus.includes("성명"), "corpus must include question labels");
    console.log("A top notice+org+contact: PASS");
  } catch (e) {
    failures += 1;
    console.log("A top notice+org+contact: FAIL", e instanceof Error ? e.message : e);
  }

  // C: contact only at footer / metadata
  const footerOnly = baseForm({
    notices: {
      description: "설문 안내",
      purpose: undefined,
      items: undefined,
      retention: undefined,
      privacyNotice: undefined,
      contactDepartment: undefined,
    },
    metadata: {
      noticeTexts: ["문의 전화 031-999-8888 (고객센터)"],
    },
  });
  const ctxC = buildSurveyFormContext(footerOnly);
  try {
    assert(ctxC.contactCandidates.length >= 1, "footer contact missing");
    console.log("C footer contact: PASS");
  } catch (e) {
    failures += 1;
    console.log("C footer contact: FAIL", e instanceof Error ? e.message : e);
  }

  // F: PII questions without notice
  const noNotice = baseForm({
    notices: undefined,
    metadata: { noticeTexts: [] },
  });
  const ctxF = buildSurveyFormContext(noNotice);
  try {
    assert(ctxF.privacyNoticeBlocks.length === 0, "should not invent notice blocks");
    assert(ctxF.blocks.some((b) => b.type === "question"), "questions still present");
    console.log("F no-notice PII form: PASS");
  } catch (e) {
    failures += 1;
    console.log("F no-notice PII form: FAIL", e instanceof Error ? e.message : e);
  }

  // Multi-section order preserved
  const multi = baseForm({
    questions: [
      {
        id: "q0",
        label: "안내를 확인하셨습니까?",
        type: "privacy_consent",
        required: true,
        pageIndex: 0,
        detectedCategories: [],
      },
      {
        id: "q9",
        label: "이메일",
        type: "short_text",
        required: false,
        pageIndex: 2,
        detectedCategories: ["email"],
        auxiliaryText: "본 조사 문의: research@univ.ac.kr",
      },
    ],
  });
  const ctxD = buildSurveyFormContext(multi);
  try {
    assert(ctxD.blocks.length >= 3, "expected multi blocks");
    assert(
      ctxD.contactCandidates.some((c) => /@/.test(c.value)),
      "aux email contact",
    );
    console.log("D multi-section context: PASS");
  } catch (e) {
    failures += 1;
    console.log("D multi-section context: FAIL", e instanceof Error ? e.message : e);
  }

  if (failures > 0) {
    console.error(`\nform-context check failed: ${failures}`);
    process.exit(1);
  }
  console.log("\nform-context check: OK");
}

main();
