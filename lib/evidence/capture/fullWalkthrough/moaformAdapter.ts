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
  const budgetMs = isServerlessCaptureRuntime() ? 12_000 : 10_000;
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
 * By default skips disabled controls (consent pages keep Next disabled until a choice is selected).
 * Pass allowDisabled for discovery-only (orchestrator needs to know Next exists before fill).
 */
async function findMoaAnswerNextButton(
  page: Page,
  allowDisabled = false,
): Promise<ElementHandle<Element> | null> {
  const contexts = await getSearchContexts(page);
  for (const ctx of contexts) {
    const marked = await ctx
      .evaluate((includeDisabled) => {
        document
          .querySelectorAll("[data-sure-btn-pick]")
          .forEach((el) => el.removeAttribute("data-sure-btn-pick"));

        const isDisabled = (el: HTMLElement) => {
          const cls = String(el.className || "");
          return (
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.getAttribute("data-disabled") === "true" ||
            /(?:^|\s)(?:is-)?disabled(?:\s|$)/i.test(cls) ||
            Boolean((el as HTMLButtonElement).disabled)
          );
        };

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
            style.opacity === "0" ||
            style.pointerEvents === "none"
          ) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;
          const disabled = isDisabled(el);
          if (disabled && !includeDisabled) continue;

          if (/이전|뒤로|back|prev/i.test(label)) continue;
          if (/더보기|메뉴|menu|more/i.test(label)) continue;
          if (/^(\.\.\.|···|⋯)$/.test(label)) continue;
          if (
            /제출|보내기|완료|submit|finish|done/i.test(label) &&
            !/다음|계속|next/i.test(label)
          ) {
            continue;
          }

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
          if (disabled) score -= 50;
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
      }, allowDisabled)
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

async function readMoaPercent(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const match = text.match(/(\d{1,3})\s*%/);
    if (!match) return null;
    const pct = Number(match[1]);
    return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : null;
  });
}

/**
 * Moaform consent / choice UIs often need a real pointer sequence and prefer "동의함".
 * Generic filler can mark the wrong node or leave Next disabled on serverless Chromium.
 */
async function fillMoaformChoices(page: Page): Promise<TemporaryAnswerResult> {
  const base = await fillTemporaryAnswers(page);

  const moa = await page.evaluate(() => {
    const fire = (el: HTMLElement) => {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      const opts: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      el.click();
    };

    const isVisible = (el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        rect.width > 4 &&
        rect.height > 4 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    };

    const preferRe =
      /동의함|동의합니다|예\b|네\b|참석|가능|있다|합니다|남성|여성|해당/;
    const avoidRe = /동의하지\s*않|아니오|아니요|없다|불가|거절|해당\s*없음/;

    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "li.select-one-and-many, li.wf-style-mutiplechoice, li[class*='choice'], [role='radio'], label, .option_item, .wf-pv-question-choice-wrapper li, .js-question li",
      ),
    ).filter(isVisible);

    const groups = new Map<Element, HTMLElement[]>();
    for (const node of nodes) {
      const group =
        node.closest("ul") ||
        node.closest(".js-question") ||
        node.closest(".wf-pv-question-choice-wrapper") ||
        node.closest('[role="radiogroup"]') ||
        node.closest('[role="list"]') ||
        node.parentElement;
      if (!group) continue;
      const list = groups.get(group) ?? [];
      list.push(node);
      groups.set(group, list);
    }

    let clicked = 0;
    for (const [, options] of groups) {
      if (options.length === 0) continue;
      const already = options.some((o) => {
        const cls = String(o.className || "");
        return (
          o.getAttribute("aria-checked") === "true" ||
          (o as HTMLInputElement).checked === true ||
          /(?:^|\s)(selected|active|checked|is-selected|is-checked)(?:\s|$)/i.test(
            cls,
          )
        );
      });
      if (already) continue;

      const preferred = options.find((o) => {
        const t = (o.innerText || o.textContent || "").replace(/\s+/g, " ").trim();
        return preferRe.test(t) && !avoidRe.test(t);
      });
      const fallback = options.find((o) => {
        const t = (o.innerText || o.textContent || "").replace(/\s+/g, " ").trim();
        return !avoidRe.test(t);
      });
      const pick = preferred || fallback || options[0];
      if (!pick) continue;
      fire(pick);
      const inner =
        pick.querySelector<HTMLElement>(
          "input, [role='radio'], button, .radio, .check",
        ) || null;
      if (inner && inner !== pick) fire(inner);
      clicked += 1;
    }
    return clicked;
  });

  await sleep(350);

  const types = new Set(base.types);
  if (moa > 0) types.add("radio");
  return {
    filled: base.filled + moa,
    types: [...types],
  };
}

