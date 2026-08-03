import {
  copyFileSync,
  chmodSync,
  existsSync,
  statSync,
  unlinkSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import {
  CAPTURE_SERVERLESS_VIEWPORT,
  CAPTURE_VIEWPORT,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import { ensureServerlessKoreanFonts } from "@/lib/evidence/capture/koreanFonts";

/** Inflated @sparticuz/chromium is ~180–200MB; fragments are far smaller. */
const MIN_CHROMIUM_BYTES = 80_000_000;
const LAUNCH_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBusySpawnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; errno?: number };
  const message = String(e.message || err);
  return (
    e.code === "ETXTBSY" ||
    e.errno === -26 ||
    /ETXTBSY/i.test(message) ||
    /text file busy/i.test(message)
  );
}

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

function defaultChromiumPath(): string {
  return join(tmpdir(), "chromium");
}

function unlinkQuiet(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* ignore */
  }
}

/**
 * Drop truncated /tmp/chromium left by a crashed mid-extract (Vercel Fluid race).
 * @sparticuz/chromium returns the path as soon as the file exists — even at 0 bytes.
 */
function dropTruncatedChromiumBinary(): void {
  const path = defaultChromiumPath();
  if (!existsSync(path)) return;
  try {
    const size = statSync(path).size;
    if (size < MIN_CHROMIUM_BYTES) {
      unlinkQuiet(path);
    }
  } catch {
    unlinkQuiet(path);
  }
}

/**
 * Wait until the extracted binary is large enough and size stops changing.
 * Concurrent Fluid invocations otherwise exec a partially-written file → ETXTBSY.
 */
async function waitUntilChromiumReady(path: string): Promise<void> {
  let lastSize = -1;
  let stableHits = 0;

  for (let i = 0; i < 80; i += 1) {
    if (!existsSync(path)) {
      stableHits = 0;
      lastSize = -1;
      await sleep(250);
      continue;
    }

    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      await sleep(250);
      continue;
    }

    if (size >= MIN_CHROMIUM_BYTES && size === lastSize) {
      stableHits += 1;
      if (stableHits >= 2) return;
    } else {
      stableHits = 0;
    }
    lastSize = size;
    await sleep(250);
  }

  const finalSize = existsSync(path) ? statSync(path).size : 0;
  if (finalSize < MIN_CHROMIUM_BYTES) {
    unlinkQuiet(path);
    throw new Error(
      `Chromium 바이너리 추출이 완료되지 않았습니다 (${finalSize} bytes).`,
    );
  }
}

/** Process-wide single-flight: one extract at a time on Vercel Fluid. */
let chromiumPathFlight: Promise<string> | null = null;

/** Serialize launches so two captures never spawn the same busy binary. */
let launchChain: Promise<unknown> = Promise.resolve();

async function resolveServerlessChromiumPath(): Promise<string> {
  if (!chromiumPathFlight) {
    chromiumPathFlight = (async () => {
      dropTruncatedChromiumBinary();
      const chromium = await import("@sparticuz/chromium");
      chromium.default.setGraphicsMode = true;
      const executablePath = await chromium.default.executablePath();
      await waitUntilChromiumReady(executablePath);
      return executablePath;
    })().catch((err) => {
      chromiumPathFlight = null;
      throw err;
    });
  }
  return chromiumPathFlight;
}

function invalidateChromiumCache(): void {
  chromiumPathFlight = null;
  dropTruncatedChromiumBinary();
}

async function launchFromPath(
  executablePath: string,
  options?: { headless?: boolean },
): Promise<Browser> {
  const chromium = await import("@sparticuz/chromium");
  chromium.default.setGraphicsMode = true;
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

/**
 * Last-resort: copy the binary so spawn does not race a writer on /tmp/chromium.
 */
function copyChromiumForSpawn(source: string): string {
  const dest = join(
    tmpdir(),
    `chromium-run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  copyFileSync(source, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    /* Windows / restricted FS */
  }
  return dest;
}

/**
 * Launch @sparticuz/chromium for survey capture.
 *
 * Google Forms on Vercel requires headless "shell" (not `true` / new headless)
 * and graphics/WebGL enabled. Keep chromium `--single-process` — removing it
 * can hang browser launch on Vercel until the function times out.
 *
 * Vercel Fluid Compute shares /tmp across concurrent invocations; without
 * single-flight + size checks, puppeteer hits `spawn ETXTBSY` on a partial binary.
 */
async function launchServerlessChromium(options?: {
  headless?: boolean;
}): Promise<Browser> {
  await ensureServerlessKoreanFonts();

  const run = async (): Promise<Browser> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < LAUNCH_RETRIES; attempt += 1) {
      let copiedPath: string | null = null;
      try {
        const executablePath = await resolveServerlessChromiumPath();
        const launchPath =
          attempt >= 2 ? copyChromiumForSpawn(executablePath) : executablePath;
        if (launchPath !== executablePath) copiedPath = launchPath;
        return await launchFromPath(launchPath, options);
      } catch (err) {
        lastError = err;
        if (!isBusySpawnError(err) && attempt === 0) {
          // Non-busy first failure: still retry once after cache invalidate
          // (corrupt leftover binary), then rethrow.
        }
        if (!isBusySpawnError(err) && attempt >= 1) {
          throw err;
        }
        invalidateChromiumCache();
        await sleep(400 * (attempt + 1));
      } finally {
        if (copiedPath) {
          // Leave copy for the browser process lifetime; clean best-effort later.
          // Unlinking while Chrome is starting can recreate ETXTBSY.
        }
      }
    }
    const detail =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `브라우저 실행에 실패했습니다 (Chromium busy/추출 충돌). 잠시 후 다시 시도해 주세요. 상세: ${detail.slice(0, 180)}`,
    );
  };

  const launched = launchChain.then(run, run);
  launchChain = launched.then(
    () => undefined,
    () => undefined,
  );
  return launched;
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
