import { existsSync } from "fs";
import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import {
  riskLabel,
  type CapturePriorityQuestion,
} from "@/lib/evidence/buildCapturePriority";
import { formatKstDateTime } from "@/lib/evidence/sanitizeFilename";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export interface AutoScreenshotPayload {
  id: string;
  label: string;
  fileName: string;
  mimeType: "image/png";
  capturedAt: string;
  capturedAtKst: string;
  capturedUrl: string;
  finalUrl: string;
  viewport: { width: number; height: number };
  pageTitle: string;
  source: "auto_browser_capture";
  base64: string;
  size: number;
}

export interface CaptureSurveyResult {
  success: boolean;
  screenshots: AutoScreenshotPayload[];
  limitations: string[];
}

const VIEWPORT = { width: 1440, height: 1200 } as const;
const MAX_PAGES_FALLBACK = 30;
const NAV_TIMEOUT_MS = 30_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
const SETTLE_MS = 700;
const AFTER_NEXT_MS = 1_100;
const CAPTURE_HARD_TIMEOUT_MS = 300_000;

/** Exact / near-exact labels for next-page controls */
const NEXT_LABEL =
  /^(다음|다음\s*페이지|계속|다음으로|다음\s*단계|next|continue|다음\s*>|>)$/i;
/** Softer contains-match when exact label fails (platform-specific buttons) */
const NEXT_LABEL_SOFT =
  /(다음\s*페이지|다음으로|다음\s*단계|\bnext\b|\bcontinue\b|^다음$)/i;
const FORBIDDEN_LABEL =
  /제출|보내기|완료|등록|확인\s*및\s*제출|submit|send|finish|done|로그인|login|sign\s*in|이전|back|prev/i;
/** Post-click validation banners — not static "필수" badges on questions */
const VALIDATION_ERROR =
  /이\s*질문은\s*필수|필수\s*항목입니다|필수\s*응답|답변해\s*주세요|입력해\s*주세요|선택해\s*주세요|작성해\s*주세요|개까지\s*선택|개\s*만\s*선택|최대\s*\d+\s*개|최소\s*\d+\s*개|this\s*is\s*a\s*required|required\s*question|please\s*(answer|fill|select)/i;

function findLocalChrome(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates =
    process.platform === "win32"
      ? [
          process.env.LOCALAPPDATA
            ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
            : "",
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          process.env.PROGRAMFILES
            ? `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`
            : "",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];

  return candidates.find((path) => path && existsSync(path));
}

async function launchBrowser(): Promise<Browser> {
  const localChrome = findLocalChrome();
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
      defaultViewport: VIEWPORT,
    });
  }

  // @sparticuz/chromium is for Linux serverless — do not hang on desktop OS
  if (process.platform === "win32" || process.platform === "darwin") {
    throw new Error(
      "로컬 Chrome/Edge 실행 파일을 찾지 못했습니다. Chrome을 설치하거나 환경변수 PUPPETEER_EXECUTABLE_PATH를 설정하세요.",
    );
  }

  const chromium = await import("@sparticuz/chromium");
  const executablePath = await chromium.default.executablePath();
  return puppeteer.launch({
    args: chromium.default.args,
    defaultViewport: VIEWPORT,
    executablePath,
    headless: true,
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pageFingerprint(text: string, url: string, title: string): string {
  return `${url}||${title}||${text.slice(0, 800)}`;
}

/**
 * Detect validation errors that appeared after clicking Next.
 * Do NOT treat static "필수" badges on questions as failures.
 */
async function collectValidationSignals(page: Page): Promise<string[]> {
  return page.evaluate((errorSource) => {
    const errorRe = new RegExp(errorSource, "i");
    const signals: string[] = [];

    const nodes = Array.from(
      document.querySelectorAll(
        '[aria-invalid="true"], [role="alert"], [aria-live="assertive"], [aria-live="polite"], .freebirdFormviewerViewItemsItemErrorMessage, [class*="ErrorMessage"], [class*="error-message"], [class*="validation"]',
      ),
    );

    for (const node of nodes) {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 240) continue;
      if (errorRe.test(text)) signals.push(text);
    }

    // Google Forms often injects a short error under the question
    const bodySample = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 5000);
    const matches = bodySample.match(
      /이 질문은 필수입니다\.?|필수 항목입니다\.?|This is a required question\.?/gi,
    );
    if (matches) {
      for (const m of matches.slice(0, 3)) signals.push(m);
    }

    return [...new Set(signals)];
  }, VALIDATION_ERROR.source);
}

async function markNextButton(page: Page): Promise<boolean> {
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
          'button, a, [role="button"], input[type="button"], input[type="submit"], div[role="button"], span[role="button"]',
        ),
      );

      const scored: Array<{ el: HTMLElement; score: number }> = [];

      for (const el of candidates) {
        const htmlEl = el as HTMLElement;
        const label = (
          htmlEl.innerText ||
          htmlEl.getAttribute("aria-label") ||
          htmlEl.getAttribute("data-tooltip") ||
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

        // Prefer controls near the bottom of the form
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) continue;
        score += Math.min(20, Math.floor(rect.top / 200));

        scored.push({ el: htmlEl, score });
      }

      scored.sort((a, b) => b.score - a.score);
      let best = scored[0];
      // Google Forms Next control often uses jsname=OCpkoe
      if (!best) {
        const byJs = document.querySelector(
          'div[role="button"][jsname="OCpkoe"], div[jsname="OCpkoe"]',
        ) as HTMLElement | null;
        if (byJs) best = { el: byJs, score: 90 };
      }
      if (!best) return false;
      best.el.setAttribute("data-sure-next-candidate", "1");
      best.el.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    },
    NEXT_LABEL.source,
    NEXT_LABEL_SOFT.source,
    FORBIDDEN_LABEL.source,
  );
}

