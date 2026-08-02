import type { AnalysisResult } from "@/lib/types/analyzer";
import type {
  DiagnosisStatus,
  DiagnosticConfidence,
  Platform,
  RiskGrade,
} from "@/lib/types/scan";

export interface AnalyzerTraceStep {
  id: string;
  title: string;
  summary: string;
  details: string[];
}

export interface AnalyzerTrace {
  steps: AnalyzerTraceStep[];
}

export interface ScanDebugNoticeGap {
  key: string;
  label: string;
  status: string;
  detail: string;
}

export interface ScanDebugInfo {
  inputUrl: string;
  normalizedUrl: string;
  platform: Platform;
  diagnosisStatus?: DiagnosisStatus;
  finalUrl?: string;
  extractorName: string;
  questionCount: number;
  partialScan: boolean;
  isLimited: boolean;
  limitedReason?: string;
  confidence?: DiagnosticConfidence;
  branchDetected?: boolean;
  loginRequired?: boolean;
  closedForm?: boolean;
  contextLabels: string[];
  contextSummary?: string;
  publicSectorDetected: boolean;
  publicSectorConfidence?: "high" | "medium" | "low" | "none";
  publicSectorEvidence: string[];
  publicInstitutionEvidence?: {
    matchedName?: string;
    matchedType?: string;
    matchedRegion?: string;
    matchedBy?: string;
    evidenceText?: string;
    evidenceSource?: string;
  };
  dataRiskLevel?: AnalysisResult["dataRisk"]["level"];
  dataRiskLabel?: string;
  toolRiskLevel?: AnalysisResult["toolRisk"]["level"];
  toolRiskLabel?: string;
  obligations: AnalysisResult["obligations"];
  missingNotices: ScanDebugNoticeGap[];
  managementItems: AnalysisResult["management"]["items"];
  overrideRules: AnalysisResult["overrides"];
  finalScore?: number | null;
  finalGrade?: RiskGrade;
  scoreBreakdown?: AnalysisResult["score"];
  extractionMode?:
    | "platform_parser"
    | "fast_static"
    | "browser_fallback"
    | "limited";
  browserUsed?: boolean;
  browserReason?: string;
  fastExtractorConfidence?: DiagnosticConfidence;
  fallbackTriggered?: boolean;
  fallbackReason?: string;
  extractDurationMs?: number;
  analysisDurationMs?: number;
  saveDurationMs?: number;
  totalDurationMs?: number;
}

export interface ReportBuildContext {
  normalizedUrl?: string;
  finalUrl?: string;
}