async function waitForEnabledMoaNext(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const next = await findMoaAnswerNextButton(page);
    if (next) {
      await next.dispose().catch(() => undefined);
      return true;
    }
    const labeled = await findNextControl(page);
    if (labeled) {
      const enabled = await labeled
        .evaluate((el) => {
          const html = el as HTMLElement;
          const cls = String(html.className || "");
          return !(
            html.hasAttribute("disabled") ||
            html.getAttribute("aria-disabled") === "true" ||
            /(?:^|\s)(?:is-)?disabled(?:\s|$)/i.test(cls)
          );
        })
        .catch(() => false);
      await labeled.dispose().catch(() => undefined);
      if (enabled) return true;
    }
    await sleep(220);
  }
  return false;
}

async function clickMoaNextHandle(
  page: Page,
  handle: ElementHandle<Element>,
): Promise<boolean> {
  try {
    const box = await handle.boundingBox();
    if (box && box.width > 2 && box.height > 2) {
      await page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height / 2,
        { delay: 25 },
      );
      await handle.dispose().catch(() => undefined);
      return true;
    }
  } catch {
    /* fall through */
  }
  return clickMarkedOrHandle(page, handle);
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
    return fillMoaformChoices(page);
  },

  async findNextButton(page: Page): Promise<ElementHandle<Element> | null> {
    // Discovery may include disabled Next so orchestrator still fills then clicks.
    return (
      (await findMoaAnswerNextButton(page, true)) ||
      (await findNextControl(page))
    );
  },

  async findSubmitButton(page: Page): Promise<ElementHandle<Element> | null> {
    return findSubmitControl(page);
  },

  async clickNext(page: Page): Promise<PageTransitionResult> {
    // Consent pages keep Next disabled until a choice sticks — wait briefly.
    const enabled = await waitForEnabledMoaNext(
      page,
      isServerlessCaptureRuntime() ? 5_000 : 2_500,
    );
    if (!enabled) {
      await fillMoaformChoices(page);
      await waitForEnabledMoaNext(
        page,
        isServerlessCaptureRuntime() ? 6_000 : 3_000,
      );
    }

    const beforeFp = await readBodyFingerprint(page);
    const beforeHash = await moaQuestionHash(page);
    const beforePct = await readMoaPercent(page);
    // Click path: enabled controls only.
    let next = await findMoaAnswerNextButton(page, false);
    if (!next) {
      const labeled = await findNextControl(page);
      if (labeled) {
        const ok = await labeled
          .evaluate((el) => {
            const html = el as HTMLElement;
            const cls = String(html.className || "");
            return !(
              html.hasAttribute("disabled") ||
              html.getAttribute("aria-disabled") === "true" ||
              /(?:^|\s)(?:is-)?disabled(?:\s|$)/i.test(cls) ||
              Boolean((html as HTMLButtonElement).disabled)
            );
          })
          .catch(() => false);
        if (ok) next = labeled;
        else await labeled.dispose().catch(() => undefined);
      }
    }
    const submit = await findSubmitControl(page);

    if (!next && submit) {
      await submit.dispose().catch(() => undefined);
      return "submit_gate";
    }
    if (submit) await submit.dispose().catch(() => undefined);

    let clicked = false;
    if (next) {
      clicked = await clickMoaNextHandle(page, next);
      next = null;
    }
    if (!clicked) {
      // Last resort: click rightmost enabled AnswerButton via DOM.
      const forced = await page.evaluate(() => {
        const isDisabled = (el: HTMLElement) => {
          const cls = String(el.className || "");
          return (
            el.hasAttribute("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            el.getAttribute("data-disabled") === "true" ||
            /(?:^|\s)(?:is-)?disabled(?:\s|$)/i.test(cls) ||
            Boolean((el as HTMLButtonElement).disabled)
          );
        };
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
          if (isDisabled(el)) return false;
          const style = window.getComputedStyle(el);
          if (style.pointerEvents === "none") return false;
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
        const rect = target.getBoundingClientRect();
        const opts: MouseEventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        };
        target.dispatchEvent(new PointerEvent("pointerdown", opts));
        target.dispatchEvent(new MouseEvent("mousedown", opts));
        target.dispatchEvent(new PointerEvent("pointerup", opts));
        target.dispatchEvent(new MouseEvent("mouseup", opts));
        target.click();
        return true;
      });
      if (!forced) return "blocked";
    }

    const deadline = Date.now() + (isServerlessCaptureRuntime() ? 14_000 : 10_000);
    while (Date.now() < deadline) {
      await sleep(280);
      try {
        const nowPct = await readMoaPercent(page);
        if (
          beforePct !== null &&
          nowPct !== null &&
          nowPct > beforePct
        ) {
          return "moved";
        }
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
    return "blocked";
  },

  detectValidationErrors,
};