async function readFormProgress(
  page: Page,
): Promise<{ current: number; total: number } | null> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const match =
      text.match(/(\d+)\s*\/\s*(\d+)\s*페이지/) ||
      text.match(/Page\s*(\d+)\s*of\s*(\d+)/i) ||
      text.match(/(\d+)\s*\/\s*(\d+)\s*page/i);
    if (!match) return null;
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1) {
      return null;
    }
    return { current, total };
  });
}

async function pageMoveSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const headings = Array.from(
      document.querySelectorAll('[role="heading"], h1, h2, h3'),
    )
      .map((h) => (h.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("|");
    const hasBack = Array.from(
      document.querySelectorAll('button, [role="button"]'),
    ).some((el) =>
      /^(뒤로|이전|back|prev)$/i.test(
        ((el as HTMLElement).innerText || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim(),
      ),
    );
    const body = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 1200);
    return `${hasBack ? "B" : "N"}::${headings}::${body.slice(0, 400)}`;
  });
}

async function clickSafeNext(
  page: Page,
): Promise<"moved" | "blocked" | "none"> {
  const found = await markNextButton(page);
  if (!found) return "none";

  const beforeUrl = page.url();
  const beforeTitle = await page.title();
  const beforeProgress = await readFormProgress(page);
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

  await sleep(AFTER_NEXT_MS);
  await page
    .waitForNetworkIdle({
      idleTime: 400,
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    })
    .catch(() => undefined);

  const afterErrors = await collectValidationSignals(page);
  const newErrors = afterErrors.filter((e) => !beforeErrors.includes(e));
  if (newErrors.length > 0) {
    return "blocked";
  }

  // Google Forms often keeps the same URL — progress "3/22페이지" → "4/22" is the signal
  const afterProgress = await readFormProgress(page);
  if (
    beforeProgress &&
    afterProgress &&
    afterProgress.current > beforeProgress.current
  ) {
    await page
      .evaluate(() => {
        document
          .querySelectorAll("[data-sure-next-candidate]")
          .forEach((el) => el.removeAttribute("data-sure-next-candidate"));
      })
      .catch(() => undefined);
    return "moved";
  }

  const afterUrl = page.url();
  const afterTitle = await page.title();
  const afterText = await page.evaluate(() =>
    (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 2000),
  );
  const afterFp = pageFingerprint(afterText, afterUrl, afterTitle);
  const afterSig = await pageMoveSignature(page);

  await page
    .evaluate(() => {
      document
        .querySelectorAll("[data-sure-next-candidate]")
        .forEach((el) => el.removeAttribute("data-sure-next-candidate"));
    })
    .catch(() => undefined);

  // Forms without "N/M페이지" — heading / 뒤로 button appearing is the move signal
  if (afterSig !== beforeSig) return "moved";
  if (afterFp !== beforeFp) return "moved";
  if (afterText.slice(200, 900) !== beforeText.slice(200, 900)) {
    return "moved";
  }

  // Next was clicked but page unchanged — usually unmet required / multi-select rules
  const stillHasNext = await markNextButton(page);
  if (stillHasNext) return "blocked";
  return "none";
}

async function clickSafeBack(page: Page): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, a, [role="button"], div[role="button"], span[role="button"]',
      ),
    );
    for (const el of candidates) {
      const htmlEl = el as HTMLElement;
      const label = (
        htmlEl.innerText ||
        htmlEl.getAttribute("aria-label") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (!/^(뒤로|이전|back|prev)$/i.test(label)) continue;
      if (
        htmlEl.hasAttribute("disabled") ||
        htmlEl.getAttribute("aria-disabled") === "true"
      ) {
        continue;
      }
      htmlEl.click();
      return true;
    }
    return false;
  });
  if (!clicked) return false;
  await sleep(AFTER_NEXT_MS);
  await page
    .waitForNetworkIdle({
      idleTime: 400,
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    })
    .catch(() => undefined);
  return true;
}

/**
 * Prefer "아니오" on Yes/No when "예" has a follow-up branch marker (→2번),
 * so capture can skip checkbox-heavy follow-up pages if needed.
 * When preferSkipBranch is false, prefer "예" to visit follow-up pages first.
 */
async function selectYesNoPreference(
  page: Page,
  preferSkipBranch: boolean,
): Promise<boolean> {
  await page
    .evaluate(() => {
      document
        .querySelectorAll("[data-sure-unlock]")
        .forEach((el) => el.removeAttribute("data-sure-unlock"));
    })
    .catch(() => undefined);
  const changed = await page.evaluate((skipBranch) => {
    function labelOf(el: Element): string {
      return (
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      ).replace(/\s+/g, " ");
    }

    let changed = false;
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
    );
    for (const group of groups) {
      const options = Array.from(
        group.querySelectorAll<HTMLElement>('[role="radio"]'),
      );
      if (options.length < 2 || options.length > 4) continue;
      const yes = options.find((o) =>
        /^(①\s*)?예\b|^yes\b/i.test(labelOf(o).trim()),
      );
      const no = options.find((o) =>
        /^(②\s*)?아니\s*오\b|^no\b/i.test(labelOf(o).trim()),
      );
      if (!yes || !no) continue;
      const yesHasFollowUp = /→|->|응답/.test(labelOf(yes));
      const target = skipBranch && yesHasFollowUp ? no : yes;
      if (target.getAttribute("aria-checked") === "true") continue;
      target.scrollIntoView({ block: "center" });
      target.setAttribute("data-sure-unlock", "1");
      changed = true;
    }
    return changed;
  }, preferSkipBranch);
  const clicked = await puppeteerClickSelector(
    page,
    '[data-sure-unlock="1"]',
  );
  return changed || clicked > 0;
}

