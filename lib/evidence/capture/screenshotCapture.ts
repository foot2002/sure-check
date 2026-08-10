import type { Page } from "puppeteer-core";
import {
  CAPTURE_SERVERLESS_JPEG_QUALITY,
  CAPTURE_SERVERLESS_VIEWPORT,
  CAPTURE_VIEWPORT,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import type {
  CaptureMode,
  CaptureScreenshot,
} from "@/lib/evidence/capture/captureTypes";
import { applyKoreanFontsToPage } from "@/lib/evidence/capture/koreanFonts";
import { formatKstDateTime } from "@/lib/evidence/sanitizeFilename";

export function captureLabelFor(
  pageNo: number,
  mode: CaptureMode = "safe_public_only",
  ext: "png" | "jpg" = "png",
): {
  label: string;
  fileName: string;
} {
  const padded = String(pageNo).padStart(2, "0");
  if (mode === "evidence_full_walkthrough") {
    return {
      label: `신고용 증빙 캡처 ${pageNo}페이지`,
      fileName: `page_${padded}.${ext}`,
    };
  }
  if (pageNo === 1) {
    return {
      label: "첫 공개 설문 화면",
      fileName: `auto_screenshot_01_first_public_page.${ext}`,
    };
  }
  return {
    label: `입력 없이 이동한 ${pageNo}페이지 화면`,
    fileName: `auto_screenshot_${padded}_page.${ext}`,
  };
}

/** Recoverable CDP failures during screenshot (page/target gone mid-capture). */
export function isRecoverableCdpError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Target closed|Session closed|Connection closed|Browser\.(disconnected|close)|Execution context was destroyed|Execution context is not available|frame was detached|detached frame|Protocol error.*[Ss]creenshot|Most likely the page has been closed|Navigating frame was detached/i.test(
    message,
  );
}

function isMoaformCaptureUrl(url: string): boolean {
  return /moaform\.com|surveyl\.ink|answer\.moaform\.com/i.test(url);
}

async function expandScrollRegions(
  page: Page,
  serverless: boolean,
): Promise<void> {
  await page
    .evaluate((serverlessMode) => {
      // Naver Form uses #content.questionnaire as the app shell. Forcing
      // height:auto there + fullPage screenshot crashes @sparticuz/chromium
      // (Page.captureScreenshot → Target closed) on Vercel.
      const selectors = serverlessMode
        ? [
            "html",
            "body",
            ".freebirdFormviewerViewFormCard",
            ".freebirdFormviewerViewFormContent",
            ".freebirdFormviewerViewResponsePage",
            "[role='list']",
            ".js-question",
            ".question_area",
            ".questionnaire_item",
          ]
        : [
            "html",
            "body",
            ".freebirdFormviewerViewFormCard",
            ".freebirdFormviewerViewFormContent",
            ".freebirdFormviewerViewResponsePage",
            "[role='list']",
            ".js-question",
            "#content",
            ".questionnaire",
            ".question_area",
            ".questionnaire_item",
          ];
      for (const sel of selectors) {
        for (const node of Array.from(document.querySelectorAll(sel))) {
          const el = node as HTMLElement;
          if (
            el.closest(
              ".freebirdFormviewerViewNavigationNavControls, .freebirdFormviewerViewNavigationButtons, [jsname='OCpkoe'], [jsname='M2UYVd']",
            )
          ) {
            continue;
          }
          // Never mutate Naver's top-level questionnaire shell on serverless.
          if (
            serverlessMode &&
            (el.id === "content" ||
              /\bquestionnaire\b/i.test(el.className || ""))
          ) {
            continue;
          }
          el.style.setProperty("height", "auto", "important");
          el.style.setProperty("max-height", "none", "important");
          el.style.setProperty("overflow", "visible", "important");
        }
      }
      void document.body?.offsetHeight;
    }, serverless)
    .catch(() => undefined);
}

