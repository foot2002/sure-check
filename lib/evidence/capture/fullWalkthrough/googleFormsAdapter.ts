import type { ElementHandle, Page } from "puppeteer-core";
import type { FormCaptureAdapter } from "@/lib/evidence/capture/fullWalkthrough/FormCaptureAdapter";
import {
  buildBasePageState,
  clickMarkedOrHandle,
  detectValidationErrors,
  extractQuestionsFromSelectors,
  findNextControl,
  findSubmitControl,
  sleep,
  waitForFingerprintChange,
  readBodyFingerprint,
} from "@/lib/evidence/capture/fullWalkthrough/adapterUtils";
import { isServerlessCaptureRuntime } from "@/lib/evidence/capture/captureConfig";
import { fillTemporaryAnswers } from "@/lib/evidence/capture/fullWalkthrough/responseFiller";
import { captureFullPage } from "@/lib/evidence/capture/screenshotCapture";
import type {
  FormPageState,
  PageTransitionResult,
  TemporaryAnswerResult,
  VisibleQuestion,
} from "@/lib/evidence/capture/fullWalkthrough/pageState";
import type { CaptureScreenshot } from "@/lib/evidence/capture/captureTypes";

const GOOGLE_QUESTION_SELECTORS = [
  ".freebirdFormviewerComponentsQuestionBaseTitle",
  '[role="heading"]',
  ".M7eMe",
  ".Qr7Oae [role='heading']",
];

/** Stable Google Forms viewer jsnames (locale-independent). */
const GOOGLE_NEXT_JSNAME = "OCpkoe";
const GOOGLE_SUBMIT_JSNAME = "M2UYVd";

async function findGoogleJsnameButton(
  page: Page,
  jsname: string,
): Promise<ElementHandle<Element> | null> {
  const handle = await page.$(`[jsname="${jsname}"]`);
  if (handle) return handle;
  // Nested mark: some themes wrap the actionable node.
  const nested = await page.$(`[jsname="${jsname}"] [role="button"]`);
  return nested;
}

async function clickGoogleJsname(page: Page, jsname: string): Promise<boolean> {
  return page.evaluate((name) => {
    const root = document.querySelector<HTMLElement>(`[jsname="${name}"]`);
    if (!root) return false;
    const target =
      root.matches('[role="button"], button, a') || root.tabIndex >= 0
        ? root
        : root.querySelector<HTMLElement>('[role="button"], button, a') || root;
    target.scrollIntoView({ block: "center", inline: "nearest" });
    target.click();
    return true;
  }, jsname);
}

async function fillGoogleSpecific(page: Page): Promise<number> {
  return page.evaluate(() => {
    let filled = 0;

    // Linear scale / rating radios already handled; ensure listitem required radios
    for (const item of Array.from(
      document.querySelectorAll<HTMLElement>('[role="listitem"]'),
    )) {
      const radios = Array.from(
        item.querySelectorAll<HTMLElement>('[role="radio"]'),
      );
      if (radios.length === 0) continue;
      if (item.querySelector('[role="radio"][aria-checked="true"]')) continue;
      const mid = radios[Math.floor(radios.length / 2)] || radios[0];
      if (mid) {
        mid.click();
        filled += 1;
      }

      const boxes = Array.from(
        item.querySelectorAll<HTMLElement>(
          '[role="checkbox"], input[type="checkbox"]',
        ),
      );
      if (boxes.length >= 2) {
        const checked = boxes.some(
          (b) =>
            b.getAttribute("aria-checked") === "true" ||
            (b as HTMLInputElement).checked,
        );
        if (!checked) {
          boxes[0].click();
          filled += 1;
        }
      }
    }

    // Grid / matrix: each row radiogroup
    for (const group of Array.from(
      document.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
    )) {
      if (group.querySelector('[role="radio"][aria-checked="true"]')) continue;
      const options = Array.from(
        group.querySelectorAll<HTMLElement>('[role="radio"]'),
      );
      if (options[0]) {
        options[0].click();
        filled += 1;
      }
    }

    // Google listbox / dropdown
    for (const box of Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="listbox"], [role="combobox"], .vHL91c',
      ),
    )) {
      const text = (box.textContent || "").replace(/\s+/g, " ").trim();
      if (text && !/선택|choose|select/i.test(text)) continue;
      box.click();
      filled += 1;
    }

    // "기타" follow-up inputs
    for (const input of Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input[type="text"]:not(:disabled), textarea:not(:disabled)',
      ),
    )) {
      if (input.value?.trim()) continue;
      const ctx = (
        input.closest('[role="listitem"]')?.textContent || ""
      ).slice(0, 120);
      if (/기타|other/i.test(ctx) || input.getAttribute("aria-label")?.match(/기타|other/i)) {
        input.focus();
        input.value = "증빙용 임시값";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
      }
    }

    return filled;
  });
}