/** Puppeteer-level checkbox clicks when in-page evaluate clicks fail. */
async function forceClickCheckboxes(page: Page): Promise<number> {
  // Do NOT clear existing data-sure-unlock marks from tryUnlock — click those first
  const pending = await puppeteerClickSelector(
    page,
    '[data-sure-unlock="1"]',
  );

  const marked = await page.evaluate(() => {
    function isChecked(box: Element): boolean {
      return box.getAttribute("aria-checked") === "true";
    }
    function isOther(el: Element): boolean {
      const t = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      return /^(기타|other)\b/i.test(t);
    }
    function needCount(container: Element): number {
      const text = (container.textContent || "").replace(/\s+/g, " ");
      const dup = text.match(
        /중복\s*선택\s*[-–—]?\s*(?:최대\s*)?(\d+)\s*개/,
      );
      if (dup) return Math.max(1, Number(dup[1]) || 1);
      const min = text.match(/최소\s*(\d+)\s*개/);
      if (min) return Math.max(1, Number(min[1]) || 1);
      return 1;
    }

    let markedCount = 0;
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[role="listitem"]'),
    );
    for (const item of items) {
      // Question-level only (skip nested option rows)
      if (item.parentElement?.closest('[role="listitem"]')) {
        const parent = item.parentElement.closest(
          '[role="listitem"]',
        ) as HTMLElement;
        if (
          parent &&
          parent.querySelectorAll('[role="checkbox"]').length >= 2
        ) {
          continue;
        }
      }
      const boxes = Array.from(
        item.querySelectorAll<HTMLElement>('[role="checkbox"]'),
      ).filter((b) => !isOther(b));
      if (boxes.length < 2) continue;
      const need = needCount(item);
      let have = boxes.filter(isChecked).length;
      for (const box of boxes) {
        if (have >= need) break;
        if (isChecked(box)) continue;
        const label = box.closest("label") as HTMLElement | null;
        const target = label || box;
        target.scrollIntoView({ block: "center" });
        target.setAttribute("data-sure-unlock", "1");
        have += 1;
        markedCount += 1;
      }
    }
    return markedCount;
  });

  const clicked = await puppeteerClickSelector(
    page,
    '[data-sure-unlock="1"]',
  );
  return pending + marked + clicked;
}

/**
 * Multi-pass unlock: fill → wait for conditional questions → fill again.
 */
async function unlockWithRetries(
  page: Page,
  piiSnippets: string[],
): Promise<number> {
  let total = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const filled = await tryUnlockForNextPage(page, piiSnippets);
    total += filled;
    if (filled === 0 && pass > 0) break;
    await sleep(350);
    const more = await tryUnlockForNextPage(page, piiSnippets);
    total += more;
    if (more === 0 && filled === 0) break;
    await sleep(300);
  }
  const forced = await forceClickCheckboxes(page);
  total += forced;
  if (forced > 0) await sleep(400);

  // Puppeteer keyboard fill for stubborn required textboxes (React-controlled)
  const emptyRequired = await page.$$(
    'textarea[aria-label="내 답변"], input[aria-label="내 답변"], textarea[required], input[required]',
  );
  for (const handle of emptyRequired.slice(0, 8)) {
    const empty = await handle
      .evaluate((el) => !(el as HTMLInputElement).value?.trim())
      .catch(() => false);
    if (!empty) {
      await handle.dispose().catch(() => undefined);
      continue;
    }
    await handle.click({ delay: 25 }).catch(() => undefined);
    await page.keyboard.type("-", { delay: 10 }).catch(() => undefined);
    total += 1;
    await handle.dispose().catch(() => undefined);
  }
  return total;
}

/**
 * Unlock Google Forms / survey "Next".
 * Likert/scale questions are always filled (opinion, not identity).
 * Only skip true identity text fields (name/phone/email/etc.).
 */

/**
 * Google Forms ignores DOM Element.click() for radios/checkboxes in headless Chrome.
 * Mark targets in-page, then click via Puppeteer (trusted user gesture).
 */
async function puppeteerClickSelector(
  page: Page,
  selector: string,
): Promise<number> {
  const handles = await page.$$(selector);
  let clicked = 0;
  for (const handle of handles) {
    try {
      await handle.evaluate((el) => {
        (el as HTMLElement).scrollIntoView({
          block: "center",
          inline: "nearest",
        });
      });
      await handle.click({ delay: 15 });
      clicked += 1;
      await sleep(40);
    } catch {
      /* ignore single target failures */
    } finally {
      await handle.dispose().catch(() => undefined);
    }
  }
  await page
    .evaluate((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.removeAttribute("data-sure-unlock");
      });
    }, selector)
    .catch(() => undefined);
  return clicked;
}

