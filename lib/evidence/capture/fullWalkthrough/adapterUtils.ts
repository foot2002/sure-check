import type { ElementHandle, Page } from "puppeteer-core";
import {
  FORBIDDEN_NAV_LABEL,
  NEXT_LABEL,
  NEXT_LABEL_SOFT,
  SUBMIT_LABEL,
  SUBMIT_LABEL_SOFT,
  VALIDATION_ERROR,
} from "@/lib/evidence/capture/captureConfig";
import type { CaptureProvider } from "@/lib/evidence/capture/captureTypes";
import { classifyQuestionRisk } from "@/lib/evidence/capture/pageQuestionScan";
import type {
  FormPageState,
  VisibleQuestion,
} from "@/lib/evidence/capture/fullWalkthrough/pageState";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readBodyFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const headings = Array.from(
      document.querySelectorAll('[role="heading"], h1, h2, h3, strong'),
    )
      .map((h) => (h.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 8)
      .join("|");
    const body = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const pct =
      (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .match(/(\d{1,3})\s*%/)?.[1] || "";
    return `${location.href}::${pct}::${headings}::${body}`;
  });
}

export function parseProgressHints(text: string): {
  current: number | null;
  total: number | null;
  progressText: string | null;
} {
  const normalized = text.replace(/\s+/g, " ");
  const patterns = [
    /(?:페이지|page)\s*(\d+)\s*(?:\/|of|중)\s*(\d+)/i,
    /(\d+)\s*\/\s*(\d+)\s*(?:페이지|page)/i,
    /(\d+)\s*of\s*(\d+)/i,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (!m) continue;
    const current = Number(m[1]);
    const total = Number(m[2]);
    if (
      Number.isFinite(current) &&
      Number.isFinite(total) &&
      current > 0 &&
      total >= current
    ) {
      return {
        current,
        total,
        progressText: m[0],
      };
    }
  }
  const pct = normalized.match(/(\d{1,3})\s*%/);
  if (pct) {
    return {
      current: null,
      total: null,
      progressText: `${pct[1]}%`,
    };
  }
  return { current: null, total: null, progressText: null };
}

export async function extractQuestionsFromSelectors(
  page: Page,
  selectors: string[],
): Promise<VisibleQuestion[]> {
  const texts = await page.evaluate((sels) => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string) => {
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length < 2 || text.length > 200) return;
      if (
        /^(다음|이전|제출|보내기|시작하기|필수|선택|계속|완료)$/i.test(text)
      ) {
        return;
      }
      const key = text.slice(0, 100);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    };
    for (const sel of sels) {
      for (const node of Array.from(document.querySelectorAll(sel))) {
        push(node.textContent || "");
        if (out.length >= 50) break;
      }
      if (out.length >= 50) break;
    }
    return out;
  }, selectors);

  return texts.map((text) => {
    const risk = classifyQuestionRisk(text);
    return {
      text,
      riskCategory: risk,
      matchedKeyword: risk || undefined,
    };
  });
}

export async function findButtonByLabels(
  page: Page,
  opts: {
    exact: RegExp;
    soft: RegExp;
    forbidden: RegExp;
    preferEnabled?: boolean;
  },
): Promise<ElementHandle<Element> | null> {
  const marked = await page.evaluate(
    (exactSource, softSource, forbiddenSource, preferEnabled) => {
      const exact = new RegExp(exactSource, "i");
      const soft = new RegExp(softSource, "i");
      const forbidden = new RegExp(forbiddenSource, "i");
      document
        .querySelectorAll("[data-sure-btn-pick]")
        .forEach((el) => el.removeAttribute("data-sure-btn-pick"));

      const candidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], input[type="button"], input[type="submit"], div[role="button"], span[role="button"], li[role="button"]',
        ),
      );

      const scored: Array<{ el: HTMLElement; score: number }> = [];
      for (const el of candidates) {
        const htmlEl = el as HTMLElement;
        const label = (
          htmlEl.innerText ||
          htmlEl.getAttribute("aria-label") ||
          (htmlEl as HTMLInputElement).value ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (!label || label.length > 60) continue;
        if (forbidden.test(label)) continue;
        let score = 0;
        if (exact.test(label)) score += 100;
        else if (soft.test(label)) score += 40;
        else continue;

        const disabled =
          htmlEl.hasAttribute("disabled") ||
          htmlEl.getAttribute("aria-disabled") === "true" ||
          htmlEl.classList.contains("disabled");
        if (preferEnabled && disabled) score -= 30;
        if (!disabled) score += 10;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        scored.push({ el: htmlEl, score });
      }
      scored.sort((a, b) => b.score - a.score);
      if (scored[0]) {
        scored[0].el.setAttribute("data-sure-btn-pick", "1");
        return true;
      }
      return false;
    },
    opts.exact.source,
    opts.soft.source,
    opts.forbidden.source,
    opts.preferEnabled !== false,
  );

  if (!marked) return null;
  const handle = await page.$("[data-sure-btn-pick='1']");
  if (handle) {
    await page
      .evaluate(() => {
        document
          .querySelectorAll("[data-sure-btn-pick]")
          .forEach((el) => el.removeAttribute("data-sure-btn-pick"));
      })
      .catch(() => undefined);
  }
  return handle;
}

