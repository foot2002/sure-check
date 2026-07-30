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
import { applyKoreanFontFaceToEvidencePage, applyKoreanFontsToPage } from "@/lib/evidence/capture/koreanFonts";

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
  const budgetMs = isServerlessCaptureRuntime() ? 12_000 : 10_000;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const contexts = await getSearchContexts(page);
    for (const ctx of contexts) {
          const ready = await ctx
            .evaluate(() => {
              const skeletons = Array.from(
                document.querySelectorAll(
                  '[class*="skeleton"], [class*="Skeleton"], [class*="placeholder"]',
                ),
              ).filter((el) => {
                const style = window.getComputedStyle(el as HTMLElement);
                const rect = (el as HTMLElement).getBoundingClientRect();
                return (
                  rect.width > 20 &&
                  rect.height > 8 &&
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  style.opacity !== "0"
                );
              });
              if (skeletons.length >= 3) return false;

              const text = (document.body?.innerText || "").trim();
              const hasQuestion = Boolean(
                document.querySelector(
                  ".question_area, .questionnaire_item, [class*='question'], input, textarea, select, [role='radio'], label",
                ),
              );
              const titleText = Array.from(
                document.querySelectorAll(
                  ".question_title, .question_area .title, .questionnaire_item .title, h2, h3",
                ),
              )
                .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
                .filter((t) => t.length > 4);
              const hasButton = Array.from(
                document.querySelectorAll("button, [role='button'], a"),
              ).some((el) => {
                const t = ((el as HTMLElement).innerText || "").trim();
                const cls = String((el as HTMLElement).className || "");
                return (
                  /다음|계속|제출|응답|완료|시작/i.test(t) ||
                  /btn_|submit|Submit|Button/i.test(cls)
                );
              });
              return (
                text.length > 40 &&
                hasQuestion &&
                (titleText.length >= 1 || hasButton)
              );
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

async function findNaverPrimaryCta(
  page: Page,
  kind: "next" | "submit",
): Promise<ElementHandle<Element> | null> {
  const contexts = await getSearchContexts(page);
  for (const ctx of contexts) {
    const marked = await ctx
      .evaluate((want) => {
        document
          .querySelectorAll("[data-sure-naver-cta]")
          .forEach((el) => el.removeAttribute("data-sure-naver-cta"));

        const isDisabled = (el: HTMLElement) => {
          const cls = String(el.className || "");
          return (
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            /(?:^|\s)(?:is-)?disabled(?:\s|$)/i.test(cls) ||
            Boolean((el as HTMLButtonElement).disabled)
          );
        };

        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button, a, [role='button'], input[type='button'], input[type='submit'], .btn, [class*='btn_'], [class*='Button'], [class*='submit'], [class*='Submit']",
          ),
        );

        const scored: Array<{ el: HTMLElement; score: number }> = [];
        for (const el of candidates) {
          const label = (
            el.innerText ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            (el as HTMLInputElement).value ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim();
          const cls = String(el.className || "");
          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0" ||
            style.pointerEvents === "none"
          ) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 18) continue;
          if (isDisabled(el) && want === "next") continue;
          if (/이전|뒤로|back|prev|로그인|login/i.test(label)) continue;
          if (/^(\.\.\.|···|⋯)$/.test(label)) continue;

          const looksSubmit =
            /제출|보내기|완료|응답하기|작성\s*완료|submit|send|finish|done/i.test(
              label,
            ) || /submit|Submit|btn_submit|btnSubmit/i.test(cls);
          const looksNext =
            /다음|계속|시작|참여|next|continue|start/i.test(label) ||
            /btn_next|btnNext|next/i.test(cls);

          let score = 0;
          if (want === "submit") {
            if (looksSubmit) score += 100;
            else if (!label && rect.top > window.innerHeight * 0.45) score += 45;
            else if (
              !looksNext &&
              /btn_|Button|primary|confirm/i.test(cls) &&
              rect.top > window.innerHeight * 0.4
            ) {
              score += 30;
            } else continue;
          } else {
            // Next: require an explicit next label/class — unlabeled bottom
            // CTAs on single-page Naver forms are almost always Submit.
            if (looksSubmit) continue;
            if (looksNext) score += 100;
            else continue;
          }

          if (/submit|Submit|btn_submit|primary|confirm/i.test(cls)) score += 20;
          if (!label || label.length <= 2) {
            // Icon / tofu label — prefer lower, wider CTAs.
            score += Math.min(40, Math.floor(rect.top / 80));
            if (rect.width >= 80) score += 10;
          }
          if (!isDisabled(el)) score += 10;

          scored.push({ el, score });
        }

        scored.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (
            b.el.getBoundingClientRect().top - a.el.getBoundingClientRect().top
          );
        });
        if (!scored[0] || scored[0].score < 25) return false;
        scored[0].el.setAttribute("data-sure-naver-cta", "1");
        return true;
      }, kind)
      .catch(() => false);

    if (!marked) continue;
    const handle = await ctx.$("[data-sure-naver-cta='1']");
    if (handle) {
      await ctx
        .evaluate(() => {
          document
            .querySelectorAll("[data-sure-naver-cta]")
            .forEach((el) => el.removeAttribute("data-sure-naver-cta"));
        })
        .catch(() => undefined);
      return handle;
    }
  }
  return null;
}

async function enhanceNaverTextVisibility(page: Page): Promise<void> {
  if (isServerlessCaptureRuntime()) {
    await applyKoreanFontFaceToEvidencePage(page).catch(() => false);
  }
  await page
    .evaluate(() => {
      const style = document.createElement("style");
      style.setAttribute("data-sure-naver-text", "1");
      style.textContent = `
        #content, .questionnaire, .question_area, .questionnaire_item,
        .question_title, label, p, span, li, h1, h2, h3, button, a, input, textarea {
          color: #111 !important;
          -webkit-text-fill-color: #111 !important;
          opacity: 1 !important;
          visibility: visible !important;
          font-family: 'SURECheckKR','Noto Sans KR','Malgun Gothic',sans-serif !important;
        }
        [class*="skeleton"], [class*="Skeleton"] {
          display: none !important;
        }
      `;
      document
        .querySelectorAll("[data-sure-naver-text]")
        .forEach((n) => n.remove());
      document.documentElement.appendChild(style);
      try {
        void document.fonts.load('400 16px "SURECheckKR"');
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
  await sleep(200);
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
    await enhanceNaverTextVisibility(page);
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
    await enhanceNaverTextVisibility(page);
    return captureFullPage(page, pageNumber, "evidence_full_walkthrough");
  },

  async fillRequiredFieldsForNavigation(
    page: Page,
  ): Promise<TemporaryAnswerResult> {
    return fillTemporaryAnswers(page);
  },

  async findNextButton(page: Page): Promise<ElementHandle<Element> | null> {
    return (
      (await findNextControl(page)) || (await findNaverPrimaryCta(page, "next"))
    );
  },

  async findSubmitButton(page: Page): Promise<ElementHandle<Element> | null> {
    return (
      (await findSubmitControl(page)) ||
      (await findNaverPrimaryCta(page, "submit"))
    );
  },

  async clickNext(page: Page): Promise<PageTransitionResult> {
    const before = await readBodyFingerprint(page);
    const beforeHash = await naverPageHash(page);
    const beforePct = await readNaverPercent(page);
    const next =
      (await findNextControl(page)) || (await findNaverPrimaryCta(page, "next"));
    const submit =
      (await findSubmitControl(page)) ||
      (await findNaverPrimaryCta(page, "submit"));

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
