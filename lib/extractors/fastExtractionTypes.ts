import type {
  DiagnosticConfidence,
  NormalizedForm,
  NormalizedQuestion,
  Platform,
} from "@/lib/types/scan";

export type ExtractionMode =
  | "platform_parser"
  | "fast_static"
  | "browser_fallback"
  | "limited";

export type FallbackReason =
  | "zero_questions"
  | "low_confidence"
  | "multi_page_signal"
  | "branching_signal"
  | "question_count_drop"
  | "risk_detection_drop"
  | "missing_privacy_notice"
  | "invalid_structure";

export interface FastExtractionSignals {
  hasTitle: boolean;
  hasPrivacyNotice: boolean;
  hasRequiredMarkers: boolean;
  hasNextButton: boolean;
  hasMultiPageSignal: boolean;
  hasBranchingSignal: boolean;
}

export interface FastExtractionResult {
  ok: boolean;
  platform: Platform | "unknown";
  extractionMode: Extract<ExtractionMode, "platform_parser" | "fast_static" | "limited">;
  confidence: DiagnosticConfidence;
  title?: string;
  operatorName?: string;
  description?: string;
  privacyNoticeText?: string;
  questions: NormalizedQuestion[];
  limitations: string[];
  signals: FastExtractionSignals;
  form?: NormalizedForm;
}

export interface ConfidenceGateDecision {
  accept: boolean;
  fallbackTriggered: boolean;
  fallbackReason?: FallbackReason;
  reasons: FallbackReason[];
}

export interface ScanExtractionMeta {
  extractionMode: ExtractionMode;
  browserUsed: boolean;
  browserReason?: string | null;
  fastExtractorConfidence?: DiagnosticConfidence | null;
  fallbackTriggered: boolean;
  fallbackReason?: FallbackReason | null;
  extractDurationMs?: number | null;
  analysisDurationMs?: number | null;
  saveDurationMs?: number | null;
  totalDurationMs?: number | null;
}
