import type { Page } from "puppeteer-core";
import {
  CAPTURE_NETWORK_IDLE_MS,
  CAPTURE_PAGE_LOAD_TIMEOUT_MS,
  CAPTURE_SETTLE_MS,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import { applyKoreanFontsToPage } from "@/lib/evidence/capture/koreanFonts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * tsx/esbuild keepNames injects `__name` into serialized evaluate callbacks.
 * Install a no-op so capture works under both Next and tsx.
 */
export async function installEvaluateNameHelper(page: Page): Promise<void> {
  const source = `(() => {
    const g = globalThis;
    if (typeof g.__name !== "function") {
      g.__name = function (fn) { return fn; };
    }
  })()`;
  await page.evaluateOnNewDocument(source).catch(() => undefined);
  await page.evaluate(source).catch(() => undefined);
}

/**
 * Nudge lazy-rendered survey content into view before screenshot.
 * Scrolls gently; does not fill inputs or submit.
 */
export async function scrollForLazyRender(page: Page): Promise<void> {
  const serverless = isServerlessCaptureRuntime();
  await page
    .evaluate(
      async (serverlessMode) => {
        const sleep = (ms: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, ms));
        const maxY = Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0,
          1,
        );
        // Cap scroll work on serverless so screenshot budget remains.
        const hardCap = serverlessMode
          ? Math.min(maxY, window.innerHeight * 4)
          : maxY;
        const step = Math.max(
          serverlessMode ? 420 : 280,
          Math.floor(window.innerHeight * (serverlessMode ? 0.9 : 0.75)),
        );
        const pause = serverlessMode ? 40 : 80;
        let steps = 0;
        const maxSteps = serverlessMode ? 6 : 40;
        for (let y = 0; y < hardCap && steps < maxSteps; y += step) {
          window.scrollTo(0, y);
          await sleep(pause);
          steps += 1;
        }
        window.scrollTo(0, Math.min(hardCap, maxY));
        await sleep(serverlessMode ? 60 : 120);
        window.scrollTo(0, 0);
        await sleep(serverlessMode ? 50 : 100);
      },
      serverless,
    )
    .catch(() => undefined);
}

export async function prepareCapturePage(page: Page): Promise<void> {
  await installEvaluateNameHelper(page);
  // Stock Chrome UA on serverless — a custom suffix can keep Google Forms on
  // an empty freebird shell (no questions / Next) from datacenter IPs.
  const ua = isServerlessCaptureRuntime()
    ? "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SURECheckEvidenceCapture/1.0";
  await page.setUserAgent(ua);
  await page
    .setExtraHTTPHeaders({
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    .catch(() => undefined);
  if (isServerlessCaptureRuntime()) {
    await page
      .evaluateOnNewDocument(() => {
        try {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });
        } catch {
          // ignore
        }
      })
      .catch(() => undefined);
  }
}

export async function gotoSurveyPage(
  page: Page,
  url: string,
): Promise<{ ok: boolean; status?: number; limitation?: string }> {
  try {
    const isGoogleForms = /docs\.google\.com\/forms|forms\.gle/i.test(url);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: isGoogleForms
        ? Math.max(CAPTURE_PAGE_LOAD_TIMEOUT_MS, 25_000)
        : CAPTURE_PAGE_LOAD_TIMEOUT_MS,
    });
    const status = response?.status();
    if (!response || (status !== undefined && status >= 400)) {
      return {
        ok: false,
        status,
        limitation: `설문 페이지 HTTP 상태 ${status ?? "unknown"}로 접근이 제한되었을 수 있습니다.`,
      };
    }

    await page
      .waitForNetworkIdle({
        idleTime: isGoogleForms ? 800 : 300,
        timeout: isServerlessCaptureRuntime()
          ? Math.max(
              CAPTURE_NETWORK_IDLE_MS,
              isGoogleForms ? 8_000 : 3_500,
            )
          : isGoogleForms
            ? Math.max(CAPTURE_NETWORK_IDLE_MS, 5_000)
            : CAPTURE_NETWORK_IDLE_MS,
      })
      .catch(() => undefined);
    await sleep(
      isServerlessCaptureRuntime()
        ? Math.max(CAPTURE_SETTLE_MS, isGoogleForms ? 800 : 450)
        : isGoogleForms
          ? Math.max(CAPTURE_SETTLE_MS, 700)
          : CAPTURE_SETTLE_MS,
    );
    // Defer Hangul injection for heavy SPAs — ~0.7MB CSS before paint can
    // destabilize @sparticuz/chromium (esp. Naver Form #content shell).
    const isNaverForm = /form\.naver\.com/i.test(url);
    if (!isGoogleForms && !isNaverForm) {
      await applyKoreanFontsToPage(page);
    }

    if (/moaform\.com|surveyl\.ink|answer\.moaform\.com/i.test(url)) {
      await page
        .waitForSelector("button.AnswerButton, form, [class*='question']", {
          timeout: 5_000,
        })
        .catch(() => undefined);
      await sleep(300);
      // Moaform redirects start → gateway → answer SPA; a second idle wait
      // reduces Session/Connection closed on the first serverless screenshot.
      await page
        .waitForNetworkIdle({
          idleTime: 400,
          timeout: isServerlessCaptureRuntime() ? 4_000 : 2_500,
        })
        .catch(() => undefined);
      await sleep(isServerlessCaptureRuntime() ? 600 : 250);
    }

    if (isNaverForm) {
      await page
        .waitForSelector(
          ".question_area, .questionnaire_item, #content.questionnaire, button, [role='button']",
          { timeout: isServerlessCaptureRuntime() ? 8_000 : 4_000 },
        )
        .catch(() => undefined);
      await sleep(isServerlessCaptureRuntime() ? 500 : 300);
    }

    if (isGoogleForms) {
      await page
        .waitForSelector(
          ".freebirdFormviewerViewFormContent, .freebirdFormviewerViewItemsItemItem, [role='listitem']",
          { timeout: isServerlessCaptureRuntime() ? 8_000 : 5_000 },
        )
        .catch(() => undefined);
    }

    await scrollForLazyRender(page);
    await sleep(CAPTURE_SETTLE_MS);

    return { ok: true, status };
  } catch {
    return {
      ok: false,
      limitation: "설문 페이지 로딩 시간이 초과되었습니다.",
    };
  }
}
