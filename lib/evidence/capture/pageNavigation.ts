import type { Page } from "puppeteer-core";
import {
  CAPTURE_AFTER_NEXT_MS,
  CAPTURE_NAVIGATION_TIMEOUT_MS,
  FORBIDDEN_NAV_LABEL,
  NEXT_LABEL,
  NEXT_LABEL_SOFT,
  SUBMIT_LABEL,
  SUBMIT_LABEL_SOFT,
  VALIDATION_ERROR,
} from "@/lib/evidence/capture/captureConfig";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectValidationSignals(page: Page): Promise<string[]> {
  return page.evaluate((errorSource) => {
    const errorRe = new RegExp(errorSource, "i");
    const signals: string[] = [];
    const nodes = Array.from(
      document.querySelectorAll(
        '[aria-invalid="true"], [role="alert"], [aria-live="assertive"], .freebirdFormviewerViewItemsItemErrorMessage, [class*="ErrorMessage"], [class*="error-message"]',
      ),
    );
    for (const node of nodes) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 240) continue;
      if (errorRe.test(text)) signals.push(text);
    }
    const bodySample = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 5000);
    const matches = bodySample.match(
      /이 질문은 필수입니다\.?|필수 항목입니다\.?|This is a required question\.?/gi,
    );
    if (matches) {
      for (const m of matches.slice(0, 5)) signals.push(m);
    }
    return [...new Set(signals)];
  }, VALIDATION_ERROR.source);
}

function pageFingerprint(text: string, url: string, title: string): string {
  return `${url}||${title}||${text.slice(0, 800)}`;
}

async function readPercentProgress(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const match = text.match(/(\d{1,3})\s*%/);
    if (!match) return null;
    const pct = Number(match[1]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
    return pct;
  });
}

async function pageMoveSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const headings = Array.from(
      document.querySelectorAll('[role="heading"], h1, h2, h3, strong'),
    )
      .map((h) => (h.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("|");
    const pct =
      (document.body?.innerText || "")
        .replace(/\s+/g, " ")
        .match(/(\d{1,3})\s*%/)?.[1] || "";
    const body = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 400);
    return `${pct}::${headings}::${body}`;
  });
}

async function waitForNavSettled(page: Page): Promise<void> {
  const deadline = Date.now() + CAPTURE_NAVIGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll('button, a, [role="button"]'),
      ).map((el) =>
        ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim(),
      );
      return labels.some((label) => /이동중|loading/i.test(label));
    });
    if (!busy) return;
    await sleep(200);
  }
}

/**
 * Mark a safe next/start control. Never marks submit/finish/back.
 * No form filling — only discovers an already-enabled navigation control.
 */
export async function markSafeNextButton(page: Page): Promise<boolean> {
  return page.evaluate(
    (nextExactSource, nextSoftSource, forbiddenSource) => {
      const nextExact = new RegExp(nextExactSource, "i");
      const nextSoft = new RegExp(nextSoftSource, "i");
      const forbidden = new RegExp(forbiddenSource, "i");

      document
        .querySelectorAll("[data-sure-next-candidate]")
        .forEach((el) => el.removeAttribute("data-sure-next-candidate"));

      const candidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], input[type="button"], div[role="button"], span[role="button"]',
        ),
      );

      const scored: Array<{ el: HTMLElement; score: number }> = [];
      for (const el of candidates) {
        const htmlEl = el as HTMLElement;
        const label = (
          htmlEl.innerText ||
          htmlEl.getAttribute("aria-label") ||
          htmlEl.getAttribute("title") ||
          (htmlEl as HTMLInputElement).value ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (!label || label.length > 48) continue;
        if (forbidden.test(label)) continue;

        let score = 0;
        if (nextExact.test(label)) score = 100;
        else if (nextSoft.test(label)) score = 70;
        else continue;

        if (
          htmlEl.hasAttribute("disabled") ||
          htmlEl.getAttribute("aria-disabled") === "true"
        ) {
          continue;
        }
        const style = window.getComputedStyle(htmlEl);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          continue;
        }
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) continue;
        score += Math.min(20, Math.floor(rect.top / 200));
        scored.push({ el: htmlEl, score });
      }

      scored.sort((a, b) => b.score - a.score);
      let best = scored[0];

      if (!best) {
        const byJs = document.querySelector(
          'div[role="button"][jsname="OCpkoe"], div[jsname="OCpkoe"]',
        ) as HTMLElement | null;
        if (byJs) best = { el: byJs, score: 90 };
      }

      if (!best) {
        const moaButtons = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button.AnswerButton, button.AnswerButton--shape, button.AnswerButton--area",
          ),
        );
        const moaNav = moaButtons.find((el) => {
          const label = (el.innerText || "").replace(/\s+/g, " ").trim();
          if (!label || label.length > 24) return false;
          if (forbidden.test(label)) return false;
          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return false;
          return /^(시작하기|시작|다음|계속|참여하기)$/i.test(label);
        });
        if (moaNav) best = { el: moaNav, score: 95 };
      }

      if (!best) return false;
      best.el.setAttribute("data-sure-next-candidate", "1");
      best.el.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    },
    NEXT_LABEL.source,
    NEXT_LABEL_SOFT.source,
    FORBIDDEN_NAV_LABEL.source,
  );
}

