import {
  categoriesToDataLevel,
  collapseWhitespace,
  getDetectedCategoryDisplayLabel,
  isPersonalDataCategory,
} from "@/lib/extractors/htmlTextUtils";
import type { MoaformExtractorInput } from "@/lib/extractors/moaformTypes";
import { parseMoaformDocument } from "@/lib/extractors/moaformParser";
import type {
  DetectedCategory,
  NormalizedForm,
  NormalizedPage,
  NormalizedQuestion,
  QuestionRiskTag,
} from "@/lib/types/scan";

function toNormalizedQuestion(
  parsed: Awaited<ReturnType<typeof parseMoaformDocument>>["questions"][number],
): NormalizedQuestion {
  const categories = parsed.detectedCategories as DetectedCategory[];
  const personalDataTypes = categories.map((category) =>
    getDetectedCategoryDisplayLabel(category, parsed.questionText),
  );
  const hasPersonalData = categories.some(isPersonalDataCategory);

  return {
    id: parsed.id,
    label: parsed.questionText,
    questionText: parsed.questionText,
    type: parsed.questionType,
    required: parsed.required,
    hasPersonalData,
    personalDataTypes: personalDataTypes.length > 0 ? personalDataTypes : undefined,
    dataRiskLevel: hasPersonalData ? categoriesToDataLevel(categories) : "D1",
    detectedCategories: categories,
    riskTags: parsed.riskTags as QuestionRiskTag[],
    auxiliaryText: parsed.description,
    options: parsed.options.length > 0 ? parsed.options : undefined,
    pageIndex: parsed.pageIndex,
    questionIndex: parsed.questionIndex,
  };
}

function buildPages(questions: NormalizedQuestion[]): NormalizedPage[] {
  const pageMap = new Map<number, NormalizedPage>();

  for (const question of questions) {
    const pageIndex = question.pageIndex ?? 0;
    if (!pageMap.has(pageIndex)) {
      pageMap.set(pageIndex, {
        id: `page_${pageIndex}`,
        questions: [],
      });
    }
    pageMap.get(pageIndex)!.questions.push(question);
  }

  if (pageMap.size === 0) {
    return [{ id: "page_0", questions: [] }];
  }

  return [...pageMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, page]) => page);
}

function detectNoticeFlags(noticeTexts: string[], description: string) {
  const joined = [description, ...noticeTexts].join(" ");
  return {
    hasPrivacyNotice: /개인정보/.test(joined),
    hasConsent: /동의/.test(joined),
    hasRetentionNotice: /보유|이용기간/.test(joined),
    hasOverseasTransferNotice: /국외/.test(joined),
  };
}

export async function extractMoaform(
  input: MoaformExtractorInput,
): Promise<NormalizedForm> {
  const parsed = await parseMoaformDocument(input.html, input.finalUrl);
  const normalizedQuestions = parsed.questions.map(toNormalizedQuestion);
  const pages = buildPages(normalizedQuestions);
  const noticeFlags = detectNoticeFlags(parsed.noticeTexts, parsed.description);

  const description = collapseWhitespace(
    [parsed.description, ...parsed.noticeTexts].filter(Boolean).join("\n"),
  );

  const operatorHint = parsed.operatorHint;
  const operatorLabel = operatorHint
    ? `${operatorHint} (확인 필요)`
    : "미확인";

  const extractionWarnings = [
    ...parsed.warnings,
    parsed.extractionMethod === "dom_fallback"
      ? "DOM fallback으로 일부 문항만 추출했습니다."
      : undefined,
    parsed.closedForm ? "응답이 종료된 모아폼으로 보입니다." : undefined,
    parsed.loginRequired ? "로그인 또는 접근 권한이 필요할 수 있습니다." : undefined,
    parsed.failureReason
      ? `모아폼 제한 사유 코드: ${parsed.failureReason}`
      : undefined,
  ].filter((warning): warning is string => Boolean(warning));

  const hasNoQuestions = normalizedQuestions.length === 0;
  const isLimited = parsed.isLimited || hasNoQuestions;

  return {
    platform: "moaform",
    title: parsed.title || "모아폼 설문",
    url: input.finalUrl,
    operatorType: operatorLabel,
    questions: normalizedQuestions,
    pages,
    partialScan:
      parsed.partialScan || parsed.extractionMethod === "dom_fallback",
    isLimited,
    confidence: isLimited
      ? "none"
      : parsed.partialScan
        ? "medium"
        : "high",
    limitedReason: parsed.limitedReason,
    loginRequired: parsed.loginRequired,
    branchDetected: parsed.branchDetected,
    extractedFromHtml: true,
    hasPrivacyNotice: noticeFlags.hasPrivacyNotice,
    hasConsent: noticeFlags.hasConsent,
    hasRetentionNotice: noticeFlags.hasRetentionNotice,
    hasOverseasTransferNotice: noticeFlags.hasOverseasTransferNotice,
    notices: {
      description: description.slice(0, 2000),
      privacyNotice: parsed.noticeTexts.join("\n").slice(0, 2000),
      privacyPolicyUrl: parsed.privacyPolicyUrls[0],
      processor: operatorHint,
      contactDepartment: operatorHint,
    },
    metadata: {
      noticeTexts: parsed.noticeTexts,
      privacyPolicyUrls: parsed.privacyPolicyUrls,
      headings: [
        ...(parsed.pageMeta?.headings ?? []),
        ...pages.map((page) => page.title).filter((title): title is string => Boolean(title)),
      ],
      extractionWarnings,
      failureReason: parsed.failureReason,
      extractionMethod: parsed.extractionMethod,
      operatorHint,
      operatorCandidates: parsed.operatorCandidates,
      diagnosisScope: isLimited ? "limited" : "full",
    },
    management: {
      officialAccount: null,
      accessControl: null,
      rawDataDownloadControl: null,
      retentionManagement: null,
      resultDisclosurePrevention: null,
      rawDataScopeDefined: null,
      institutionalControl: null,
      anonymityGuarantee: null,
      csapVerified: false,
      trusteeDisclosed: false,
      domesticStorage: null,
    },
    detectedFields: normalizedQuestions.map(
      (question) =>
        `${question.type}: ${question.label}${question.required ? " (필수)" : ""}${
          question.options?.length ? ` [${question.options.join(", ")}]` : ""
        }`,
    ),
  };
}
