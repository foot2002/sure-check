import { existsSync } from "fs";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import {
  CAPTURE_SERVERLESS_VIEWPORT,
  CAPTURE_VIEWPORT,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import { ensureServerlessKoreanFonts } from "@/lib/evidence/capture/koreanFonts";

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

function buildServerlessArgs(chromiumArgs: string[]): string[] {
  const args = chromiumArgs.filter((arg) => {
    const a = String(arg);
    // Launch option owns headless mode — drop duplicated flags from chromium.args.
    if (/^--headless(=|$)/i.test(a)) return false;
    return true;
  });

  args.push(
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--disable-blink-features=AutomationControlled",
  );
  return args;
}

/**
 * Launch @sparticuz/chromium for survey capture.
 *
 * Google Forms on Vercel requires headless "shell" (not `true` / new headless)
 * and graphics/WebGL enabled. Keep chromium `--single-process` — removing it
 * can hang browser launch on Vercel until the function times out.
 */
async function launchServerlessChromium(options?: {
  headless?: boolean;
}): Promise<Browser> {
  await ensureServerlessKoreanFonts();

  const chromium = await import("@sparticuz/chromium");
  chromium.default.setGraphicsMode = true;

  const executablePath = await chromium.default.executablePath();
  const useHeadful = options?.headless === false;
  const headlessMode = useHeadful ? false : ("shell" as const);
  const rawArgs = Array.isArray(chromium.default.args)
    ? chromium.default.args.map(String)
    : [];

  return puppeteer.launch({
    args: buildServerlessArgs(rawArgs),
    defaultViewport: CAPTURE_SERVERLESS_VIEWPORT,
    executablePath,
    headless: headlessMode,
  });
}

export async function launchCaptureBrowser(options?: {
  headless?: boolean;
}): Promise<Browser> {
  const headless = options?.headless !== false;

  if (isServerlessCaptureRuntime()) {
    return launchServerlessChromium(options);
  }

  const localChrome = findLocalChrome();
  if (localChrome) {
    return puppeteer.launch({
      executablePath: localChrome,
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
      defaultViewport: CAPTURE_VIEWPORT,
    });
  }

  if (process.platform === "win32" || process.platform === "darwin") {
    throw new Error(
      "로컬 Chrome/Edge 실행 파일을 찾지 못했습니다. Chrome을 설치하거나 환경변수 PUPPETEER_EXECUTABLE_PATH를 설정하세요.",
    );
  }

  return launchServerlessChromium(options);
}
