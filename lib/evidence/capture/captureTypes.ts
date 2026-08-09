export type CaptureMode = "safe_public_only" | "evidence_full_walkthrough";

export type CaptureStatus = "success" | "partial" | "failed" | "timeout";

export type CaptureCompleteness = "complete" | "partial" | "failed";

export type CaptureProvider =
  | "google_forms"
  | "naver_form"
  | "moaform"
  | "generic";

export type CaptureAnswerType =
  | "radio"
  | "checkbox"
  | "select"
  | "text"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "file"
  | "contenteditable"
  | "scale"
  | "grid";

export type PageQuestionRisk =
  | "직접식별정보"
  | "준식별정보"
  | "민감정보"
  | "고위험정보"
  | "기타"
  | null;

export interface CapturePageMeta {
  pageNumber: number;
  pageTitle: string;
  capturedUrl: string;
  capturedAt: string;
  screenshotFileName: string;
  provider?: CaptureProvider;
  detectedQuestions: string[];
  visibleQuestions?: string[];
  personalInfoQuestions: string[];
  sensitiveInfoQuestions: string[];
  highRiskQuestions: string[];
  temporaryAnswersUsed: boolean;
  temporaryAnswersUsedAfterCapture?: boolean;
  temporaryAnswerTypes: CaptureAnswerType[];
  finalSubmitDetected: boolean;
  finalSubmitClicked?: boolean;
}

export type CaptureSectionType =
  | "survey_top"
  | "page_body"
  | "question_focus"
  | "footer"
  | "unknown";

export interface CaptureScreenshot {
  id: string;
  label: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  buffer: Buffer;
  capturedAt: string;
  capturedAtKst: string;
  capturedUrl: string;
  finalUrl: string;
  pageTitle: string;
  viewport: { width: number; height: number };
  source: "auto_browser_capture";
  size: number;
  pageNumber?: number;
  mode?: CaptureMode;
  /** Logical section hint for evidence linking (not a separate crop). */
  sectionType?: CaptureSectionType;
  platform?: CaptureProvider | "unknown";
}

export interface AutoScreenshotPayload {
  id: string;
  label: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  capturedAt: string;
  capturedAtKst: string;
  capturedUrl: string;
  finalUrl: string;
  viewport: { width: number; height: number };
  pageTitle: string;
  source: "auto_browser_capture";
  base64: string;
  size: number;
  pageNumber?: number;
  mode?: CaptureMode;
}

export type CapturePathScope =
  | "traversed_path"
  | "single_page"
  | "partial_path"
  | "unknown";

export interface CaptureSurveyResult {
  status: CaptureStatus;
  success: boolean;
  mode: CaptureMode;
  captureProvider?: CaptureProvider;
  /** @deprecated Prefer expectedCapturablePageCount + sectionProgressTotal */
  expectedPageCount?: number | null;
  capturedPageCount?: number;
  captureCompleteness?: CaptureCompleteness;
  capturePathScope?: CapturePathScope;
  /** UI progress total (e.g. Google "22 sections") — may exceed capturable pages */
  sectionProgressTotal?: number | null;
  /** Pages reachable on the auto-explored path (usually equals captured when complete) */
  expectedCapturablePageCount?: number | null;
  finalSubmitDetected?: boolean;
  finalSubmitClicked?: boolean;
  blockedSubmitRequestCount?: number;
  stopReason?: string;
  stopPage?: number | null;
  branchLimitations?: string[];
  piiSensitivePagesCaptured?: boolean;
  /** Prefer paths like 02_화면캡처/page_20.png */
  piiSensitiveScreenshotFiles?: string[];
  screenshots: AutoScreenshotPayload[];
  pageMetas: CapturePageMeta[];
  limitations: string[];
  temporaryAnswersUsed: boolean;
  startedAt?: string;
  finishedAt?: string;
}

export function toAutoScreenshotPayload(
  shot: CaptureScreenshot,
): AutoScreenshotPayload {
  return {
    id: shot.id,
    label: shot.label,
    fileName: shot.fileName,
    mimeType: shot.mimeType,
    capturedAt: shot.capturedAt,
    capturedAtKst: shot.capturedAtKst,
    capturedUrl: shot.capturedUrl,
    finalUrl: shot.finalUrl,
    viewport: shot.viewport,
    pageTitle: shot.pageTitle,
    source: shot.source,
    base64: shot.buffer.toString("base64"),
    size: shot.size,
    pageNumber: shot.pageNumber,
    mode: shot.mode,
  };
}

export function deriveCompleteness(input: {
  shotCount: number;
  reachedSubmitGate: boolean;
  timedOut: boolean;
  stoppedEarly: boolean;
  expectedPageCount?: number | null;
  /** True when submit appeared far earlier than expected (branch/short path) */
  prematureSubmit?: boolean;
}): CaptureCompleteness {
  if (input.shotCount === 0) return "failed";
  if (input.prematureSubmit) return "partial";
  if (
    input.reachedSubmitGate &&
    !input.prematureSubmit &&
    (input.expectedPageCount == null ||
      input.shotCount >= Math.min(input.expectedPageCount, 5) ||
      input.expectedPageCount <= 2)
  ) {
    return "complete";
  }
  if (input.reachedSubmitGate && input.expectedPageCount != null) {
    // Reached a submit UI but captured far fewer than expected → incomplete path
    if (input.shotCount < Math.max(4, Math.floor(input.expectedPageCount * 0.5))) {
      return "partial";
    }
    return "complete";
  }
  if (input.timedOut || input.stoppedEarly) return "partial";
  return "partial";
}