export async function findButtonByLabelsInContexts(
  page: Page,
  opts: {
    exact: RegExp;
    soft: RegExp;
    forbidden: RegExp;
    preferEnabled?: boolean;
  },
): Promise<ElementHandle<Element> | null> {
  const { getSearchContexts } = await import(
    "@/lib/evidence/capture/fullWalkthrough/captureTrace"
  );
  const contexts = await getSearchContexts(page);
  for (const ctx of contexts) {
    const marked = await ctx
      .evaluate(
        (exactSource, softSource, forbiddenSource, preferEnabled) => {
          const exact = new RegExp(exactSource, "i");
          const soft = new RegExp(softSource, "i");
          const forbidden = new RegExp(forbiddenSource, "i");
          document
            .querySelectorAll("[data-sure-btn-pick]")
            .forEach((el) => el.removeAttribute("data-sure-btn-pick"));

          const candidates = Array.from(
            document.querySelectorAll(
              'button, a, [role="button"], input[type="button"], input[type="submit"], div[role="button"], span[role="button"], li[role="button"]',
            ),
          );

          const scored: Array<{ el: HTMLElement; score: number }> = [];
          for (const el of candidates) {
            const htmlEl = el as HTMLElement;
            const label = (
              htmlEl.innerText ||
              htmlEl.getAttribute("aria-label") ||
              (htmlEl as HTMLInputElement).value ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim();
            if (!label || label.length > 60) continue;
            if (forbidden.test(label)) continue;
            let score = 0;
            if (exact.test(label)) score += 100;
            else if (soft.test(label)) score += 40;
            else continue;

            const disabled =
              htmlEl.hasAttribute("disabled") ||
              htmlEl.getAttribute("aria-disabled") === "true" ||
              htmlEl.classList.contains("disabled");
            if (preferEnabled && disabled) score -= 30;
            if (!disabled) score += 10;
            const rect = htmlEl.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            scored.push({ el: htmlEl, score });
          }
          scored.sort((a, b) => b.score - a.score);
          if (scored[0]) {
            scored[0].el.setAttribute("data-sure-btn-pick", "1");
            return true;
          }
          return false;
        },
        opts.exact.source,
        opts.soft.source,
        opts.forbidden.source,
        opts.preferEnabled !== false,
      )
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

export async function findNextControl(
  page: Page,
): Promise<ElementHandle<Element> | null> {
  return (
    (await findButtonByLabelsInContexts(page, {
      exact: NEXT_LABEL,
      soft: NEXT_LABEL_SOFT,
      forbidden: FORBIDDEN_NAV_LABEL,
    })) ||
    (await findButtonByLabels(page, {
      exact: NEXT_LABEL,
      soft: NEXT_LABEL_SOFT,
      forbidden: FORBIDDEN_NAV_LABEL,
    }))
  );
}

export async function findSubmitControl(
  page: Page,
): Promise<ElementHandle<Element> | null> {
  return (
    (await findButtonByLabelsInContexts(page, {
      exact: SUBMIT_LABEL,
      soft: SUBMIT_LABEL_SOFT,
      forbidden: /이전|뒤로|back|prev|초기화|login|로그인/i,
      preferEnabled: false,
    })) ||
    (await findButtonByLabels(page, {
      exact: SUBMIT_LABEL,
      soft: SUBMIT_LABEL_SOFT,
      forbidden: /이전|뒤로|back|prev|초기화|login|로그인/i,
      preferEnabled: false,
    }))
  );
}

export async function detectValidationErrors(page: Page): Promise<string[]> {
  return page.evaluate((errorSource) => {
    const errorRe = new RegExp(errorSource, "i");
    const signals: string[] = [];
    const nodes = Array.from(
      document.querySelectorAll(
        '[aria-invalid="true"], [role="alert"], [aria-live="assertive"], .freebirdFormviewerViewItemsItemErrorMessage, [class*="ErrorMessage"], [class*="error-message"], [class*="validation"]',
      ),
    );
    for (const node of nodes) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 240) continue;
      if (errorRe.test(text)) signals.push(text);
    }
    const bodySample = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 6000);
    const matches = bodySample.match(
      /이 질문은 필수입니다\.?|필수 항목입니다\.?|This is a required question\.?|필수입니다/gi,
    );
    if (matches) {
      for (const m of matches.slice(0, 6)) signals.push(m);
    }
    return [...new Set(signals)];
  }, VALIDATION_ERROR.source);
}

