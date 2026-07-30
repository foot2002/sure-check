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
import { isServerlessCaptureRuntime } from "@/lib/evidence/capture/captureConfig";
import { applyKoreanFontFaceToEvidencePage } from "@/lib/evidence/capture/koreanFonts";

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
  const budgetMs = isServerlessCaptureRuntime() ? 20_000 : 10_000;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const contexts = await getSearchContexts(page);
    for (const ctx of contexts) {
      const ready = await ctx
        .evaluate(() => {
          const loading = Array.from(
            document.querySelectorAll(
              '[class*="skeleton"], [class*="loading"]',
            ),
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
          const hasAnswerButton = Boolean(
            document.querySelector(
              "button.AnswerButton, button[class*='AnswerButton']",
            ),
          );
          const hasButton = Array.from(
            document.querySelectorAll(
              "button, [role='button'], a.AnswerButton",
            ),
          ).some((el) => {
            const t = ((el as HTMLElement).innerText || "").trim();
            return t.length > 0;
          });
          return questionText.length >= 1 && (hasAnswerButton || hasButton);
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
      document.querySelectorAll(
        "button.AnswerButton, button[class*='AnswerButton'], button, [role='button']",
      ),
    )
      .map((el) => {
        const html = el as HTMLElement;
        return `${html.className}:${(html.innerText || html.getAttribute("aria-label") || "").trim()}`;
      })
      .filter(Boolean)
      .slice(0, 8)
      .join("|");
    return `${pct}::${texts.join("|")}::${buttons}`;
  });
}

/**
 * Moaform primary CTA is often an icon-only `button.AnswerButton` (no "다음" text).
 * Label-based findNextControl misses it on serverless screenshots.
 */
async function findMoaAnswerNextButton(
  page: Page,
): Promise<ElementHandle<Element> | null> {
  const contexts = await getSearchContexts(page);
  for (const ctx of contexts) {
    const marked = await ctx
      .evaluate(() => {
        document
          .querySelectorAll("[data-sure-btn-pick]")
          .forEach((el) => el.removeAttribute("data-sure-btn-pick"));

        const buttons = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button.AnswerButton, button.AnswerButton--shape, button.AnswerButton--area, button[class*='AnswerButton']",
          ),
        );
        const scored: Array<{ el: HTMLElement; score: number }> = [];
        for (const el of buttons) {
          const label = (
            el.innerText ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();
          const cls = String(el.className || "");
          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
          ) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;

          if (/이전|뒤로|back|prev/i.test(label)) continue;
          if (/더보기|메뉴|menu|more/i.test(label)) continue;
          if (/^(\.\.\.|···|⋯)$/.test(label)) continue;
          if (
            /제출|보내기|완료|submit|finish|done/i.test(label) &&
            !/다음|계속|next/i.test(label)
          ) {
            continue;
          }

          const disabled =
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            cls.includes("disabled") ||
            cls.includes("is-disabled");

          let score = 10;
          if (
            /^(다음|계속|시작하기|시작|참여하기|next|continue|start)$/i.test(
              label,
            )
          ) {
            score += 100;
          } else if (/다음|계속|시작|next|continue|start/i.test(label)) {
            score += 55;
          } else if (!label || label.length <= 2) {
            // Icon-only forward CTA — prefer larger / righter buttons.
            score += 25;
            score += Math.min(35, Math.floor(rect.left / 40));
            if (rect.width >= 56) score += 20;
            if (rect.width >= 90) score += 10;
          } else {
            // Unknown text on AnswerButton — weak candidate
            score += 5;
          }

          if (/AnswerButton--area|AnswerButton--shape/i.test(cls)) score += 8;
          if (disabled) score -= 40;
          else score += 12;

          scored.push({ el, score });
        }

        scored.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (
            b.el.getBoundingClientRect().left - a.el.getBoundingClientRect().left
          );
        });
        if (!scored[0] || scored[0].score < 20) return false;
        scored[0].el.setAttribute("data-sure-btn-pick", "1");
        return true;
      })
      .catch(() => false);

    if (!marked) continue;
    const handle = await ctx.$("[data-sure-btn-pick='1']");
    if (handle) {
      await ctx
        .evaluate(() => {
          document
            .querySelectorAll("[data-sure-btn-pick]")
            .forEach((el) => el.removeAttribute("data-sure-btn-pick"));
        })
        .catch(() => undefined);
      return handle;
    }
  }
  return null;
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
      await sleep(300);
    }
    if (isServerlessCaptureRuntime()) {
      await applyKoreanFontFaceToEvidencePage(page).catch(() => false);
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
    if (isServerlessCaptureRuntime()) {
      await applyKoreanFontFaceToEvidencePage(page).catch(() => false);
    }
    return captureFullPage(page, pageNumber, "evidence_full_walkthrough");
  },

  async fillRequiredFieldsForNavigation(
    page: Page,
  ): Promise<TemporaryAnswerResult> {
    return fillTemporaryAnswers(page);
  },

  async findNextButton(page: Page): Promise<ElementHandle<Element> | null> {
    return (
      (await findMoaAnswerNextButton(page)) || (await findNextControl(page))
    );
  },

  async findSubmitButton(page: Page): Promise<ElementHandle<Element> | null> {
    return findSubmitControl(page);
  },

  async clickNext(page: Page): Promise<PageTransitionResult> {
    const beforeFp = await readBodyFingerprint(page);
    const beforeHash = await moaQuestionHash(page);
    const next =
      (await findMoaAnswerNextButton(page)) || (await findNextControl(page));
    const submit = await findSubmitControl(page);

    if (!next && submit) {
      await submit.dispose().catch(() => undefined);
      return "submit_gate";
    }
    if (submit) await submit.dispose().catch(() => undefined);

    const clicked = await clickMarkedOrHandle(page, next);
    if (!clicked) {
      // Last resort: click rightmost enabled AnswerButton via DOM.
      const forced = await page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button.AnswerButton, button[class*='AnswerButton']",
          ),
        ).filter((el) => {
          const label = (
            el.innerText ||
            el.getAttribute("aria-label") ||
            ""
          ).trim();
          if (/이전|뒤로|back|prev|제출|완료|submit/i.test(label)) return false;
          if (el.hasAttribute("disabled")) return false;
          const rect = el.getBoundingClientRect();
          return rect.width >= 8 && rect.height >= 8;
        });
        buttons.sort(
          (a, b) =>
            b.getBoundingClientRect().left - a.getBoundingClientRect().left,
        );
        const target = buttons[0];
        if (!target) return false;
        target.scrollIntoView({ block: "center", inline: "nearest" });
        target.click();
        return true;
      });
      if (!forced) return "none";
    }

    const deadline = Date.now() + (isServerlessCaptureRuntime() ? 14_000 : 10_000);
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