async function takeServerlessScreenshot(
  page: Page,
  options?: { evidenceOnly?: boolean },
): Promise<Buffer> {
  const quality = CAPTURE_SERVERLESS_JPEG_QUALITY;
  // Evidence-first: viewport JPEG first (usable proof), then optional fullPage.
  // Blind fullPage-first often closes Chromium on long SPA shells before any
  // bytes land — prefer partial success over empty timeout.
  const attempts: Array<{
    fullPage: boolean;
    captureBeyondViewport: boolean;
  }> = options?.evidenceOnly
    ? [{ fullPage: false, captureBeyondViewport: false }]
    : [
        { fullPage: false, captureBeyondViewport: false },
        { fullPage: true, captureBeyondViewport: false },
      ];

  let lastError: unknown;
  let viewportBuffer: Buffer | null = null;
  for (const opts of attempts) {
    try {
      if (page.isClosed()) {
        throw new Error(
          "Protocol error (Page.captureScreenshot): Session closed. Most likely the page has been closed.",
        );
      }
      const viewport = page.viewport();
      const raw =
        !opts.fullPage && viewport
          ? await page.screenshot({
              type: "jpeg",
              quality,
              // Explicit clip avoids some @sparticuz/chromium Session closed
              // crashes on Moaform SPA shells during default viewport shots.
              clip: {
                x: 0,
                y: 0,
                width: Math.max(1, viewport.width),
                height: Math.max(1, viewport.height),
              },
              captureBeyondViewport: false,
            })
          : await page.screenshot({
              type: "jpeg",
              quality,
              fullPage: opts.fullPage,
              captureBeyondViewport: opts.captureBeyondViewport,
            });
      const buffer = Buffer.from(raw);
      if (!opts.fullPage) {
        viewportBuffer = buffer;
        // Keep going for fullPage when cheap; if it fails we still have proof.
        continue;
      }
      return buffer;
    } catch (error) {
      lastError = error;
      if (isRecoverableCdpError(error)) {
        if (viewportBuffer) return viewportBuffer;
        throw error;
      }
      // Non-fatal protocol quirks: try next strategy.
      continue;
    }
  }
  if (viewportBuffer) return viewportBuffer;
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "screenshot failed"));
}

export async function captureFullPage(
  page: Page,
  pageNo: number,
  mode: CaptureMode = "safe_public_only",
  options?: { evidenceOnly?: boolean },
): Promise<CaptureScreenshot> {
  const serverless = isServerlessCaptureRuntime();
  const ext = serverless ? "jpg" : "png";
  const { label, fileName } = captureLabelFor(pageNo, mode, ext);
  const capturedAt = new Date();
  const earlyUrl = page.isClosed() ? "" : page.url();
  const moaform = isMoaformCaptureUrl(earlyUrl);

  // Hangul glyphs are missing on serverless Chromium unless we inject fonts.
  // Moaform already receives fonts in gotoSurveyPage; re-injecting + expanding
  // scroll shells on answer.moaform.com SPAs can close @sparticuz/chromium
  // before the first viewport JPEG lands.
  if (!(serverless && moaform)) {
    await applyKoreanFontsToPage(page);
  }
  if (!(serverless && moaform)) {
    await expandScrollRegions(page, serverless);
  } else {
    // Keep top-of-form evidence stable: scroll to origin only.
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  }
  // Brief settle after expand so layout/lazy nodes finish painting.
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 120);
          });
        }),
    )
    .catch(() => undefined);

  const buffer = serverless
    ? await takeServerlessScreenshot(page, {
        evidenceOnly: options?.evidenceOnly || moaform,
      })
    : Buffer.from(
        await page.screenshot({
          type: "png",
          fullPage: true,
          captureBeyondViewport: true,
        }),
      );

  const pageUrl = page.url();
  const platform = /docs\.google\.com\/forms|forms\.gle/i.test(pageUrl)
    ? ("google_forms" as const)
    : /form\.naver\.com/i.test(pageUrl)
      ? ("naver_form" as const)
      : /moaform\.com|surveyl\.ink/i.test(pageUrl)
        ? ("moaform" as const)
        : ("unknown" as const);

  return {
    id:
      mode === "evidence_full_walkthrough"
        ? `page_${String(pageNo).padStart(2, "0")}`
        : `auto_screenshot_${String(pageNo).padStart(2, "0")}`,
    label,
    fileName,
    mimeType: serverless ? "image/jpeg" : "image/png",
    buffer,
    capturedAt: capturedAt.toISOString(),
    capturedAtKst: formatKstDateTime(capturedAt),
    capturedUrl: pageUrl,
    finalUrl: pageUrl,
    pageTitle: await page.title(),
    viewport: {
      ...(serverless ? CAPTURE_SERVERLESS_VIEWPORT : CAPTURE_VIEWPORT),
    },
    source: "auto_browser_capture",
    size: buffer.byteLength,
    pageNumber: pageNo,
    mode,
    sectionType: pageNo === 1 ? "survey_top" : "page_body",
    platform,
  };
}
