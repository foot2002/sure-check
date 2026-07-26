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
import { getSearchContexts } from "@/lib/evidence/capture/fullWalkthrough/captureTrace";
import { fillTemporaryAnswers } from "@/lib/evidence/capture/fullWalkthrough/responseFiller";
import { captureFullPage } from "@/lib/evidence/capture/screenshotCapture";
import type {
  FormPageState,
  PageTransitionResult,
  TemporaryAnswerResult,
  VisibleQuestion,
} from "@/lib/evidence/capture/fullWalkthrough/pageState";
import type { CaptureScreenshot } from "@/lib/evidence/capture/captureTypes";

const NAVER_QUESTION_SELECTORS = [
  ".question_title",
  ".question_area .title",
  ".questionnaire_item .title",
  '[class*="QuestionTitle"]',
  '[class*="question_title"]',
  "h2",
  "h3",
  "label",
  '[role="heading"]',
];

async function waitForNaverRendered(page: Page): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const contexts = await getSearchContexts(page);
    for (const ctx of contexts) {
      const ready = await ctx
        .evaluate(() => {
          const text = (document.body?.innerText || "").trim();
          const hasQuestion = Boolean(
            document.querySelector(
              ".question_area, .questionnaire_item, [class*='question'], input, textarea, select, [role='radio'], label",
            ),
          );
          const hasButton = Array.from(
            document.querySelectorAll("button, [role='button'], a"),
          ).some((el) => {
            const t = ((el as HTMLElement).innerText || "").trim();
            return /다음|계속|제출|응답|완료|시작/i.test(t);
          });
          return text.length > 40 && (hasQuestion || hasButton);
        })
        .catch(() => false);
      if (ready) {
        await sleep(400);
        return;
      }
    }
    await sleep(250);
  }
}

export const naverFormAdapter: FormCaptureAdapter = {
  provider: "naver_form",

  async detect(url: string, page: Page): Promise<boolean> {
    if (/form\.naver\.com/i.test(url)) return true;
    try {
      if (/form\.naver\.com/i.test(new URL(page.url()).hostname)) return true;
    } catch {
      /* ignore */
    }
    return page.evaluate(() => {
      return Boolean(
        document.querySelector(
          '[class*="naver_form"], .questionnaire, .question_area, #content.questionnaire',
        ) || /네이버\s*폼|NAVER\s*Form/i.test(document.title),
      );
    });
  },

  async waitForReady(page: Page): Promise<void> {
    await waitForNaverRendered(page);
  },

  async getCurrentPageState(page: Page): Promise<FormPageState> {
    return buildBasePageState(page, "naver_form");
  },

  async estimateExpectedPageCount(page: Page): Promise<number | null> {
    const state = await buildBasePageState(page, "naver_form");
    return state.totalPageHint;
  },

  async extractVisibleQuestions(page: Page): Promise<VisibleQuestion[]> {
    const contexts = await getSearchContexts(page);
    const all: VisibleQuestion[] = [];
    for (const ctx of contexts) {
      // extractQuestionsFromSelectors expects Page; Frame has evaluate too
      const part = await extractQuestionsFromSelectors(
        ctx as unknown as Page,
        NAVER_QUESTION_SELECTORS,
      ).catch(() => []);
      all.push(...part);
    }
    const seen = new Set<string>();
    return all.filter((q) => {
      const key = q.text.slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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

    const moved = await waitForFingerprintChange(page, before, 9_000);
    if (moved) {
      await waitForNaverRendered(page);
      return "moved";
    }
    const errors = await detectValidationErrors(page);
    return errors.length > 0 ? "blocked" : "blocked";
  },

  detectValidationErrors,
};
