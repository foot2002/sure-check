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
 * Regular weight only (keeps payload ~half) — unicode-range keeps Latin on Open Sans.
 */
export function buildKoreanFontCss(): string {
  if (cachedCss !== null) return cachedCss;

  const regular = readWoff2Base64("noto-sans-kr-korean-400-normal.woff2");
  if (!regular) {
    cachedCss = "";
    return cachedCss;
  }

  const hangulRange =
    "U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7A3, U+D7B0-D7FF";

  cachedCss = [
    `@font-face{font-family:'SURECheckKR';font-style:normal;font-weight:400;font-display:swap;unicode-range:${hangulRange};src:url(data:font/woff2;base64,${regular}) format('woff2');}`,
    `@font-face{font-family:'SURECheckKR';font-style:normal;font-weight:700;font-display:swap;unicode-range:${hangulRange};src:url(data:font/woff2;base64,${regular}) format('woff2');}`,
    // Prefer inheritance over `body * !important` so Material/Google nav
    // buttons keep their layout metrics on serverless Chromium.
    `html,body{font-family:'SURECheckKR','Noto Sans KR','Open Sans','Malgun Gothic',sans-serif !important;}`,
    `.freebirdFormviewerViewFormCard,.freebirdFormviewerViewFormContent,.freebirdFormviewerComponentsQuestionBaseTitle,.M7eMe,[role='listitem'],[role='heading'],.Qr7Oae,p,span,div,label,li{font-family:'SURECheckKR','Noto Sans KR','Open Sans','Malgun Gothic',sans-serif !important;}`,
  ].join("\n");
  return cachedCss;
}

export async function ensureServerlessKoreanFonts(): Promise<void> {
  if (!isServerlessCaptureRuntime() || systemFontsReady) return;

  const destDir = join(tmpdir(), "fonts");
  mkdirSync(destDir, { recursive: true });
  process.env.FONTCONFIG_PATH = destDir;
  process.env.HOME ??= tmpdir();

  const dir = resolveFontsourceDir();
  if (dir) {
    const src = join(dir, "noto-sans-kr-korean-400-normal.woff");
    const dest = join(destDir, "noto-sans-kr-korean-400-normal.woff");
    if (existsSync(src) && !existsSync(dest)) {
      writeFileSync(dest, readFileSync(src));
    }
  }

  systemFontsReady = true;
}

/**
 * Inject embedded Hangul fonts once per page document.
 * Re-injecting ~0.7MB CSS on every screenshot was blowing the per-page timeout on Vercel.
 */
export async function applyKoreanFontsToPage(page: Page): Promise<void> {
  const css = buildKoreanFontCss();
  if (!css) return;

  const already = await page
    .evaluate(() =>
      Boolean(
        (globalThis as unknown as { __sureCheckKrFonts?: boolean })
          .__sureCheckKrFonts,
      ),
    )
    .catch(() => false);
  if (already) return;

  await page.addStyleTag({ content: css }).catch(() => undefined);

  await page
    .evaluate(async () => {
      try {
        (
          globalThis as unknown as { __sureCheckKrFonts?: boolean }
        ).__sureCheckKrFonts = true;
        await document.fonts.load('400 16px "SURECheckKR"');
        await document.fonts.ready;
      } catch {
        // ignore
      }
    })
    .catch(() => undefined);

  await new Promise((r) => setTimeout(r, 150));
}
