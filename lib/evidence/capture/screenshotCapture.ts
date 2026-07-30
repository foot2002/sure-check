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

  await page
    .evaluate(() => {
      const selectors = [
        "html",
        "body",
        ".freebirdFormviewerViewFormCard",
        ".freebirdFormviewerViewFormContent",
        ".freebirdFormviewerViewResponsePage",
        "[role='list']",
        ".js-question",
        "#content",
        ".questionnaire",
      ];
      for (const sel of selectors) {
        for (const node of Array.from(document.querySelectorAll(sel))) {
          const el = node as HTMLElement;
          // Do not force height on navigation chrome — it can zero-size Next.
          if (
            el.closest(
              ".freebirdFormviewerViewNavigationNavControls, .freebirdFormviewerViewNavigationButtons, [jsname='OCpkoe'], [jsname='M2UYVd']",
            )
          ) {
            continue;
          }
          el.style.setProperty("height", "auto", "important");
          el.style.setProperty("max-height", "none", "important");
          el.style.setProperty("overflow", "visible", "important");
        }
      }
      void document.body?.offsetHeight;
    })
    .catch(() => undefined);

  const raw = serverless
    ? await page.screenshot({
        type: "jpeg",
        quality: CAPTURE_SERVERLESS_JPEG_QUALITY,
        fullPage: true,
        captureBeyondViewport: true,
      })
    : await page.screenshot({
        type: "png",
        fullPage: true,
        captureBeyondViewport: true,
      });

  const buffer = Buffer.from(raw);
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
    capturedUrl: page.url(),
    finalUrl: page.url(),
    pageTitle: await page.title(),
    viewport: {
      ...(serverless ? CAPTURE_SERVERLESS_VIEWPORT : CAPTURE_VIEWPORT),
    },
    source: "auto_browser_capture",
    size: buffer.byteLength,
    pageNumber: pageNo,
    mode,
  };
}
