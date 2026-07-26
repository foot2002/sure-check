import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Page } from "puppeteer-core";
import { isServerlessCaptureRuntime } from "@/lib/evidence/capture/captureConfig";

let cachedCss: string | null = null;
let systemFontsReady = false;

function resolveFontsourceDir(): string | null {
  const candidates = [
    join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      "noto-sans-kr",
      "files",
    ),
    // Vercel sometimes resolves from the function tracing root
    join(
      process.cwd(),
      ".next",
      "server",
      "node_modules",
      "@fontsource",
      "noto-sans-kr",
      "files",
    ),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

function readWoff2Base64(fileName: string): string | null {
  const dir = resolveFontsourceDir();
  if (!dir) return null;
  const full = join(dir, fileName);
  if (!existsSync(full)) return null;
  return readFileSync(full).toString("base64");
}

/**
 * Build CSS that registers Hangul-capable faces as data-URIs.
 * unicode-range keeps Latin on Chromium's bundled Open Sans.
 */
export function buildKoreanFontCss(): string {
  if (cachedCss !== null) return cachedCss;

  const regular = readWoff2Base64("noto-sans-kr-korean-400-normal.woff2");
  const bold = readWoff2Base64("noto-sans-kr-korean-700-normal.woff2");
  if (!regular) {
    cachedCss = "";
    return cachedCss;
  }

  const hangulRange =
    "U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7A3, U+D7B0-D7FF";

  const faces = [
    `@font-face{font-family:'SURECheckKR';font-style:normal;font-weight:400;font-display:block;unicode-range:${hangulRange};src:url(data:font/woff2;base64,${regular}) format('woff2');}`,
  ];
  if (bold) {
    faces.push(
      `@font-face{font-family:'SURECheckKR';font-style:normal;font-weight:700;font-display:block;unicode-range:${hangulRange};src:url(data:font/woff2;base64,${bold}) format('woff2');}`,
    );
  }
  faces.push(
    `html,body,body *:not(script):not(style):not(noscript){font-family:'SURECheckKR','Noto Sans KR','Open Sans','Malgun Gothic',sans-serif !important;}`,
  );

  cachedCss = faces.join("\n");
  return cachedCss;
}

/**
 * Install Hangul fonts into /tmp/fonts for Chromium fontconfig fallback.
 * Primary rendering still uses page-injected @font-face (more reliable).
 */
export async function ensureServerlessKoreanFonts(): Promise<void> {
  if (!isServerlessCaptureRuntime() || systemFontsReady) return;

  const destDir = join(tmpdir(), "fonts");
  mkdirSync(destDir, { recursive: true });
  process.env.FONTCONFIG_PATH = destDir;
  process.env.HOME ??= tmpdir();

  const dir = resolveFontsourceDir();
  if (dir) {
    for (const name of [
      "noto-sans-kr-korean-400-normal.woff",
      "noto-sans-kr-korean-700-normal.woff",
    ]) {
      const src = join(dir, name);
      const dest = join(destDir, name);
      if (existsSync(src) && !existsSync(dest)) {
        writeFileSync(dest, readFileSync(src));
      }
    }
  }

  systemFontsReady = true;
}

/**
 * Inject embedded Hangul fonts into the live page and wait until they load.
 * Call immediately before taking a screenshot on serverless (and safe on local).
 */
export async function applyKoreanFontsToPage(page: Page): Promise<void> {
  const css = buildKoreanFontCss();
  if (!css) return;

  await page.addStyleTag({ content: css }).catch(() => undefined);

  await page
    .evaluate(async () => {
      try {
        await Promise.all([
          document.fonts.load('400 16px "SURECheckKR"'),
          document.fonts.load('700 16px "SURECheckKR"'),
        ]);
        await document.fonts.ready;
      } catch {
        // ignore — screenshot still proceeds
      }
    })
    .catch(() => undefined);

  await new Promise((r) => setTimeout(r, 250));
}