async function tryUnlockForNextPage(
  page: Page,
  piiSnippets: string[],
): Promise<number> {
  await page
    .evaluate(() => {
      document
        .querySelectorAll("[data-sure-unlock]")
        .forEach((el) => el.removeAttribute("data-sure-unlock"));
    })
    .catch(() => undefined);

  const filled = await page.evaluate((snippets: string[]) => {
    const identityLoose =
      /성명|이름\s*\(|이름:|실명|휴대폰\s*번호|전화\s*번호|이메일\s*주소|주민등록|계좌\s*번호|여권\s*번호|비밀번호/i;
    const likertHint =
      /전혀\s*그렇지\s*않다|매우\s*그렇다|보통이다|그렇지\s*않다|그렇다|동의하지|동의한다|해당\s*없음|Not at all|Strongly/i;
    const demographicTitle =
      /연령|성별|거주\s*지역|근속\s*기간|근속\s*연수|직군|직급|직책|나이대|\b나이\b|소속\s*부서|재직\s*기간/i;
    const needle = snippets
      .map((s) => s.replace(/\s+/g, " ").trim().slice(0, 36))
      .filter((s) => s.length >= 4);

    function questionTitle(el: Element): string {
      const item =
        el.closest('[role="listitem"]') ||
        el.closest("div[jscontroller]") ||
        el.parentElement;
      const heading = item?.querySelector(
        '[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, [class*="QuestionBaseTitle"]',
      );
      const raw =
        heading?.textContent ||
        item?.querySelector("div")?.textContent ||
        el.getAttribute("aria-label") ||
        "";
      return raw.replace(/\s+/g, " ").trim().slice(0, 200);
    }

    function isDemographicField(el: Element): boolean {
      return demographicTitle.test(questionTitle(el));
    }

    function isIdentityField(el: Element): boolean {
      const title = questionTitle(el);
      // Demographics & Likert must be fillable to reach later pages
      if (likertHint.test(title) || demographicTitle.test(title)) return false;
      if (identityLoose.test(title)) return true;
      if (
        title.length <= 24 &&
        needle.some(
          (n) =>
            /이름|성명|연락처|전화|이메일|email/i.test(n) && title.includes(n),
        )
      ) {
        return true;
      }
      return false;
    }

    function isLikertGroup(group: Element): boolean {
      const text = (group.textContent || "").replace(/\s+/g, " ");
      return likertHint.test(text);
    }

    let filled = 0;

    function isChecked(box: Element): boolean {
      if (box.getAttribute("aria-checked") === "true") return true;
      return Boolean((box as HTMLInputElement).checked);
    }

    function clickChoice(el: HTMLElement): void {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      // Defer real click to Puppeteer — Forms ignores untrusted Element.click()
      const label = el.closest(
        "label.docssharedWizToggleLabeledContainer, label",
      ) as HTMLElement | null;
      const target = label || el;
      target.setAttribute("data-sure-unlock", "1");
    }

    function requiredChoiceCount(container: Element): number {
      const text = (container.textContent || "").replace(/\s+/g, " ");
      const min = text.match(/최소\s*(\d+)\s*개/);
      if (min) return Math.max(1, Number(min[1]) || 1);
      // 중복선택-2개 / 중복선택-최대2개 / 중복선택 2개
      const dup = text.match(
        /중복\s*선택\s*[-–—]?\s*(?:최대\s*)?(\d+)\s*개/,
      );
      if (dup) return Math.max(1, Number(dup[1]) || 1);
      const maxOnly = text.match(/최대\s*(\d+)\s*개/);
      if (maxOnly) return 1;
      if (/복수\s*선택|해당.*모두/.test(text)) return 1;
      return 1;
    }

    function isOtherOption(el: Element): boolean {
      const t = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      return /^(기타|other)\b/i.test(t);
    }

    function setNativeValue(
      input: HTMLInputElement | HTMLTextAreaElement,
      value: string,
    ): void {
      const proto =
        input.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      desc?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Google Forms radiogroups (Likert + multiple choice)
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
    );
    for (const group of groups) {
      const checked = group.querySelector('[role="radio"][aria-checked="true"]');
      if (checked) continue;
      if (
        !isLikertGroup(group) &&
        !isDemographicField(group) &&
        isIdentityField(group)
      ) {
        continue;
      }
      const options = Array.from(
        group.querySelectorAll<HTMLElement>('[role="radio"]'),
      );
      // Likert → middle. Yes/No with "예(→2번)" → try Yes first (follow-up page).
      // Plain Yes/No → No (shorter path toward later demographics).
      let pick = options[0];
      if (isLikertGroup(group) && options.length >= 5) {
        pick = options[Math.floor(options.length / 2)];
      } else if (options.length >= 2 && options.length <= 4) {
        const labelOfEarly = (el: Element) =>
          (el.getAttribute("aria-label") || el.textContent || "").replace(
            /\s+/g,
            " ",
          );
        const decline = options.find((o) =>
          /동의하지\s*않습니다|동의\s*안\s*함|미동의/.test(
            labelOfEarly(o).trim(),
          ),
        );
        if (decline) pick = decline;

        const labelOf = (el: Element) =>
          (el.getAttribute("aria-label") || el.textContent || "").replace(
            /\s+/g,
            " ",
          );
        const yes = options.find((o) =>
          /^(①\s*)?예\b|^yes\b/i.test(labelOf(o).trim()),
        );
        const no = options.find((o) =>
          /^(②\s*)?아니\s*오\b|^no\b/i.test(labelOf(o).trim()),
        );
        if (yes && no) {
          pick = /→|->|응답/.test(labelOf(yes)) ? yes : no;
        }
      }
      if (!pick) continue;
      clickChoice(pick);
      filled += 1;
    }

    // Native radios
    const radios = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[type="radio"]:not(:disabled)',
      ),
    );
    const radioGroups = new Map<string, HTMLInputElement[]>();
    for (const radio of radios) {
      const key = radio.name || radio.id || radio.value;
      if (!key) continue;
      const list = radioGroups.get(key) ?? [];
      list.push(radio);
      radioGroups.set(key, list);
    }
    for (const group of radioGroups.values()) {
      if (group.some((r) => r.checked)) continue;
      const first = group[0];
      if (!first) continue;
      const parent = first.closest('[role="radiogroup"]') || first.parentElement;
      if (parent && !isLikertGroup(parent) && !isDemographicField(first) && isIdentityField(first)) continue;
      const pick =
        group.length >= 5 ? group[Math.floor(group.length / 2)] : group[0];
      if (pick) {
        clickChoice(pick);
        filled += 1;
      }
    }

    // Orphan role=radio not inside radiogroup (some Forms layouts)
    const orphanRadios = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="radio"]:not([aria-checked="true"])',
      ),
    );
    const seen = new Set<Element>();
    for (const radio of orphanRadios) {
      const group = radio.closest('[role="listitem"]') || radio.parentElement;
      if (!group || seen.has(group)) continue;
      if (group.querySelector('[role="radio"][aria-checked="true"]')) {
        seen.add(group);
        continue;
      }
      seen.add(group);
      if (
        !isLikertGroup(group) &&
        !isDemographicField(group) &&
        isIdentityField(group)
      ) {
        continue;
      }
      clickChoice(radio);
      filled += 1;
    }

    // Checkbox groups: only question-level listitems (2+ boxes).
    // Nested option rows are also listitems with 1 box — selecting those over-checks "중복선택-2개".
    const listItems = Array.from(
      document.querySelectorAll<HTMLElement>('[role="listitem"]'),
    );
    for (const item of listItems) {
      // Skip nested option rows inside another checkbox question
      if (item.parentElement?.closest('[role="listitem"]')) {
        const parent = item.parentElement.closest(
          '[role="listitem"]',
        ) as HTMLElement;
        if (
          parent &&
          parent.querySelectorAll('[role="checkbox"]').length >= 2
        ) {
          continue;
        }
      }
      const boxes = Array.from(
        item.querySelectorAll<HTMLElement>(
          '[role="checkbox"], input[type="checkbox"]',
        ),
      ).filter((box) => !isOtherOption(box));
      // Option-row listitems have a single checkbox — ignore
      if (boxes.length < 2) continue;
      if (isIdentityField(item)) continue;
      const need = requiredChoiceCount(item);
      let checkedCount = boxes.filter(isChecked).length;
      // If over-selected (max N), leave as-is; Forms will show error — try unchecking extras
      if (checkedCount > need && /중복\s*선택|최대\s*\d+\s*개/.test(item.textContent || "")) {
        for (const box of boxes) {
          if (checkedCount <= need) break;
          if (!isChecked(box)) continue;
          clickChoice(box); // mark toggle-off for Puppeteer
          checkedCount -= 1;
          filled += 1;
        }
      }
      for (const box of boxes) {
        if (checkedCount >= need) break;
        if (isChecked(box)) continue;
        clickChoice(box);
        checkedCount += 1; // mark-only; Puppeteer clicks later
        filled += 1;
      }
    }

    // Per-question ARIA checkbox groups (question containers only)
    const ariaByItem = new Map<Element, HTMLElement[]>();
    for (const box of Array.from(
      document.querySelectorAll<HTMLElement>('[role="checkbox"]'),
    )) {
      if (isOtherOption(box)) continue;
      const item = box.closest('[role="listitem"]');
      if (!item) continue;
      // Prefer outermost question listitem that still contains this box
      let root: Element = item;
      let walk: Element | null = item.parentElement;
      while (walk) {
        if (
          walk.getAttribute("role") === "listitem" &&
          walk.querySelectorAll('[role="checkbox"]').length >= 2
        ) {
          root = walk;
        }
        walk = walk.parentElement;
      }
      const list = ariaByItem.get(root) ?? [];
      list.push(box);
      ariaByItem.set(root, list);
    }
    for (const [item, boxes] of ariaByItem) {
      const unique = [...new Set(boxes)];
      if (unique.length < 2) continue;
      if (isIdentityField(item)) continue;
      const need = requiredChoiceCount(item);
      let checkedCount = unique.filter(isChecked).length;
      for (const box of unique) {
        if (checkedCount >= need) break;
        if (isChecked(box)) continue;
        // Already marked by listitem pass — skip duplicates
        const label = box.closest("label");
        if (
          box.getAttribute("data-sure-unlock") === "1" ||
          label?.getAttribute("data-sure-unlock") === "1"
        ) {
          checkedCount += 1;
          continue;
        }
        clickChoice(box);
        checkedCount += 1; // mark-only; Puppeteer clicks later
        filled += 1;
      }
    }

    const selects = Array.from(
      document.querySelectorAll<HTMLSelectElement>("select:not(:disabled)"),
    );
    for (const select of selects) {
      if (isIdentityField(select)) continue;
      if (select.selectedIndex > 0) continue;
      const option = Array.from(select.options).find(
        (o, idx) => idx > 0 && Boolean(o.value),
      );
      if (!option) continue;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new Event("input", { bubbles: true }));
      filled += 1;
    }

    // Identity text fields: skip. Required opinion text: fill via native setter (React).
    const texts = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input[type="text"]:not(:disabled), input:not([type]):not(:disabled), textarea:not(:disabled)',
      ),
    );
    for (const input of texts) {
      const type = (input.getAttribute("type") || "text").toLowerCase();
      if (
        ["hidden", "password", "email", "tel", "file", "submit", "button"].includes(
          type,
        )
      ) {
        continue;
      }
      if (input.value?.trim()) continue;
      const aria = (input.getAttribute("aria-label") || "").replace(/\s+/g, " ");
      if (/^기타\s*응답|^other/i.test(aria)) continue;
      if (isIdentityField(input)) continue;
      input.focus();
      setNativeValue(input, "-");
      filled += 1;
      if (filled >= 60) break;
    }

    // contenteditable answer boxes (some Forms layouts)
    const editables = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[contenteditable="true"], div[role="textbox"]',
      ),
    );
    for (const el of editables) {
      if ((el.textContent || "").trim()) continue;
      if (isIdentityField(el)) continue;
      const aria = (el.getAttribute("aria-label") || "").replace(/\s+/g, " ");
      if (/^기타\s*응답|^other/i.test(aria)) continue;
      el.focus();
      el.textContent = "-";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      filled += 1;
    }

    return filled;
  }, piiSnippets);

  const clicked = await puppeteerClickSelector(
    page,
    '[data-sure-unlock="1"]',
  );
  return filled + clicked;
}

