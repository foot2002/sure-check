import type { Page } from "puppeteer-core";
import {
  CAPTURE_NETWORK_IDLE_MS,
  CAPTURE_PAGE_LOAD_TIMEOUT_MS,
  CAPTURE_SETTLE_MS,
} from "@/lib/evidence/capture/captureConfig";

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

export async function prepareCapturePage(page: Page): Promise<void> {
  await installEvaluateNameHelper(page);
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SURECheckEvidenceCapture/1.0",
  );
}

export async function gotoSurveyPage(
  page: Page,
  url: string,
): Promise<{ ok: boolean; status?: number; limitation?: string }> {
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: CAPTURE_PAGE_LOAD_TIMEOUT_MS,
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
        idleTime: 400,
        timeout: CAPTURE_NETWORK_IDLE_MS,
      })
      .catch(() => undefined);
    await sleep(CAPTURE_SETTLE_MS);

    if (/moaform\.com|surveyl\.ink/i.test(url)) {
      await page
        .waitForSelector("button.AnswerButton", { timeout: 5_000 })
        .catch(() => undefined);
      await sleep(300);
    }

    return { ok: true, status };
  } catch {
    return {
      ok: false,
      limitation: "설문 페이지 로딩 시간이 초과되었습니다.",
    };
  }
}
