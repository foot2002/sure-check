/**
 * Compatibility entry — implementation lives in lib/evidence/capture/.
 */
export { captureSurveyScreenshots } from "@/lib/evidence/capture/captureSurveyScreenshots";
export type {
  AutoScreenshotPayload,
  CaptureSurveyResult,
  CaptureScreenshot,
  CaptureStatus,
  CaptureMode,
  CapturePageMeta,
} from "@/lib/evidence/capture/captureTypes";

/** @deprecated Use CaptureSurveyResult */
export type CaptureResult = import("@/lib/evidence/capture/captureTypes").CaptureSurveyResult;
