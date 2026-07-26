import type { ElementHandle, Page } from "puppeteer-core";
import type { FormCaptureAdapter } from "@/lib/evidence/capture/fullWalkthrough/FormCaptureAdapter";
import {
  buildBasePageState,
  clickMarkedOrHandle,
  detectValidationErrors,
  extractQuestionsFromSelectors,
  findNextControl,
  findSubmitControl,
  readBodyFingerprint,
  sleep,
  waitForFingerprintChange,
} from "@/lib/evidence/capture/fullWalkthrough/adapterUtils";
import { fillTemporaryAnswers } from "@/lib/evidence/capture/fullWalkthrough/responseFiller";
import { captureFullPage } from "@/lib/evidence/capture/screenshotCapture";
import type {
  FormPageState,
  PageTransitionResult,
  TemporaryAnswerResult,
  VisibleQuestion,
} from "@/lib/evidence/capture/fullWalkthrough/pageState";
import type { CaptureScreenshot } from "@/lib/evidence/capture/captureTypes";

const GENERIC_SELECTORS = [
  '[role="heading"]',
  "label",
  "h1",
  "h2",
  "h3",
  "legend",
  ".question",
  "[class*='question']",
];

/** Soft cap for unknown platforms */
export const GENERIC_MAX_PAGES = 10;

export const genericFormAdapter: FormCaptureAdapter = {
  provider: "generic",

  async detect(url: string, page: Page): Promise<boolean> {
    void url;
    void page;
    return true;
  },

  async waitForReady(page: Page): Promise<void> {
    await page
      .waitForFunction(
        () => (document.body?.innerText || "").trim().length > 20,
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    await sleep(350);
  },

  async getCurrentPageState(page: Page): Promise<FormPageState> {
    return buildBasePageState(page, "generic");
  },

  async estimateExpectedPageCount(page: Page): Promise<number | null> {
    const state = await buildBasePageState(page, "generic");
    return state.totalPageHint;
  },

  async extractVisibleQuestions(page: Page): Promise<VisibleQuestion[]> {
    return extractQuestionsFromSelectors(page, GENERIC_SELECTORS);
  },

  async captureCurrentPage(
    page: Page,
    pageNumber: number,
  ): Promise<CaptureScreenshot> {
    return captureFullPage(page, pageNumber, "evidence_full_walkthrough");
  },

  async fillRequiredFieldsForNavigation(
    page: Page,
  ): Promise<TemporaryAnswerResult> {
    return fillTemporaryAnswers(page);
  },

  async findNextButton(page: Page): Promise<ElementHandle<Element> | null> {
    return findNextControl(page);
  },

  async findSubmitButton(page: Page): Promise<ElementHandle<Element> | null> {
    return findSubmitControl(page);
  },

  async clickNext(page: Page): Promise<PageTransitionResult> {
    const before = await readBodyFingerprint(page);
    const next = await findNextControl(page);
    const submit = await findSubmitControl(page);

    if (!next && submit) {
      await submit.dispose().catch(() => undefined);
      return "submit_gate";
    }
    if (submit) await submit.dispose().catch(() => undefined);

    const clicked = await clickMarkedOrHandle(page, next);
    if (!clicked) return "none";

    const moved = await waitForFingerprintChange(page, before, 8_000);
    if (moved) return "moved";
    return "blocked";
  },

  detectValidationErrors,
};
