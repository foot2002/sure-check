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

/**
 * Launch @sparticuz/chromium with the upstream-recommended shell headless mode.
 * Graphics must stay enabled — disabling WebGL leaves Google Forms on an empty
 * freebird shell (progress bar only, no questions / Next).
 */
async function launchServerlessChromium(options?: {
  headless?: boolean;
}): Promise<Browser> {
  await ensureServerlessKoreanFonts();

  const chromium = await import("@sparticuz/chromium");
  // Default is true; keep WebGL/SwiftShader available for SPA form viewers.
  chromium.default.setGraphicsMode = true;

  const executablePath = await chromium.default.executablePath();
  const useHeadful = options?.headless === false;
  const headlessMode = useHeadful ? false : ("shell" as const);

  const baseArgs = Array.isArray(chromium.default.args)
    ? chromium.default.args
    : [];
  const args = await puppeteer.defaultArgs({
    args: [
      ...baseArgs,
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      "--hide-scrollbars",
      "--disable-blink-features=AutomationControlled",
      // Help Material/Google apps paint under serverless Chromium.
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
    headless: headlessMode === false ? false : "shell",
  });

  return puppeteer.launch({
    args,
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
