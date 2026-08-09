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

function isTargetClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Target closed|Session closed|Protocol error.*[Ss]creenshot/i.test(
    message,
  );
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

async function takeServerlessScreenshot(page: Page): Promise<Buffer> {
  const quality = CAPTURE_SERVERLESS_JPEG_QUALITY;
  // Evidence-first: viewport JPEG first (usable proof), then optional fullPage.
  // Blind fullPage-first often closes Chromium on long SPA shells before any
  // bytes land — prefer partial success over empty timeout.
  const attempts: Array<{
    fullPage: boolean;
    captureBeyondViewport: boolean;
  }> = [
    { fullPage: false, captureBeyondViewport: false },
    { fullPage: true, captureBeyondViewport: false },
  ];

  let lastError: unknown;
  let viewportBuffer: Buffer | null = null;
  for (const opts of attempts) {
    try {
      const raw = await page.screenshot({
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
      if (isTargetClosedError(error)) {
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
): Promise<CaptureScreenshot> {
  const serverless = isServerlessCaptureRuntime();
  const ext = serverless ? "jpg" : "png";
  const { label, fileName } = captureLabelFor(pageNo, mode, ext);
  const capturedAt = new Date();

  // Hangul glyphs are missing on serverless Chromium unless we inject fonts.
  // Skip the global !important font override until after Google Forms nav is
  // resolved — capture still needs glyphs, but avoid collapsing Material buttons
  // before the orchestrator has re-checked Next.
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

  const buffer = serverless
    ? await takeServerlessScreenshot(page)
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
