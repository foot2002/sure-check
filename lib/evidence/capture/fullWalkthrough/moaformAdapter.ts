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

const MOA_QUESTION_SELECTORS = [
  ".js-question strong",
  ".js-question p",
  ".wf-pv-question-choice-wrapper strong",
  ".js-question .title",
  '[class*="question"] strong',
  '[role="heading"]',
  "h1",
  "h2",
  "h3",
];

async function waitForMoaformRendered(page: Page): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const contexts = await getSearchContexts(page);
    for (const ctx of contexts) {
      const ready = await ctx
        .evaluate(() => {
          const loading = Array.from(
            document.querySelectorAll('[class*="skeleton"], [class*="loading"]'),
          ).some((el) => {
            const style = window.getComputedStyle(el as HTMLElement);
            return style.display !== "none" && style.visibility !== "hidden";
          });
          if (loading) return false;
          const questionText = Array.from(
            document.querySelectorAll(
              ".js-question, .wf-pv-question-choice-wrapper, [role='heading'], h1, h2, h3, strong",
            ),
          )
            .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
            .filter((t) => t.length > 2);
          const hasButton = Array.from(
            document.querySelectorAll("button, [role='button'], a.AnswerButton"),
          ).some((el) => {
            const t = ((el as HTMLElement).innerText || "").trim();
            return t.length > 0;
          });
          return questionText.length >= 1 && hasButton;
        })
        .catch(() => false);
      if (ready) {
        await sleep(350);
        return true;
      }
    }
    await sleep(250);
  }
  return false;
}

async function moaQuestionHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const texts = Array.from(
      document.querySelectorAll(
        ".js-question strong, .js-question p, .wf-pv-question-choice-wrapper strong, [role='heading'], h1, h2, h3",
      ),
    )
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 12);
    const pct =
      (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .match(/(\d{1,3})\s*%/)?.[1] || "";
    const buttons = Array.from(
      document.querySelectorAll("button, [role='button']"),
    )
      .map((el) => ((el as HTMLElement).innerText || "").trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("|");
    return `${pct}::${texts.join("|")}::${buttons}`;
  });
}

export const moaformAdapter: FormCaptureAdapter = {
  provider: "moaform",

  async detect(url: string, page: Page): Promise<boolean> {
    if (/moaform\.com|surveyl\.ink/i.test(url)) return true;
    try {
      const host = new URL(page.url()).hostname;
      if (/moaform\.com|surveyl\.ink/i.test(host)) return true;
    } catch {
      /* ignore */
    }
    return page.evaluate(() => {
      return Boolean(
        document.querySelector(
          "button.AnswerButton, .js-question, .wf-pv-question-choice-wrapper, li.select-one-and-many",
        ),
      );
    });
  },

  async waitForReady(page: Page): Promise<void> {
    const ok = await waitForMoaformRendered(page);
    if (!ok) {
      // Still proceed — orchestrator will record dynamic_render_timeout if empty
      await sleep(300);
    }
  },

  async getCurrentPageState(page: Page): Promise<FormPageState> {
    return buildBasePageState(page, "moaform");
  },

  async estimateExpectedPageCount(page: Page): Promise<number | null> {
    const state = await buildBasePageState(page, "moaform");
    return state.totalPageHint;
  },

  async extractVisibleQuestions(page: Page): Promise<VisibleQuestion[]> {
    return extractQuestionsFromSelectors(page, MOA_QUESTION_SELECTORS);
  },

  async captureCurrentPage(
    page: Page,
    pageNumber: number,
  ): Promise<CaptureScreenshot> {
    await waitForMoaformRendered(page);
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
    const beforeFp = await readBodyFingerprint(page);
    const beforeHash = await moaQuestionHash(page);
    const next = await findNextControl(page);
    const submit = await findSubmitControl(page);

    if (!next && submit) {
      await submit.dispose().catch(() => undefined);
      return "submit_gate";
    }
    if (submit) await submit.dispose().catch(() => undefined);

    const clicked = await clickMarkedOrHandle(page, next);
    if (!clicked) return "none";

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await sleep(280);
      try {
        const rendered = await waitForMoaformRendered(page);
        const nowHash = await moaQuestionHash(page);
        const nowFp = await readBodyFingerprint(page);
        if (rendered && (nowHash !== beforeHash || nowFp !== beforeFp)) {
          return "moved";
        }
      } catch {
        // context rebuild
        await sleep(400);
        const rendered = await waitForMoaformRendered(page);
        if (rendered) return "moved";
      }
    }

    const moved = await waitForFingerprintChange(page, beforeFp, 1_000);
    if (moved) return "moved";
    const errors = await detectValidationErrors(page);
    return errors.length > 0 ? "blocked" : "blocked";
  },

  detectValidationErrors,
};
