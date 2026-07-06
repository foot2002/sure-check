import type { DataRiskLevel } from "@/lib/types/analyzer";
import type {
  DiagnosisStatus,
  DetectedCategory,
  NormalizedForm,
  Platform,
  RiskGrade,
  ScanReport,
} from "@/lib/types/scan";

export type PlatformGroup =
  | "google_forms"
  | "naver_forms"
  | "moaform"
  | "generic_html"
  | "walla"
  | "now_survey"
  | "survey_monkey"
  | "typeform"
  | "microsoft_forms"
  | "qualtrics"
  | "wiseon_survey"
  | "research_company_custom"
  | "unknown";

export type ExpectedPlatform =
  | "google_forms"
  | "naver_forms"
  | "moaform"
  | "generic"
  | "wiseon_csap"
  | "unknown";

export type ExpectedExtractor =
  | "GoogleFormsExtractor"
  | "NaverFormsExtractor"
  | "MoaformExtractor"
  | "GenericHtmlExtractor"
  | "Limited"
  | "Fixture";

export type ExpectedDetectedCategory = DetectedCategory;

export type ExpectedContext =
  | "public_sector"
  | "company"
  | "employee"
  | "event"
  | "marketing"
  | "complaint"
  | "unknown";

export type ExpectedDataLevel = DataRiskLevel;

export interface ValidationCase {
  id: string;
  name: string;
  url: string;
  platformGroup: PlatformGroup;
  expectedPlatform?: ExpectedPlatform;
  expectedExtractor?: ExpectedExtractor;
  expectedMinQuestionCount?: number;
  expectedDetectedCategories?: ExpectedDetectedCategory[];
  expectedRiskGrade?: RiskGrade;
  expectedIsLimited?: boolean;
  expectedContext?: ExpectedContext;
  expectedDataLevel?: ExpectedDataLevel;
  notes?: string;
  enabled: boolean;
}

export type ValidationResultStatus = "pass" | "partial" | "fail" | "skipped" | "error";

export interface ActualValidationValues {
  actualPlatform: Platform;
  actualExtractor: string;
  actualQuestionCount: number;
  actualDetectedCategories: ExpectedDetectedCategory[];
  actualRiskGrade?: RiskGrade;
  actualIsLimited: boolean;
  actualLimitedReason?: string;
  actualContext: ExpectedContext;
  actualDataLevel?: ExpectedDataLevel;
  actualScore?: number | null;
  actualDiagnosisStatus?: DiagnosisStatus;
}

export interface ValidationResult extends ActualValidationValues {
  caseId: string;
  caseName: string;
  url: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  status: ValidationResultStatus;
  matched: string[];
  mismatches: string[];
  warnings: string[];
  errorMessage?: string;
  report?: ScanReport;
  normalizedForm?: NormalizedForm;
}

export interface ValidationRunSummary {
  total: number;
  passed: number;
  partial: number;
  failed: number;
  skipped: number;
  errors: number;
  averageQuestionCount: number;
  limitedCount: number;
  platformSuccessRates: Record<string, { total: number; passed: number; rate: number }>;
}

export interface ValidationRunRecord {
  runId: string;
  startedAt: string;
  completedAt: string;
  results: ValidationResult[];
  summary: ValidationRunSummary;
}

export const VALIDATION_STORAGE_KEYS = {
  cases: "sure-check-validation-cases",
  results: "sure-check-validation-results",
  lastRunAt: "sure-check-validation-last-run-at",
} as const;

export type CoverageStatus =
  | "supported"
  | "partial"
  | "generic_beta"
  | "limited"
  | "not_implemented"
  | "playwright_required";

export interface PlatformCoverageRow {
  id: string;
  label: string;
  platformGroup: PlatformGroup;
  urlDetection: CoverageStatus;
  htmlFetch: CoverageStatus;
  questionExtraction: CoverageStatus;
  piiDetection: CoverageStatus;
  noticeDetection: CoverageStatus;
  limitedHandling: CoverageStatus;
  dedicatedExtractor: CoverageStatus;
  playwrightNeeded: CoverageStatus;
  priority: "P0" | "P1" | "P2" | "P3";
}

export type CaseRunProgress = "idle" | "queued" | "running" | "done";

export interface CaseProgressState {
  caseId: string;
  progress: CaseRunProgress;
  resultStatus?: ValidationResultStatus;
}