export async function buildBasePageState(
  page: Page,
  provider: CaptureProvider,
  extras?: {
    hasNext?: boolean;
    hasSubmit?: boolean;
  },
): Promise<FormPageState> {
  const title = await page.title();
  const url = page.url();
  const bodyText = await page.evaluate(() =>
    (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 8000),
  );
  const progress = parseProgressHints(bodyText);
  const fingerprint = await readBodyFingerprint(page);
  const hasNext =
    extras?.hasNext ?? Boolean(await findNextControl(page));
  const hasSubmit =
    extras?.hasSubmit ?? Boolean(await findSubmitControl(page));
  return {
    provider,
    pageTitle: title,
    url,
    progressText: progress.progressText,
    currentPageHint: progress.current,
    totalPageHint: progress.total,
    hasNext,
    hasSubmit,
    bodyFingerprint: fingerprint,
  };
}

export async function waitForFingerprintChange(
  page: Page,
  before: string,
  timeoutMs = 8_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const now = await readBodyFingerprint(page);
      if (now !== before) {
        await sleep(350);
        return true;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      // Google Forms section changes often destroy the execution context mid-poll.
      if (
        /Execution context was destroyed|Target closed|frame was detached|Cannot find context/i.test(
          message,
        )
      ) {
        await sleep(500);
        try {
          await page.waitForFunction(() => Boolean(document.body), {
            timeout: 5_000,
          });
          const now = await readBodyFingerprint(page);
          if (now !== before) return true;
          // Context rebuilt — treat as moved if we survived a nav
          return true;
        } catch {
          return true;
        }
      }
      throw error;
    }
    await sleep(180);
  }
  return false;
}

export async function clickMarkedOrHandle(
  page: Page,
  handle: ElementHandle<Element> | null,
): Promise<boolean> {
  if (!handle) return false;
  try {
    const label = await handle.evaluate((el) => {
      const html = el as HTMLElement;
      return (
        html.innerText ||
        html.getAttribute("aria-label") ||
        (html as HTMLInputElement).value ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
    });
    if (
      /^(제출|보내기|완료|완료하기|응답\s*제출|확인\s*및\s*제출|submit|send|finish|done)$/i.test(
        label,
      ) ||
      (/(제출|보내기|완료하기|응답\s*제출|\bsubmit\b|\bsend\b|\bfinish\b|\bdone\b)/i.test(
        label,
      ) &&
        !/다음|계속|next|continue/i.test(label))
    ) {
      // Never click submit-like controls
      return false;
    }

    await handle.evaluate((el) => {
      (el as HTMLElement).scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
    await handle.click({ delay: 20 });
    return true;
  } catch {
    try {
      const unsafe = await handle.evaluate((el) => {
        const label = (
          (el as HTMLElement).innerText ||
          (el as HTMLElement).getAttribute("aria-label") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (/^(제출|보내기|완료|Submit|Send|Finish|Done)$/i.test(label)) {
          return true;
        }
        (el as HTMLElement).click();
        return false;
      });
      return !unsafe;
    } catch {
      return false;
    }
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}