async function matchPriorityOnPage(
  page: Page,
  priorities: CapturePriorityQuestion[],
): Promise<CapturePriorityQuestion[]> {
  if (priorities.length === 0) return [];
  const body = await page.evaluate(() =>
    (document.body?.innerText || "").replace(/\s+/g, " "),
  );
  return priorities.filter((item) => {
    const needle = item.questionText.replace(/\s+/g, " ").trim().slice(0, 40);
    return needle.length >= 4 && body.includes(needle);
  });
}

async function scrollToPriorityQuestion(
  page: Page,
  item: CapturePriorityQuestion,
): Promise<void> {
  const needle = item.questionText.replace(/\s+/g, " ").trim().slice(0, 40);
  if (needle.length < 4) return;
  await page
    .evaluate((text) => {
      const nodes = Array.from(document.querySelectorAll("div, span, label, p, li, h1, h2, h3, h4"));
      for (const node of nodes) {
        const t = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (t.includes(text)) {
          (node as HTMLElement).scrollIntoView({
            block: "center",
            inline: "nearest",
          });
          return true;
        }
      }
      return false;
    }, needle)
    .catch(() => undefined);
  await sleep(400);
}

function captureLabelFor(
  pageNo: number,
  matched: CapturePriorityQuestion[],
  pageText = "",
): { label: string; fileName: string } {
  const padded = String(pageNo).padStart(2, "0");
  // Avoid false positives like "직급별 교육" / "장년근로자"
  const demoHits = [
    /(?:\(1\)|1\)|①|\(1\))\s*연령|(?:^|[^\가-힣])연령(?:\s|$|\*)/.test(
      pageText,
    ) && !/장년|자녀|아동/.test(pageText),
    /근속\s*기간|근속\s*연수/.test(pageText),
    /(?:\(3\)|3\)|③)\s*직군|(?:^|[^\가-힣])직군(?:\s|$|\*)/.test(pageText) &&
      !/직군별/.test(pageText),
    /(?:\(4\)|4\)|④)\s*직급|(?:^|[^\가-힣])직급(?:\s|$|\*)/.test(pageText) &&
      !/직급별/.test(pageText),
  ].filter(Boolean).length;
  const hasDemo =
    demoHits >= 2 ||
    matched.some((m) =>
      /^(?:\(?\d+\)?\s*)?(연령|근속|직군|직급)/.test(
        m.questionText.replace(/\s+/g, " ").trim(),
      ),
    );

  if (hasDemo) {
    return {
      label: `인구통계(연령·근속·직군·직급) 문항 포함 화면 (p.${pageNo})`,
      fileName: `auto_screenshot_${padded}_demographics.png`,
    };
  }

  if (matched.length === 0) {
    return {
      label:
        pageNo === 1
          ? "첫 공개 설문 화면"
          : `입력 없이 이동한 ${pageNo}페이지 화면`,
      fileName:
        pageNo === 1
          ? "auto_screenshot_01_first_public_page.png"
          : `auto_screenshot_${padded}_page.png`,
    };
  }

  const top = matched[0];
  const kind = riskLabel(top.risk);
  return {
    label: `${kind} 문항 포함 화면 (p.${pageNo})`,
    fileName: `auto_screenshot_${padded}_${top.risk}_questions.png`,
  };
}

