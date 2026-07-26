import type { CaptureAnswerType, CaptureProvider } from "@/lib/evidence/capture/captureTypes";

export interface VisibleQuestion {
  text: string;
  riskCategory:
    | "직접식별정보"
    | "준식별정보"
    | "민감정보"
    | "고위험정보"
    | "기타"
    | null;
  matchedKeyword?: string;
}

export interface FormPageState {
  provider: CaptureProvider;
  pageTitle: string;
  url: string;
  progressText: string | null;
  currentPageHint: number | null;
  totalPageHint: number | null;
  hasNext: boolean;
  hasSubmit: boolean;
  bodyFingerprint: string;
}

export interface TemporaryAnswerResult {
  filled: number;
  types: CaptureAnswerType[];
}

export type PageTransitionResult =
  | "moved"
  | "blocked"
  | "none"
  | "submit_gate";