export type SafeNextResult = "moved" | "blocked" | "none";

/**
 * Click next/start only if it is already enabled.
 * Does not fill any fields. Stops when validation errors appear without movement.
 */
export async function clickSafeNext(page: Page): Promise<SafeNextResult> {
  const found = await markSafeNextButton(page);
  if (!found) return "none";

  const beforeUrl = page.url();
  const beforeTitle = await page.title();
  const beforePct = await readPercentProgress(page);
  const beforeSig = await pageMoveSignature(page);
  const beforeText = await page.evaluate(() =>
    (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 2000),
  );
  const beforeFp = pageFingerprint(beforeText, beforeUrl, beforeTitle);
  const beforeErrors = await collectValidationSignals(page);

  const handle = await page.$('[data-sure-next-candidate="1"]');
  if (!handle) return "none";
  await handle.click({ delay: 20 }).catch(async () => {
    await page
      .evaluate(() => {
        const el = document.querySelector(
          "[data-sure-next-candidate='1']",
        ) as HTMLElement | null;
        el?.click();
      })
      .catch(() => undefined);
  });
  await handle.dispose().catch(() => undefined);

  await sleep(CAPTURE_AFTER_NEXT_MS);
  await waitForNavSettled(page);

  const clearMark = async () => {
    await page
      .evaluate(() => {
        document
          .querySelectorAll("[data-sure-next-candidate]")
          .forEach((el) => el.removeAttribute("data-sure-next-candidate"));
      })
      .catch(() => undefined);
  };

  const afterPct = await readPercentProgress(page);
  if (beforePct !== null && afterPct !== null && afterPct > beforePct) {
    await clearMark();
    return "moved";
  }

  const afterUrl = page.url();
  const afterTitle = await page.title();
  const afterText = await page.evaluate(() =>
    (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 2000),
  );
  const afterFp = pageFingerprint(afterText, afterUrl, afterTitle);
  const afterSig = await pageMoveSignature(page);

  if (
    afterSig !== beforeSig ||
    afterFp !== beforeFp ||
    afterText.slice(200, 900) !== beforeText.slice(200, 900)
  ) {
    await clearMark();
    return "moved";
  }

  const afterErrors = await collectValidationSignals(page);
  const newErrors = afterErrors.filter((e) => !beforeErrors.includes(e));
  await clearMark();
  if (newErrors.length > 0) return "blocked";

  const stillHasNext = await markSafeNextButton(page);
  await clearMark();
  if (stillHasNext) return "blocked";
  return "none";
}

/**
 * Detect a visible final-submit control. Never click it — caller must stop.
 */
export async function detectSubmitButtonVisible(
  page: Page,
): Promise<boolean> {
  return page.evaluate(
    (exactSource, softSource) => {
      const exact = new RegExp(exactSource, "i");
      const soft = new RegExp(softSource, "i");
      const candidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], input[type="submit"], input[type="button"], div[role="button"]',
        ),
      );
      for (const el of candidates) {
        const htmlEl = el as HTMLElement;
        const label = (
          htmlEl.innerText ||
          htmlEl.getAttribute("aria-label") ||
          htmlEl.getAttribute("title") ||
          (htmlEl as HTMLInputElement).value ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (!label || label.length > 48) continue;
        if (!exact.test(label) && !soft.test(label)) continue;
        if (/다음|계속|시작|next|continue|start/i.test(label) && !exact.test(label)) {
          continue;
        }
        const style = window.getComputedStyle(htmlEl);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          continue;
        }
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) continue;
        return true;
      }
      return false;
    },
    SUBMIT_LABEL.source,
    SUBMIT_LABEL_SOFT.source,
  );
}
