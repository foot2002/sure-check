import type { ElementHandle, Page } from "puppeteer-core";
import type { CaptureProvider } from "@/lib/evidence/capture/captureTypes";
import type { CaptureScreenshot } from "@/lib/evidence/capture/captureTypes";
import type {
  FormPageState,
  PageTransitionResult,
  TemporaryAnswerResult,
  VisibleQuestion,
} from "@/lib/evidence/capture/fullWalkthrough/pageState";

export interface FormCaptureAdapter {
  provider: CaptureProvider;

  detect(url: string, page: Page): Promise<boolean>;

  waitForReady(page: Page): Promise<void>;

  getCurrentPageState(page: Page): Promise<FormPageState>;

  estimateExpectedPageCount(page: Page): Promise<number | null>;

  extractVisibleQuestions(page: Page): Promise<VisibleQuestion[]>;

  captureCurrentPage(
    page: Page,
    pageNumber: number,
  ): Promise<CaptureScreenshot>;

  fillRequiredFieldsForNavigation(
    page: Page,
  ): Promise<TemporaryAnswerResult>;

  findNextButton(page: Page): Promise<ElementHandle<Element> | null>;

  findSubmitButton(page: Page): Promise<ElementHandle<Element> | null>;

  clickNext(page: Page): Promise<PageTransitionResult>;

  detectValidationErrors(page: Page): Promise<string[]>;

  /** Optional: explore alternate branch when premature submit is detected. */
  tryAlternateBranch?(page: Page): Promise<boolean>;
}