async function pickGoogleDropdownOptions(page: Page): Promise<number> {
  await sleep(200);
  return page.evaluate(() => {
    let picked = 0;
    const options = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="option"], .exportOption, .MocG8c',
      ),
    );
    for (const opt of options) {
      const text = (opt.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || /선택|choose|select/i.test(text)) continue;
      opt.click();
      picked += 1;
      break;
    }
    return picked;
  });
}

export const googleFormsAdapter: FormCaptureAdapter = {
  provider: "google_forms",

  async detect(url: string, page: Page): Promise<boolean> {
    if (/docs\.google\.com\/forms|forms\.gle/i.test(url)) return true;
    const host = (() => {
      try {
        return new URL(page.url()).hostname;
      } catch {
        return "";
      }
    })();
    if (/docs\.google\.com|forms\.gle/i.test(host)) return true;
    return page.evaluate(() => {
      return Boolean(
        document.querySelector(
          ".freebirdFormviewerViewFormCard, .freebirdFormviewerViewFormContent, form[action*='formResponse']",
        ),
      );
    });
  },

  async waitForReady(page: Page): Promise<void> {
    await page
      .waitForSelector(
        ".freebirdFormviewerViewFormCard, .freebirdFormviewerViewFormContent, [role='listitem'], .Qr7Oae, [jsname='OCpkoe'], [jsname='M2UYVd']",
        { timeout: 15_000 },
      )
      .catch(() => undefined);

    // Shell cards + "1/N페이지" SSR text appear before the client viewer hydrates.
    // Serverless Chromium must wait for jsname nav (locale-safe) or interactive fields.
    const budgetMs = isServerlessCaptureRuntime() ? 35_000 : 12_000;
    const deadline = Date.now() + budgetMs;
    let hydrated = false;
    while (Date.now() < deadline) {
      const state = await page
        .evaluate((nextName, submitName) => {
          const hasJsNav = Boolean(
            document.querySelector(`[jsname="${nextName}"], [jsname="${submitName}"]`),
          );
          const interactive = document.querySelector(
            '[role="radio"], [role="checkbox"], input:not([type="hidden"]), textarea, [role="listbox"], [role="combobox"]',
          );
          const titleEls = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".freebirdFormviewerComponentsQuestionBaseTitle, .M7eMe",
            ),
          );
          let visibleTitles = 0;
          for (const el of titleEls) {
            const text = (el.innerText || "").replace(/\s+/g, " ").trim();
            const rect = el.getBoundingClientRect();
            if (text.length >= 2 && rect.width > 2 && rect.height > 2) {
              visibleTitles += 1;
            }
          }
          const bodyLen = (document.body?.innerText || "").replace(/\s+/g, " ")
            .trim().length;
          return {
            hasJsNav,
            hasInteractive: Boolean(interactive),
            visibleTitles,
            bodyLen,
          };
        }, GOOGLE_NEXT_JSNAME, GOOGLE_SUBMIT_JSNAME)
        .catch(() => ({
          hasJsNav: false,
          hasInteractive: false,
          visibleTitles: 0,
          bodyLen: 0,
        }));

      if (
        state.hasJsNav ||
        (state.hasInteractive && state.visibleTitles >= 1) ||
        state.visibleTitles >= 2
      ) {
        hydrated = true;
        break;
      }
      await sleep(400);
    }

    if (!hydrated && isServerlessCaptureRuntime()) {
      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 20_000 })
        .catch(() => undefined);
      await page
        .waitForNetworkIdle({ idleTime: 600, timeout: 12_000 })
        .catch(() => undefined);
      const retryDeadline = Date.now() + 15_000;
      while (Date.now() < retryDeadline) {
        const ready = await page
          .evaluate(
            (nextName, submitName) =>
              Boolean(
                document.querySelector(
                  `[jsname="${nextName}"], [jsname="${submitName}"], [role="radio"], [role="checkbox"], textarea`,
                ),
              ),
            GOOGLE_NEXT_JSNAME,
            GOOGLE_SUBMIT_JSNAME,
          )
          .catch(() => false);
        if (ready) {
          hydrated = true;
          break;
        }
        await sleep(400);
      }
    }

    await sleep(isServerlessCaptureRuntime() ? 900 : 400);
  },

  async getCurrentPageState(page: Page): Promise<FormPageState> {
    return buildBasePageState(page, "google_forms");
  },

  async estimateExpectedPageCount(page: Page): Promise<number | null> {
    const fromDom = await page.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ");
      const patterns = [
        /(?:페이지|page)\s*(\d+)\s*(?:\/|of|중)\s*(\d+)/i,
        /(\d+)\s*\/\s*(\d+)\s*(?:페이지|page)/i,
        /(\d+)\s*of\s*(\d+)/i,
      ];
      for (const re of patterns) {
        const m = text.match(re);
        if (!m) continue;
        const total = Number(m[2]);
        if (Number.isFinite(total) && total > 1 && total < 100) return total;
      }
      // Google Forms progressbar aria-valuemax is usually 100 (= percent scale),
      // not section count. Only trust non-100 maxima as section hints.
      const bar = document.querySelector('[role="progressbar"]');
      const max = Number(bar?.getAttribute("aria-valuemax"));
      if (Number.isFinite(max) && max > 1 && max < 100) return max;
      return null;
    });
    if (fromDom != null) return fromDom;
    const state = await buildBasePageState(page, "google_forms");
    if (state.totalPageHint != null && state.totalPageHint >= 100) {
      return null;
    }
    return state.totalPageHint;
  },

  async extractVisibleQuestions(page: Page): Promise<VisibleQuestion[]> {
    return extractQuestionsFromSelectors(page, GOOGLE_QUESTION_SELECTORS);
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
    const base = await fillTemporaryAnswers(page);
    const extra = await fillGoogleSpecific(page);
    const dd = await pickGoogleDropdownOptions(page);
    return {
      filled: base.filled + extra + dd,
      types: base.types,
    };
  },

  async findNextButton(page: Page): Promise<ElementHandle<Element> | null> {
    return (
      (await findNextControl(page)) ||
      (await findGoogleJsnameButton(page, GOOGLE_NEXT_JSNAME))
    );
  },

  async findSubmitButton(page: Page): Promise<ElementHandle<Element> | null> {
    return (
      (await findSubmitControl(page)) ||
      (await findGoogleJsnameButton(page, GOOGLE_SUBMIT_JSNAME))
    );
  },

  async clickNext(page: Page): Promise<PageTransitionResult> {
    let before = "";
    try {
      before = await readBodyFingerprint(page);
    } catch {
      before = page.url();
    }
    const submit = await googleFormsAdapter.findSubmitButton(page);
    const next = await googleFormsAdapter.findNextButton(page);

    // Prefer Next when both exist (multi-section forms)
    if (!next && submit) {
      await submit.dispose().catch(() => undefined);
      return "submit_gate";
    }
    if (submit) await submit.dispose().catch(() => undefined);

    let clicked = await clickMarkedOrHandle(page, next);
    if (!clicked) {
      clicked = await clickGoogleJsname(page, GOOGLE_NEXT_JSNAME);
    }
    if (!clicked) return "none";

    try {
      const moved = await waitForFingerprintChange(page, before, 9_000);
      if (moved) return "moved";

      const errors = await detectValidationErrors(page);
      if (errors.length > 0) return "blocked";

      const stillSame = (await readBodyFingerprint(page)) === before;
      return stillSame ? "blocked" : "moved";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (
        /Execution context was destroyed|Target closed|frame was detached/i.test(
          message,
        )
      ) {
        await sleep(600);
        return "moved";
      }
      throw error;
    }
  },

  detectValidationErrors,

  /** Explore alternate branch when first path hits premature submit. */
  async tryAlternateBranch(page: Page): Promise<boolean> {
    const wentBack = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>(
          'div[role="button"], button, span[role="button"]',
        ),
      );
      for (const el of buttons) {
        const label = (el.innerText || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim();
        if (/^(뒤로|이전|Back)$/i.test(label)) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!wentBack) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(
        () => undefined,
      );
    }
    await sleep(900);
    await googleFormsAdapter.waitForReady(page);

    // Clear selections and pick alternate (2nd) choices
    await page.evaluate(() => {
      for (const group of Array.from(
        document.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
      )) {
        const options = Array.from(
          group.querySelectorAll<HTMLElement>('[role="radio"]'),
        );
        if (options.length >= 2) options[1].click();
        else if (options[0]) options[0].click();
      }
    });

    await fillTemporaryAnswers(page, { preferAlternateChoice: true });
    await sleep(400);

    const next = await findNextControl(page);
    if (!next) return false;
    const before = await readBodyFingerprint(page).catch(() => page.url());
    const clicked = await clickMarkedOrHandle(page, next);
    if (!clicked) return false;
    await waitForFingerprintChange(page, before, 9_000).catch(() => true);
    await sleep(500);
    // If still on submit-only page, branch retry failed
    const submit = await findSubmitControl(page);
    const next2 = await findNextControl(page);
    if (submit && !next2) {
      await submit.dispose().catch(() => undefined);
      return false;
    }
    if (submit) await submit.dispose().catch(() => undefined);
    if (next2) await next2.dispose().catch(() => undefined);
    return true;
  },
};
