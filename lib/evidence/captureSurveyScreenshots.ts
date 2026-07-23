import { existsSync } from "fs";
import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";
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
const MAX_PAGES = 5;
const NAV_TIMEOUT_MS = 45_000;
const SETTLE_MS = 1_800;

const NEXT_LABEL =
  /^(다음|다음\s*페이지|계속|다음으로|next|continue|다음\s*단계)$/i;
const FORBIDDEN_LABEL =
  /제출|보내기|완료|등록|확인\s*및\s*제출|submit|send|finish|done|로그인|login|sign\s*in/i;
const VALIDATION_HINT =
  /필수|required|입력해\s*주세요|선택해\s*주세요|작성해\s*주세요|답변해\s*주세요|이\s*질문은\s*필수/i;

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

  // Serverless / Linux: @sparticuz/chromium
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

async function pageHasValidationError(page: Page): Promise<boolean> {
  return page.evaluate((hintSource) => {
    const hint = new RegExp(hintSource, "i");
    const nodes = Array.from(
      document.querySelectorAll(
        '[aria-invalid="true"], .error, .invalid, [role="alert"], [class*="error"], [class*="Error"], [class*="required"]',
      ),
    );
    for (const node of nodes) {
      const text = (node.textContent || "").trim();
      if (text && hint.test(text) && text.length < 200) return true;
    }
    const body = (document.body?.innerText || "").slice(0, 4000);
    return hint.test(body) && /필수|required/i.test(body);
  }, VALIDATION_HINT.source);
}

async function findSafeNextButton(page: Page): Promise<boolean> {
  return page.evaluate(
    (nextSource, forbiddenSource) => {
      const nextRe = new RegExp(nextSource, "i");
      const forbiddenRe = new RegExp(forbiddenSource, "i");
      const candidates = Array.from(
        document.querySelectorAll("button, a, [role='button'], input[type='button']"),
      );

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
        if (!label || label.length > 40) continue;
        if (forbiddenRe.test(label)) continue;
        if (!nextRe.test(label)) continue;
        if (
          htmlEl.hasAttribute("disabled") ||
          htmlEl.getAttribute("aria-disabled") === "true"
        ) {
          continue;
        }
        const style = window.getComputedStyle(htmlEl);
        if (style.display === "none" || style.visibility === "hidden") continue;
        htmlEl.setAttribute("data-sure-next-candidate", "1");
        return true;
      }
      return false;
    },
    NEXT_LABEL.source,
    FORBIDDEN_LABEL.source,
  );
}

async function clickSafeNext(page: Page): Promise<"moved" | "blocked" | "none"> {
  const found = await findSafeNextButton(page);
  if (!found) return "none";

  const beforeUrl = page.url();
  const beforeTitle = await page.title();
  const beforeText = await page.evaluate(() =>
    (document.body?.innerText || "").slice(0, 1200),
  );

  await page.click('[data-sure-next-candidate="1"]').catch(() => undefined);
  await sleep(SETTLE_MS);

  if (await pageHasValidationError(page)) {
    return "blocked";
  }

  const afterUrl = page.url();
  const afterTitle = await page.title();
  const afterText = await page.evaluate(() =>
    (document.body?.innerText || "").slice(0, 1200),
  );

  const moved =
    afterUrl !== beforeUrl ||
    afterTitle !== beforeTitle ||
    afterText !== beforeText;

  // Clear marker for next iteration
  await page
    .evaluate(() => {
      document
        .querySelectorAll("[data-sure-next-candidate]")
        .forEach((el) => el.removeAttribute("data-sure-next-candidate"));
    })
    .catch(() => undefined);

  return moved ? "moved" : "none";
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
}): Promise<CaptureSurveyResult> {
  const limitations: string[] = [];
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

  // metadata / link-local style hosts already blocked via private IP; extra hostname checks
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

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SURECheckEvidenceCapture/1.0",
    );

    const response = await page.goto(safety.normalizedUrl, {
      waitUntil: ["domcontentloaded", "networkidle2"],
      timeout: NAV_TIMEOUT_MS,
    });

    if (!response || response.status() >= 400) {
      limitations.push(
        `설문 페이지 HTTP 상태 ${response?.status() ?? "unknown"}로 접근이 제한되었을 수 있습니다.`,
      );
    }

    await sleep(SETTLE_MS);

    const screenshots: AutoScreenshotPayload[] = [];
    screenshots.push(
      await capturePage(
        page,
        1,
        "첫 공개 설문 화면",
        "auto_screenshot_01_first_public_page.png",
      ),
    );

    for (let pageNo = 2; pageNo <= MAX_PAGES; pageNo += 1) {
      const result = await clickSafeNext(page);
      if (result === "none") break;
      if (result === "blocked") {
        limitations.push(
          "2페이지 이후 문항은 필수응답이 필요해 자동 화면 캡처를 진행하지 않았습니다. 임의 응답 입력이나 제출은 수행하지 않았습니다.",
        );
        break;
      }

      // Re-check URL safety after navigation (redirect to private host)
      const navSafety = await safeUrlCheck(page.url());
      if (!navSafety.safe) {
        limitations.push(
          "다음 페이지 이동 후 URL 보안 검사를 통과하지 못해 추가 캡처를 중단했습니다.",
        );
        break;
      }

      const padded = String(pageNo).padStart(2, "0");
      screenshots.push(
        await capturePage(
          page,
          pageNo,
          `입력 없이 이동한 ${pageNo}페이지 화면`,
          `auto_screenshot_${padded}_accessible_next_page.png`,
        ),
      );
    }

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
