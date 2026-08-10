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
  options?: { evidenceOnly?: boolean; surveyUrl?: string },
): Promise<CaptureScreenshot> {
  const serverless = isServerlessCaptureRuntime();
  const ext = serverless ? "jpg" : "png";
  const { label, fileName } = captureLabelFor(pageNo, mode, ext);
  const capturedAt = new Date();
  let earlyUrl = "";
  try {
    earlyUrl = page.isClosed() ? "" : page.url();
  } catch {
    earlyUrl = "";
  }
  const moaform =
    isMoaformCaptureUrl(earlyUrl) ||
    isMoaformCaptureUrl(options?.surveyUrl || "");
  const skipEvaluatePrep =
    serverless && (moaform || Boolean(options?.evidenceOnly));

  // Hangul glyphs are missing on serverless Chromium unless we inject fonts.
  // Moaform answer.moaform.com remounts frames on serverless — any evaluate
  // (fonts / scroll expand / rAF settle) before the first JPEG can detach the
  // CDP session. Skip all of that and shoot the viewport immediately.
  if (!skipEvaluatePrep) {
    await applyKoreanFontsToPage(page);
    await expandScrollRegions(page, serverless);
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
  }

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

  // Metadata must never discard a successful screenshot buffer. Moaform SPA
  // remounts often make page.title() throw "detached frame" right after a
  // good Page.captureScreenshot — treat that as empty title, keep the JPEG.
  let pageUrl = "";
  try {
    pageUrl = page.isClosed() ? earlyUrl || options?.surveyUrl || "" : page.url();
  } catch {
    pageUrl = earlyUrl || options?.surveyUrl || "";
  }
  const platform = /docs\.google\.com\/forms|forms\.gle/i.test(pageUrl)
    ? ("google_forms" as const)
    : /form\.naver\.com/i.test(pageUrl)
      ? ("naver_form" as const)
      : /moaform\.com|surveyl\.ink|answer\.moaform\.com/i.test(pageUrl)
        ? ("moaform" as const)
        : ("unknown" as const);
  const pageTitle = await page
    .title()
    .catch(() => (moaform ? "Moaform" : ""));

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
    pageTitle,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Moaform on @sparticuz/chromium: start→gateway→answers remounts the main
 * frame and kills evaluate/screenshot if we wait for full readiness.
 * Shoot a viewport JPEG on the first answers navigation (and once after
 * goto) without any page.evaluate.
 */
export async function captureMoaformServerlessFirstPaint(
  page: Page,
  surveyUrl: string,
  pageNo: number,
  mode: CaptureMode = "safe_public_only",
): Promise<CaptureScreenshot> {
  const quality = CAPTURE_SERVERLESS_JPEG_QUALITY;
  const { label, fileName } = captureLabelFor(pageNo, mode, "jpg");
  const capturedAt = new Date();
  const state: { buffer: Buffer | null; capturedUrl: string } = {
    buffer: null,
    capturedUrl: surveyUrl,
  };

  const tryShot = async (): Promise<void> => {
    if (state.buffer || page.isClosed()) return;
    try {
      const viewport = page.viewport() || CAPTURE_SERVERLESS_VIEWPORT;
      const raw = await page.screenshot({
        type: "jpeg",
        quality,
        clip: {
          x: 0,
          y: 0,
          width: Math.max(1, viewport.width),
          height: Math.max(1, viewport.height),
        },
        captureBeyondViewport: false,
      });
      state.buffer = Buffer.from(raw);
      try {
        if (!page.isClosed()) {
          state.capturedUrl = page.url() || state.capturedUrl;
        }
      } catch {
        // keep surveyUrl
      }
    } catch {
      // remount race — caller may retry
    }
  };

  const onNavigated = (frame: {
    url: () => string;
    parentFrame: () => unknown;
  }) => {
    if (frame.parentFrame()) return;
    const u = frame.url();
    if (
      /answer\.moaform\.com\/answers\//i.test(u) ||
      /answer\.moaform\.com\/.*\/(start|gateway)/i.test(u)
    ) {
      void sleep(280).then(() => tryShot());
    }
  };

  page.on("framenavigated", onNavigated as never);
  try {
    await page.goto(surveyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 12_000,
    });
    await sleep(500);
    await tryShot();
    if (!state.buffer) {
      await sleep(900);
      await tryShot();
    }
  } finally {
    page.off("framenavigated", onNavigated as never);
  }

  const evidence = state.buffer;
  if (!evidence || evidence.byteLength < 64) {
    throw new Error(
      "Protocol error (Page.captureScreenshot): Session closed. Most likely the page has been closed.",
    );
  }

  return {
    id: `auto_screenshot_${String(pageNo).padStart(2, "0")}`,
    label,
    fileName,
    mimeType: "image/jpeg",
    buffer: evidence,
    capturedAt: capturedAt.toISOString(),
    capturedAtKst: formatKstDateTime(capturedAt),
    capturedUrl: state.capturedUrl,
    finalUrl: state.capturedUrl,
    pageTitle: "Moaform",
    viewport: { ...CAPTURE_SERVERLESS_VIEWPORT },
    source: "auto_browser_capture",
    size: evidence.byteLength,
    pageNumber: pageNo,
    mode,
    sectionType: pageNo === 1 ? "survey_top" : "page_body",
    platform: "moaform",
  };
}