async function capturePage(
  page: Page,
  index: number,
  label: string,
  fileName: string,
): Promise<AutoScreenshotPayload> {
  const capturedAt = new Date();
  const png = await page.screenshot({
    type: "png",
    fullPage: true,
    captureBeyondViewport: true,
  });
  const bytes = Buffer.from(png);
  return {
    id: `auto_screenshot_${String(index).padStart(2, "0")}`,
    label,
    fileName,
    mimeType: "image/png",
    capturedAt: capturedAt.toISOString(),
    capturedAtKst: formatKstDateTime(capturedAt),
    capturedUrl: page.url(),
    finalUrl: page.url(),
    viewport: { ...VIEWPORT },
    pageTitle: await page.title(),
    source: "auto_browser_capture",
    base64: bytes.toString("base64"),
    size: bytes.byteLength,
  };
}

export async function captureSurveyScreenshots(input: {
  surveyUrl: string;
  finalUrl?: string;
  priorityQuestions?: CapturePriorityQuestion[];
}): Promise<CaptureSurveyResult> {
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const partial: {
    screenshots: AutoScreenshotPayload[];
    limitations: string[];
  } = { screenshots: [], limitations: [] };

  try {
    return await Promise.race([
      runCaptureSurveyScreenshots(input, partial),
      new Promise<CaptureSurveyResult>((resolve) => {
        hardTimer = setTimeout(() => {
          const shots = [...partial.screenshots];
          resolve({
            success: shots.length > 0,
            screenshots: shots,
            limitations: [
              ...partial.limitations,
              "캡처 제한 시간을 초과했습니다.",
              shots.length > 0
                ? `시간 초과 전까지 ${shots.length}장은 확보했습니다. 연령·근속·직군·직급 화면이 없으면 ‘추가 캡처 첨부’로 넣어 주세요.`
                : "자동 화면 캡처에 실패했습니다.",
            ],
          });
        }, CAPTURE_HARD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (hardTimer) clearTimeout(hardTimer);
  }
}

async function runCaptureSurveyScreenshots(
  input: {
    surveyUrl: string;
    finalUrl?: string;
    priorityQuestions?: CapturePriorityQuestion[];
  },
  partial?: {
    screenshots: AutoScreenshotPayload[];
    limitations: string[];
  },
): Promise<CaptureSurveyResult> {
  const limitations: string[] = [];
  const priorities = input.priorityQuestions ?? [];
  const piiSnippets = priorities.map((p) => p.questionText);
  const capturedPriorityKeys = new Set<string>();

  const targetRaw = (input.finalUrl || input.surveyUrl || "").trim();
  if (!targetRaw) {
    return {
      success: false,
      screenshots: [],
      limitations: [
        "자동 화면 캡처에 실패했습니다.",
        "캡처 대상 URL이 비어 있습니다.",
      ],
    };
  }

  const safety = await safeUrlCheck(targetRaw);
  if (!safety.safe || !safety.normalizedUrl) {
    return {
      success: false,
      screenshots: [],
      limitations: [
        "자동 화면 캡처에 실패했습니다.",
        safety.reason || "URL 보안 검사를 통과하지 못했습니다.",
      ],
    };
  }

  const host = new URL(safety.normalizedUrl).hostname.toLowerCase();
  if (
    host === "metadata.google.internal" ||
    host.endsWith(".internal") ||
    host === "metadata"
  ) {
    return {
      success: false,
      screenshots: [],
      limitations: [
        "자동 화면 캡처에 실패했습니다.",
        "내부 메타데이터 엔드포인트는 캡처할 수 없습니다.",
      ],
    };
  }

  if (priorities.length > 0) {
    limitations.push(
      `공개 설문 전체 페이지 캡처를 시도합니다. (진단상 개인정보·민감정보 문항 ${priorities.length}개 참고)`,
    );
  } else {
    limitations.push("공개 설문 전체 페이지 캡처를 시도합니다.");
  }

  let browser: Browser | null = null;
  let usedSoftUnlock = false;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SURECheckEvidenceCapture/1.0",
    );

    const response = await page.goto(safety.normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    if (!response || response.status() >= 400) {
      limitations.push(
        `설문 페이지 HTTP 상태 ${response?.status() ?? "unknown"}로 접근이 제한되었을 수 있습니다.`,
      );
    }

    await page
      .waitForNetworkIdle({
        idleTime: 500,
        timeout: NETWORK_IDLE_TIMEOUT_MS,
      })
      .catch(() => undefined);
    await sleep(SETTLE_MS);

    const screenshots: AutoScreenshotPayload[] = [];
    const firstProgress = await readFormProgress(page);
    const maxPages = Math.min(
      MAX_PAGES_FALLBACK,
      Math.max(firstProgress?.total ?? 0, 15),
    );
    if (firstProgress?.total) {
      limitations.push(
        `설문 진행 표시 ${firstProgress.current}/${firstProgress.total}페이지 감지 → 최대 ${maxPages}장까지 캡처합니다.`,
      );
    }

    const captureCurrent = async (pageNo: number) => {
      const matched = await matchPriorityOnPage(page, priorities);
      for (const item of matched) {
        capturedPriorityKeys.add(
          `${item.pageIndex}::${item.questionText.slice(0, 40)}`,
        );
      }
      if (matched.length > 0) {
        await scrollToPriorityQuestion(page, matched[0]);
      }
      const pageText = await page.evaluate(() =>
        (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 4000),
      );
      // Also mark demographic matches from live page text
      if (
        /근속\s*기간/.test(pageText) &&
        /연령/.test(pageText) &&
        !/장년근로자/.test(pageText)
      ) {
        capturedPriorityKeys.add(`demo::${pageNo}`);
      }
      const meta = captureLabelFor(pageNo, matched, pageText);
      const shot = await capturePage(page, pageNo, meta.label, meta.fileName);
      screenshots.push(shot);
      if (partial) {
        partial.screenshots = [...screenshots];
        partial.limitations = [...limitations];
      }
    };

    await captureCurrent(1);

    for (let pageNo = 2; pageNo <= maxPages; pageNo += 1) {
      let filled = await unlockWithRetries(page, piiSnippets);
      if (filled > 0) {
        usedSoftUnlock = true;
      }

      let result = await clickSafeNext(page);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (result === "moved") break;
        filled = await unlockWithRetries(page, piiSnippets);
        if (filled > 0) usedSoftUnlock = true;
        await sleep(500 + attempt * 80);
        result = await clickSafeNext(page);
      }

      // Stuck on "예(→2번)" / checkbox follow-up → switch to 아니오 and continue
      if (result !== "moved") {
        let flipped = await selectYesNoPreference(page, true);
        if (!flipped) {
          // Already on follow-up (checkbox) page — go back, then pick 아니오
          const wentBack = await clickSafeBack(page);
          if (wentBack) {
            flipped = await selectYesNoPreference(page, true);
          }
        }
        if (flipped) {
          usedSoftUnlock = true;
          limitations.push(
            "조건부 문항(예→후속)에서 이동이 막혀 ‘아니오’로 우회해 이후 페이지 캡처를 계속합니다.",
          );
          await sleep(500);
          filled = await unlockWithRetries(page, piiSnippets);
          if (filled > 0) usedSoftUnlock = true;
          result = await clickSafeNext(page);
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (result === "moved") break;
            await unlockWithRetries(page, piiSnippets);
            await sleep(400);
            result = await clickSafeNext(page);
          }
        }
      }

      if (result === "none") {
        const progress = await readFormProgress(page);
        if (progress && progress.current < progress.total) {
          limitations.push(
            `${progress.current}/${progress.total}페이지에서 다음 버튼을 찾지 못해 중단했습니다. 연령·근속·직군·직급 화면이 뒤에 있으면 ‘추가 캡처 첨부’로 넣어 주세요.`,
          );
        } else if (screenshots.length === 1) {
          limitations.push(
            "다음 페이지 버튼을 찾지 못했거나 한 화면짜리 설문으로, 현재 화면만 캡처했습니다.",
          );
        } else {
          limitations.push(
            `더 이상 다음 페이지가 없어 ${screenshots.length}장까지 캡처했습니다.`,
          );
        }
        break;
      }
      if (result === "blocked") {
        const progress = await readFormProgress(page);
        limitations.push(
          `필수 문항 검증으로 ${progress ? `${progress.current}/${progress.total}` : screenshots.length}페이지 이후 이동이 막혔습니다. 이름·연락처 등 신원 텍스트는 입력하지 않았고 제출도 하지 않았습니다. 연령·근속·직군·직급 화면이 포함되지 않았다면 ‘추가 캡처 첨부’로 넣어 주세요.`,
        );
        break;
      }

      const navSafety = await safeUrlCheck(page.url());
      if (!navSafety.safe) {
        limitations.push(
          "다음 페이지 이동 후 URL 보안 검사를 통과하지 못해 추가 캡처를 중단했습니다.",
        );
        break;
      }

      await sleep(SETTLE_MS);
      const liveProgress = await readFormProgress(page);
      const captureIndex = liveProgress?.current ?? pageNo;
      await captureCurrent(captureIndex);

      const progress = liveProgress ?? (await readFormProgress(page));
      if (progress && progress.current >= progress.total) {
        limitations.push(
          `마지막 페이지(${progress.current}/${progress.total})까지 캡처했습니다.`,
        );
        const hasNext = await markNextButton(page);
        if (!hasNext) break;
        const isSubmitNext = await page.evaluate(() => {
          const el = document.querySelector(
            "[data-sure-next-candidate='1']",
          ) as HTMLElement | null;
          const label = (
            el?.innerText ||
            el?.getAttribute("aria-label") ||
            ""
          ).replace(/\s+/g, " ");
          return /제출|보내기|submit|submit form/i.test(label);
        });
        await page
          .evaluate(() => {
            document
              .querySelectorAll("[data-sure-next-candidate]")
              .forEach((el) => el.removeAttribute("data-sure-next-candidate"));
          })
          .catch(() => undefined);
        if (isSubmitNext) break;
      }
    }

    if (usedSoftUnlock) {
      limitations.push(
        "페이지 이동을 위해 의견·척도형·인구통계(연령/근속/직군/직급) 선택형만 최소 선택했습니다. 이름·연락처 등 신원 텍스트는 넣지 않았고 최종 제출도 하지 않았습니다.",
      );
    }

    const hasDemoShot = screenshots.some((s) =>
      /인구통계|연령|근속|직군|직급/.test(s.label),
    );
    if (!hasDemoShot) {
      limitations.push(
        "연령·근속기간·직군·직급 화면이 캡처에 포함되지 않았을 수 있습니다. ZIP의 화면캡처를 확인하고 없으면 ‘추가 캡처 첨부’로 해당 페이지를 넣어 주세요.",
      );
    } else {
      limitations.push(
        "연령·근속·직군·직급 등 인구통계 문항 화면이 캡처에 포함되었습니다.",
      );
    }

    if (screenshots.length >= maxPages) {
      limitations.push(
        `최대 ${maxPages}장까지 캡처했습니다. 더 있으면 추가 캡처 첨부를 이용해 주세요.`,
      );
    }

    const missing = priorities.filter(
      (p) =>
        !capturedPriorityKeys.has(
          `${p.pageIndex}::${p.questionText.slice(0, 40)}`,
        ),
    );
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 3)
        .map((m) => `「${m.questionText.slice(0, 28)}」`)
        .join(", ");
      limitations.push(
        `화면에 확인되지 않은 개인정보·민감정보 문항 ${missing.length}개: ${sample}${missing.length > 3 ? " 외" : ""}.`,
      );
    }

    // Keep page order; drop duplicate ids (branch backtrack can recapture)
    const byId = new Map<string, AutoScreenshotPayload>();
    for (const shot of screenshots) byId.set(shot.id, shot);
    const unique = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    screenshots.length = 0;
    screenshots.push(...unique);

    limitations.push(`총 ${screenshots.length}장 캡처했습니다.`);

    return {
      success: screenshots.length > 0,
      screenshots,
      limitations,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 캡처 오류";
    return {
      success: false,
      screenshots: [],
      limitations: [
        "자동 화면 캡처에 실패했습니다.",
        "설문 페이지가 접근을 차단했거나 로딩 시간이 초과되었습니다.",
        `상세: ${message.slice(0, 240)}`,
      ],
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
