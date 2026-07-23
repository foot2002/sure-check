import {
  categoriesToDataLevel,
  detectCategories,
  getDetectedCategoryDisplayLabel,
  isPersonalDataCategory,
} from "@/lib/extractors/htmlTextUtils";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";
import type {
  DetectedCategory,
  FormNotices,
  NormalizedForm,
  NormalizedQuestion,
  Platform,
} from "@/lib/types/scan";

function mapPlatform(doc: ExtractedSurveyDocument): Platform {
  switch (doc.detectedToolFromText) {
    case "google_forms":
      return "google_forms";
    case "naver_forms":
      return "naver_forms";
    case "moaform":
      return "moaform";
    default:
      return "generic";
  }
}

function buildNotices(doc: ExtractedSurveyDocument): FormNotices {
  const notice = doc.detectedPrivacyNoticeText || doc.detectedNoticeText;
  return {
    description: notice,
    privacyNotice: notice,
    purpose: /수집\s*목적|이용\s*목적/.test(notice ?? "") ? notice : undefined,
    retention: /보유기간|보관/.test(notice ?? "") ? notice : undefined,
    destruction: /파기/.test(notice ?? "") ? notice : undefined,
    consentText: /동의/.test(notice ?? "") ? notice : undefined,
    refusalRight: /거부권/.test(notice ?? "") ? notice : undefined,
    processor: doc.detectedContact,
    contactDepartment: doc.detectedDepartment,
  };
}

function toQuestion(
  item: ExtractedSurveyDocument["questions"][number],
  index: number,
): NormalizedQuestion {
  const combined = `${item.title}\n${item.options.join("\n")}`;
  const detectedCategories = detectCategories(combined) as DetectedCategory[];
  const personalCategories = detectedCategories.filter(isPersonalDataCategory);
  const semanticCategories = detectedCategories.filter(
    (c) => !isPersonalDataCategory(c),
  );
  const hasPersonalData = personalCategories.length > 0;
  const personalDataTypes = personalCategories.map((category) =>
    getDetectedCategoryDisplayLabel(category, item.title),
  );

  return {
    id: `file_q_${index + 1}`,
    label: item.title,
    questionText: item.title,
    type: item.options.length > 0 ? "choice" : "text",
    required: item.required,
    hasPersonalData,
    personalDataTypes:
      personalDataTypes.length > 0 ? personalDataTypes : undefined,
    semanticCategories:
      semanticCategories.length > 0 ? semanticCategories : undefined,
    dataRiskLevel: hasPersonalData
      ? categoriesToDataLevel(personalCategories)
      : "D1",
    detectedCategories,
    options: item.options.length > 0 ? item.options : undefined,
    questionIndex: item.questionNumber ?? index + 1,
    pageIndex: 1,
  };
}

export function buildNormalizedFormFromFile(
  doc: ExtractedSurveyDocument,
): NormalizedForm {
  const platform = mapPlatform(doc);
  const questions = doc.questions.map(toQuestion);
  const notices = buildNotices(doc);
  const noticeText = doc.detectedPrivacyNoticeText || doc.detectedNoticeText || "";
  const failed =
    doc.extractionStatus === "failed" || questions.length === 0;

  return {
    platform,
    title: doc.title || doc.fileName,
    url: `uploaded://${encodeURIComponent(doc.fileName)}`,
    operatorType: doc.detectedSubject || "미확인",
    questions,
    pages: [{ id: "page_1", title: "업로드 설문", questions }],
    hasPrivacyNotice: /개인정보/.test(noticeText),
    hasConsent: /동의/.test(noticeText),
    hasRetentionNotice: /보유기간|보관|파기/.test(noticeText),
    hasOverseasTransferNotice: /국외이전|해외/.test(noticeText),
    partialScan: doc.extractionStatus === "partial",
    isLimited: failed,
    limitedReason: failed
      ? "파일은 읽었지만 실제 설문 문항과 개인정보 고지문을 충분히 추출하지 못했습니다."
      : undefined,
    confidence: failed ? "none" : doc.extractionStatus === "partial" ? "low" : "medium",
    extractedFromHtml: false,
    notices,
    metadata: {
      extractionMethod: `file_${doc.fileExtension}`,
      diagnosisScope: failed ? "limited" : doc.extractionStatus === "partial" ? "partial" : "full",
      operatorHint: doc.detectedSubject,
      noticeTexts: noticeText ? [noticeText] : [],
      extractionWarnings: doc.extractionLimitations,
      failureReason: failed ? "FILE_QUESTION_EXTRACTION_FAILED" : undefined,
      source: {
        kind: "file",
        fileName: doc.fileName,
        fileExtension: doc.fileExtension,
        mimeType: doc.mimeType,
        extractionStatus: doc.extractionStatus,
        extractionLimitations: doc.extractionLimitations,
        detectedToolFromText: doc.detectedToolFromText,
        textLength: doc.metadata.textLength,
      },
    },
  };
}
