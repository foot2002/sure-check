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
import { applyKoreanFontsToPage } from "@/lib/evidence/capture/koreanFonts";

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

async function waitForNaverRendered(page: Page): Promise<boolean> {
  const budgetMs = isServerlessCaptureRuntime() ? 20_000 : 10_000;
  const deadline = Date.now() + budgetMs;
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
        return true;
      }
    }
    await sleep(250);
  }
  return false;
}

async function naverPageHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const titles = Array.from(
      document.querySelectorAll(
        ".question_title, .question_area .title, .questionnaire_item .title, [role='heading'], h2, h3",
      ),
    )
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 10);
    const pct =
      (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .match(/(\d{1,3})\s*%/)?.[1] || "";
    const step =
      (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .match(/(?:페이지|page)\s*(\d+)\s*(?:\/|of|중)\s*(\d+)/i)?.[0] || "";
    return `${pct}::${step}::${titles.join("|")}`;
  });
}

async function readNaverPercent(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const match = text.match(/(\d{1,3})\s*%/);
    if (!match) return null;
    const pct = Number(match[1]);
    return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : null;
  });
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
    const ok = await waitForNaverRendered(page);
    if (!ok) {
      await sleep(300);
    }
    // Deferred from goto — inject once after the shell is present.
    await applyKoreanFontsToPage(page).catch(() => undefined);
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
    await waitForNaverRendered(page);
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
    const beforeHash = await naverPageHash(page);
    const beforePct = await readNaverPercent(page);
    const next = await findNextControl(page);
    const submit = await findSubmitControl(page);

    if (!next && submit) {
      await submit.dispose().catch(() => undefined);
      return "submit_gate";
    }
    if (submit) await submit.dispose().catch(() => undefined);

    const clicked = await clickMarkedOrHandle(page, next);
    if (!clicked) return "none";

    const deadline = Date.now() + (isServerlessCaptureRuntime() ? 12_000 : 9_000);
    while (Date.now() < deadline) {
      await sleep(280);
      try {
        const nowPct = await readNaverPercent(page);
        if (beforePct !== null && nowPct !== null && nowPct > beforePct) {
          await waitForNaverRendered(page);
          return "moved";
        }
        const nowHash = await naverPageHash(page);
        const nowFp = await readBodyFingerprint(page);
        if (nowHash !== beforeHash || nowFp !== before) {
          await waitForNaverRendered(page);
          return "moved";
        }
      } catch {
        await sleep(400);
        const rendered = await waitForNaverRendered(page);
        if (rendered) return "moved";
      }
    }

    const moved = await waitForFingerprintChange(page, before, 1_000);
    if (moved) {
      await waitForNaverRendered(page);
      return "moved";
    }
    return "blocked";
  },

  detectValidationErrors,
};
