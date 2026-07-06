export type ScanStatus =
  | "idle"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "limited";

export type Platform =
  | "google_forms"
  | "naver_forms"
  | "moaform"
  | "generic"
  | "wiseon_csap"
  | "unknown";

export type RiskGrade = "safe" | "caution" | "risk" | "high_risk";

export type DiagnosisStatus = "completed" | "limited" | "blocked" | "failed";

export type DiagnosticConfidence = "high" | "medium" | "low" | "none";

export type FindingCategory =
  | "context"
  | "data"
  | "tool"
  | "notice"
  | "management"
  | "override";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type MockReportKey =
  | "google_public_high_risk"
  | "naver_company_event_risk"
  | "moaform_employee_high_risk"
  | "generic_unknown_warning"
  | "wiseon_csap_caution";

export interface FormNotices {
  description?: string;
  privacyNotice?: string;
  consentText?: string;
  purpose?: string;
  items?: string;
  retention?: string;
  refusalRight?: string;
  refusalDisadvantage?: string;
  destruction?: string;
  processor?: string;
  trustee?: string;
  trusteeTask?: string;
  overseasTransfer?: string;
  overseasCountry?: string;
  overseasRecipient?: string;
  sensitiveConsent?: string;
  anonymity?: string;
  rawDataScope?: string;
  smallGroupPrivacy?: string;
  marketingConsent?: string;
  marketingOptOut?: string;
  privacyPolicyUrl?: string;
  contactDepartment?: string;
  prizeDestruction?: string;
  prizeSeparation?: string;
}

export interface FormManagementSignals {
  officialAccount?: boolean | null;
  accessControl?: boolean | null;
  rawDataDownloadControl?: boolean | null;
  retentionManagement?: boolean | null;
  resultDisclosurePrevention?: boolean | null;
  rawDataScopeDefined?: boolean | null;
  institutionalControl?: boolean | null;
  anonymityGuarantee?: boolean | null;
  csapVerified?: boolean;
  trusteeDisclosed?: boolean;
  domesticStorage?: boolean | null;
  publicSecurityVerified?: boolean;
}

export interface FormContextHints {
  isPublicAgency?: boolean;
  isEvent?: boolean;
  isEmployeeSurvey?: boolean;
  isMarketing?: boolean;
  isComplaint?: boolean;
  childPossible?: boolean;
  claimsAnonymous?: boolean;
  prizeDescription?: string;
}

export type DetectedCategory =
  | "name"
  | "phone"
  | "email"
  | "address"
  | "birthdate"
  | "affiliation"
  | "organization_identifier"
  | "quasi_identifier"
  | "sensitive_health"
  | "sensitive_belief_union"
  | "sensitive_complaint"
  | "sensitive_political"
  | "sensitive_religion"
  | "unique_identifier"
  | "financial"
  | "resident_registration_number"
  | "passport_number"
  | "driver_license_number"
  | "foreign_registration_number"
  | "id_document"
  | "financial_account"
  | "authentication_secret"
  | "gender"
  | "respondent_age"
  | "age_range"
  | "child_age_range"
  | "residence_area"
  | "department"
  | "position"
  | "tenure"
  | "program_preference"
  | "policy_opinion"
  | "service_feedback"
  | "visit_purpose"
  | "satisfaction"
  | "preference"
  | "improvement_opinion"
  | "general_opinion";

export type QuestionRiskTag = "file_upload" | "privacy_consent" | "free_text_possible_pii";

export interface FormMetadata {
  noticeTexts?: string[];
  privacyPolicyUrls?: string[];
  headings?: string[];
  extractionWarnings?: string[];
}

export interface NormalizedPage {
  id: string;
  title?: string;
  questions: NormalizedQuestion[];
}

export interface NormalizedQuestion {
  id: string;
  label: string;
  type: string;
  required: boolean;
  hasPersonalData: boolean;
  personalDataTypes?: string[];
  dataRiskLevel?: "D0" | "D1" | "D2" | "D3" | "D4" | "D5";
  detectedCategories?: DetectedCategory[];
  riskTags?: QuestionRiskTag[];
  questionText?: string;
  auxiliaryText?: string;
  options?: string[];
  pageIndex?: number;
  questionIndex?: number;
}

export interface NormalizedForm {
  platform: Platform;
  title: string;
  url: string;
  operatorType?: string;
  questions: NormalizedQuestion[];
  pages?: NormalizedPage[];
  hasPrivacyNotice: boolean;
  hasConsent: boolean;
  hasRetentionNotice: boolean;
  hasOverseasTransferNotice: boolean;
  partialScan?: boolean;
  isLimited?: boolean;
  limitedReason?: string;
  confidence?: DiagnosticConfidence;
  loginRequired?: boolean;
  branchDetected?: boolean;
  extractedFromHtml?: boolean;
  notices?: FormNotices;
  management?: FormManagementSignals;
  contextHints?: FormContextHints;
  metadata?: FormMetadata;
  detectedFields?: string[];
  fixtureKey?: MockReportKey;
}

export interface ScanFinding {
  id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  evidence?: string[];
  recommendation?: string;
}

export interface ReportSections {
  dataCollectionRisk: string;
  toolProcessingRisk: string;
  noticeConsentGap: string;
  managementRisk: string;
  detectedPersonalData: string[];
  missingObligations: string[];
  respondentGuidance: string[];
  operatorRecommendations: string[];
  evidenceItems: string[];
  legalBasisSummary: string;
  disclaimer: string;
}

import type { AnalyzerTrace, ScanDebugInfo } from "@/lib/types/debug";

export interface ScanReport {
  scanId: string;
  formUrl: string;
  platform: Platform;
  mockKey: MockReportKey;
  diagnosisStatus?: DiagnosisStatus;
  grade?: RiskGrade;
  score?: number | null;
  isLimited?: boolean;
  limitedReason?: string;
  confidence?: DiagnosticConfidence;
  summary: string;
  sections: ReportSections;
  findings: ScanFinding[];
  form: NormalizedForm;
  createdAt: string;
  completedAt: string;
  scanStatus?: ScanStatus;
  limitationReasons?: string[];
  debug?: ScanDebugInfo;
  analyzerTrace?: AnalyzerTrace;
}

export interface ScanJob {
  scanId: string;
  status: ScanStatus;
  formUrl: string;
  platform: Platform;
  mockKey: MockReportKey;
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface CreateScanJobInput {
  formUrl: string;
}

export const SCAN_STEPS = [
  "URL 안전성 확인",
  "설문 플랫폼 확인",
  "문항 구조 분석",
  "개인정보 항목 탐지",
  "개인정보보호법 기준 리포트 생성",
] as const;
