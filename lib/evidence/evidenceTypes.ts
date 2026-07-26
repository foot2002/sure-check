export type EvidenceRiskCategory =
  | "직접식별정보"
  | "준식별정보"
  | "민감정보"
  | "고위험정보"
  | "기타";

export type EvidenceSourceType =
  | "html"
  | "json"
  | "file_text"
  | "screenshot"
  | "manual_upload";

export interface EvidenceQuestion {
  questionNumber: string;
  questionText: string;
  detectedDataType: string;
  riskCategory: EvidenceRiskCategory;
  matchedKeyword: string;
  source: string;
  confidence: "high" | "medium" | "low";
}

export interface EvidenceDataItem {
  dataItem: string;
  category: EvidenceRiskCategory;
  examples: string;
  detectedQuestions: string;
  riskReason: string;
}

export interface EvidenceNoticeCheck {
  item: string;
  status: string;
  evidence: string;
}

export interface EvidenceLegalGround {
  label: string;
  shortTitle: string;
  reviewNote: string;
}

export interface EvidenceSource {
  type: EvidenceSourceType;
  label: string;
  extractedAt: string;
  excerpt: string;
  hash?: string;
}

export interface EvidenceScreenshotMeta {
  fileName: string;
  label: string;
  mimeType: string;
  addedAt: string;
}

export interface EvidencePrivacyNotice {
  rawText: string;
  source: "html" | "json" | "file_text";
  detectedItems: string[];
  noticeChecks: EvidenceNoticeCheck[];
}

export interface ReportEvidenceModel {
  packageVersion: string;
  diagnosisId: string;
  generatedAt: string;
  generatedAtKst: string;
  surveyTitle: string;
  surveyUrl: string;
  finalUrl: string;
  sourceType: "url" | "file";
  fileName?: string;
  toolName: string;
  operatorName: string;
  subjectType: string;
  subjectEvidence?: string;
  userDecision: string;
  internalVerdict: string;
  diagnosisMethod: string;
  coreReasons: string[];
  detectedPersonalDataItems: string[];
  detectedSensitiveDataItems: string[];
  detectedHighRiskDataItems: string[];
  totalQuestionCount: number;
  detectedPersonalDataQuestionCount: number;
  detectedSensitiveQuestionCount: number;
  detectedHighRiskQuestionCount: number;
  detectedQuestions: EvidenceQuestion[];
  detectedDataItems: EvidenceDataItem[];
  noticeChecks: EvidenceNoticeCheck[];
  privacyNotice: EvidencePrivacyNotice;
  legalGrounds: EvidenceLegalGround[];
  extractionSources: EvidenceSource[];
  noticeExcerpt: string;
  limitations: string[];
  disclaimer: string;
}

export interface ManualEvidenceFile {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  label: string;
}

export interface AutoCaptureEvidenceFile {
  id: string;
  label: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  capturedAt: string;
  capturedAtKst?: string;
  capturedUrl: string;
  finalUrl: string;
  pageTitle: string;
  viewport: { width: number; height: number };
  source: "auto_browser_capture";
  size: number;
  pageNumber?: number;
  mode?: string;
}

export interface CapturePageMetaEvidence {
  pageNumber: number;
  pageTitle: string;
  capturedUrl: string;
  capturedAt: string;
  screenshotFileName: string;
  provider?: string;
  detectedQuestions: string[];
  visibleQuestions?: string[];
  personalInfoQuestions: string[];
  sensitiveInfoQuestions: string[];
  highRiskQuestions: string[];
  temporaryAnswersUsed: boolean;
  temporaryAnswersUsedAfterCapture?: boolean;
  temporaryAnswerTypes: string[];
  finalSubmitDetected: boolean;
  finalSubmitClicked?: boolean;
}

export interface ScreenCaptureEvidenceMeta {
  id: string;
  storedName: string;
  mimeType: string;
  size: number;
  sha256: string;
  source: "auto_browser_capture" | "manual_upload";
  capturedAt: string;
  capturedAtKST?: string;
  capturedUrl?: string;
  finalUrl?: string;
  pageTitle?: string;
  viewport?: { width: number; height: number };
  label?: string;
}

export interface EvidencePackageCaptureOptions {
  autoScreenshots?: AutoCaptureEvidenceFile[];
  captureLimitations?: string[];
  captureAttempted?: boolean;
  /** success | partial | failed | timeout — optional for ZIP/manifest */
  captureStatus?: string;
  captureMode?: "safe_public_only" | "evidence_full_walkthrough" | string;
  captureProvider?: string;
  expectedPageCount?: number | null;
  expectedCapturablePageCount?: number | null;
  sectionProgressTotal?: number | null;
  capturedPageCount?: number;
  captureCompleteness?: "complete" | "partial" | "failed" | string;
  capturePathScope?: string;
  finalSubmitDetected?: boolean;
  finalSubmitClicked?: boolean;
  blockedSubmitRequestCount?: number;
  stopReason?: string;
  stopPage?: number | null;
  branchLimitations?: string[];
  piiSensitivePagesCaptured?: boolean;
  piiSensitiveScreenshotFiles?: string[];
  pageMetas?: CapturePageMetaEvidence[];
  temporaryAnswersUsed?: boolean;
}

export const EVIDENCE_DISCLAIMER =
  "이 자료는 신고기관의 사실관계 확인을 돕기 위한 참고자료입니다. 최종 위법 여부는 개인정보보호위원회 또는 KISA의 검토·조사 결과에 따라 판단됩니다.";

export const MAX_SOURCE_EXCERPT_BYTES = 2 * 1024 * 1024;
export const MAX_MANUAL_EVIDENCE_FILES = 5;
export const MAX_MANUAL_EVIDENCE_BYTES = 5 * 1024 * 1024;
