import type { Browser, Page } from "puppeteer-core";
import { launchCaptureBrowser } from "@/lib/evidence/capture/browserLauncher";
import {
  CAPTURE_MAX_PAGES,
  CAPTURE_SETTLE_MS,
  CAPTURE_TOTAL_TIMEOUT_MS,
  CAPTURE_VIEWPORT,
  EVIDENCE_FULL_TIMEOUT_MS,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import {
  deriveCaptureStatus,
  limitationCaptureFailed,
  limitationMaxPages,
  limitationNoInputPolicy,
  limitationNoMorePages,
  limitationRequiredBlocked,
  limitationStatusSummary,
  limitationTimeout,
} from "@/lib/evidence/capture/captureLimitations";
import {
  deriveCompleteness,
  toAutoScreenshotPayload,
  type CaptureMode,
  type CapturePageMeta,
  type CaptureScreenshot,
  type CaptureSurveyResult,
  type CaptureStatus,
} from "@/lib/evidence/capture/captureTypes";
import {
  runFullWalkthroughOrchestrator,
  type FullWalkthroughSharedState,
} from "@/lib/evidence/capture/fullWalkthrough/fullWalkthroughOrchestrator";
import { captureGoogleFormsViaLoadData } from "@/lib/evidence/capture/fullWalkthrough/googleFormsLoadDataCapture";
import {
  clickSafeNext,
  detectSubmitButtonVisible,
  markSafeNextButton,
} from "@/lib/evidence/capture/pageNavigation";
import {
  partitionQuestionsByRisk,
  scanPageQuestions,
} from "@/lib/evidence/capture/pageQuestionScan";
import {
  gotoSurveyPage,
  prepareCapturePage,
} from "@/lib/evidence/capture/pageReadiness";
import {
  captureFullPage,
  isRecoverableCdpError,
} from "@/lib/evidence/capture/screenshotCapture";
import {
  assertCaptureUrlSafe,
  isCaptureUrlSafeAfterNavigation,
} from "@/lib/evidence/capture/urlCaptureSafety";

function isGoogleFormsUrl(url: string): boolean {
  return /docs\.google\.com\/forms|forms\.gle/i.test(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PartialState = {
  screenshots: CaptureScreenshot[];
  pageMetas: CapturePageMeta[];
  limitations: string[];
  temporaryAnswersUsed: boolean;
};

function finalize(
  mode: CaptureMode,
  status: CaptureStatus,
  partial: PartialState,
  startedAt: string,
  extraLimitations: string[] = [],
): CaptureSurveyResult {
  const finishedAt = new Date().toISOString();
  const uniq = [
    ...new Set(
      [...partial.limitations, ...extraLimitations].filter(Boolean),
    ),
  ];
  if (mode === "safe_public_only") {
    if (!uniq.includes(limitationNoInputPolicy())) {
      uniq.push(limitationNoInputPolicy());
    }
  }
  uniq.push(limitationStatusSummary(status, partial.screenshots.length));
  return {
    status,
    success:
      partial.screenshots.length > 0 &&
      (status === "success" || status === "partial"),
    mode,
    capturedPageCount: partial.screenshots.length,
    captureCompleteness:
      status === "success"
        ? "complete"
        : partial.screenshots.length === 0
          ? "failed"
          : "partial",
    finalSubmitDetected: false,
    finalSubmitClicked: false,
    screenshots: partial.screenshots.map(toAutoScreenshotPayload),
    pageMetas: partial.pageMetas,
    limitations: uniq,
    temporaryAnswersUsed: partial.temporaryAnswersUsed,
    startedAt,
    finishedAt,
  };
}

async function buildPageMeta(
  page: Page,
  pageNo: number,
  shot: CaptureScreenshot,
  fill: { used: boolean; types: CapturePageMeta["temporaryAnswerTypes"] },
  finalSubmitDetected: boolean,
): Promise<CapturePageMeta> {
  const questions = await scanPageQuestions(page);
  const partitioned = partitionQuestionsByRisk(questions);
  return {
    pageNumber: pageNo,
    pageTitle: shot.pageTitle,
    capturedUrl: shot.capturedUrl,
    capturedAt: shot.capturedAt,
    screenshotFileName: shot.fileName,
    detectedQuestions: questions,
    visibleQuestions: questions,
    personalInfoQuestions: partitioned.personalInfoQuestions,
    sensitiveInfoQuestions: partitioned.sensitiveInfoQuestions,
    highRiskQuestions: partitioned.highRiskQuestions,
    temporaryAnswersUsed: fill.used,
    temporaryAnswersUsedAfterCapture: fill.used,
    temporaryAnswerTypes: fill.types,
    finalSubmitDetected,
    finalSubmitClicked: false,
  };
}

async function runSafePublicCapture(input: {
  surveyUrl: string;
  finalUrl?: string;
  partial: PartialState;
}): Promise<CaptureSurveyResult> {
  const mode: CaptureMode = "safe_public_only";
  const startedAt = new Date().toISOString();
  const { partial } = input;

  const targetRaw = (input.finalUrl || input.surveyUrl || "").trim();
  if (!targetRaw) {
    return finalize(
      mode,
      "failed",
      partial,
      startedAt,
      limitationCaptureFailed("캡처 대상 URL이 비어 있습니다."),
    );
  }

  const safety = await assertCaptureUrlSafe(targetRaw);
  if (!safety.safe || !safety.normalizedUrl) {
    return finalize(
      mode,
      "failed",
      partial,
      startedAt,
      limitationCaptureFailed(
        safety.reason || "URL 보안 검사를 통과하지 못했습니다.",
      ),
    );
  }

  let browser: Browser | null = null;
  let stoppedEarly = false;

  try {
    browser = await launchCaptureBrowser();

    // Vercel Chromium cannot hydrate Google Forms freebird viewer.
    // Reconstruct preview pages from FB_PUBLIC_LOAD_DATA_ (same as full walk).
    if (
      isGoogleFormsUrl(safety.normalizedUrl) &&
      isServerlessCaptureRuntime()
    ) {
      const rebuilt = await captureGoogleFormsViaLoadData({
        browser,
        formUrl: safety.normalizedUrl,
        maxPages: CAPTURE_MAX_PAGES,
      });
      partial.screenshots.push(...rebuilt.screenshots);
      partial.pageMetas.push(...rebuilt.pageMetas);
      partial.limitations.push(...rebuilt.limitations);
      if (rebuilt.screenshots.length >= CAPTURE_MAX_PAGES) {
        partial.limitations.push(limitationMaxPages(CAPTURE_MAX_PAGES));
        stoppedEarly = true;
      } else if (rebuilt.form.pages.length > rebuilt.screenshots.length) {
        stoppedEarly = true;
      }
      const status = deriveCaptureStatus(
        partial.screenshots.length,
        stoppedEarly,
        false,
      );
      return finalize(mode, status, partial, startedAt);
    }

    const page: Page = await browser.newPage();
    await page.setViewport(CAPTURE_VIEWPORT);
    await prepareCapturePage(page);

    const loaded = await gotoSurveyPage(page, safety.normalizedUrl);
    if (!loaded.ok) {
      if (loaded.limitation) partial.limitations.push(loaded.limitation);
      return finalize(
        mode,
        "failed",
        partial,
        startedAt,
        limitationCaptureFailed(loaded.limitation),
      );
    }

    let activePage = page;
    let sessionRecovered = false;

    const captureShotWithRecovery = async (
      pageNo: number,
    ): Promise<CaptureScreenshot> => {
      try {
        return await captureFullPage(activePage, pageNo, mode);
      } catch (error) {
        if (!isRecoverableCdpError(error) || sessionRecovered) {
          throw error;
        }
        sessionRecovered = true;
        partial.limitations.push(
          "브라우저 세션이 끊겨 공개 화면을 1회 재접속한 뒤 증거 캡처를 재시도했습니다.",
        );
        if (!browser) throw error;
        await activePage.close().catch(() => undefined);
        activePage = await browser.newPage();
        await activePage.setViewport(CAPTURE_VIEWPORT);
        await prepareCapturePage(activePage);
        const reloaded = await gotoSurveyPage(
          activePage,
          safety.normalizedUrl!,
        );
        if (!reloaded.ok) {
          throw error;
        }
        // Evidence-only viewport shot — avoid fullPage on a just-recovered SPA.
        return await captureFullPage(activePage, pageNo, mode, {
          evidenceOnly: true,
        });
      }
    };

    for (let pageNo = 1; pageNo <= CAPTURE_MAX_PAGES; pageNo += 1) {
      const shot = await captureShotWithRecovery(pageNo);
      partial.screenshots.push(shot);

      const submitVisible = await detectSubmitButtonVisible(activePage);
      const nextAvailable = await markSafeNextButton(activePage);

      if (submitVisible && !nextAvailable) {
        partial.pageMetas.push(
          await buildPageMeta(
            activePage,
            pageNo,
            shot,
            { used: false, types: [] },
            true,
          ),
        );
        stoppedEarly = true;
        break;
      }

      partial.pageMetas.push(
        await buildPageMeta(
          activePage,
          pageNo,
          shot,
          { used: false, types: [] },
          false,
        ),
      );

      const nav = await clickSafeNext(activePage);
      if (nav === "none" || nav === "blocked") {
        if (nav === "blocked") {
          partial.limitations.push(
            limitationRequiredBlocked(partial.screenshots.length),
          );
        } else {
          partial.limitations.push(
            limitationNoMorePages(partial.screenshots.length),
          );
        }
        stoppedEarly = true;
        break;
      }

      const navOk = await isCaptureUrlSafeAfterNavigation(activePage.url());
      if (!navOk) {
        partial.limitations.push(
          "다음 페이지 이동 후 URL 보안 검사를 통과하지 못해 추가 캡처를 중단했습니다.",
        );
        stoppedEarly = true;
        break;
      }
      await sleep(CAPTURE_SETTLE_MS);
    }

    if (
      !stoppedEarly &&
      partial.screenshots.length >= CAPTURE_MAX_PAGES
    ) {
      partial.limitations.push(limitationMaxPages(CAPTURE_MAX_PAGES));
      stoppedEarly = true;
    }

    const status = deriveCaptureStatus(
      partial.screenshots.length,
      stoppedEarly,
      false,
    );
    return finalize(mode, status, partial, startedAt);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return finalize(
      mode,
      partial.screenshots.length > 0 ? "partial" : "failed",
      partial,
      startedAt,
      limitationCaptureFailed(`상세: ${message.slice(0, 240)}`),
    );
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

/**
 * Capture orchestrator.
 * - safe_public_only: no fills, max 3 pages, 30s
 * - evidence_full_walkthrough: adapter-based walk, temp fills, never submit
 */
export async function captureSurveyScreenshots(input: {
  surveyUrl: string;
  finalUrl?: string;
  mode?: CaptureMode;
  priorityQuestions?: unknown[];
}): Promise<CaptureSurveyResult> {
  const mode: CaptureMode = input.mode ?? "safe_public_only";
  const startedAt = new Date().toISOString();
  const partial: PartialState = {
    screenshots: [],
    pageMetas: [],
    limitations: [],
    temporaryAnswersUsed: false,
  };
  const timeoutMs =
    mode === "evidence_full_walkthrough"
      ? EVIDENCE_FULL_TIMEOUT_MS
      : CAPTURE_TOTAL_TIMEOUT_MS;

  const evidenceShared: FullWalkthroughSharedState = {
    screenshots: [],
    pageMetas: [],
    limitations: [],
    temporaryAnswersUsed: false,
    finalSubmitDetected: false,
    provider: "generic",
    expectedPageCount: null,
    reachedSubmitGate: false,
  };

  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      mode === "evidence_full_walkthrough"
        ? runFullWalkthroughOrchestrator({
            surveyUrl: input.surveyUrl,
            finalUrl: input.finalUrl,
            shared: evidenceShared,
          })
        : runSafePublicCapture({ ...input, partial }),
      new Promise<CaptureSurveyResult>((resolve) => {
        hardTimer = setTimeout(() => {
          if (mode === "evidence_full_walkthrough") {
            const shotCount = evidenceShared.screenshots.length;
            const completeness = deriveCompleteness({
              shotCount,
              reachedSubmitGate: evidenceShared.reachedSubmitGate,
              timedOut: true,
              stoppedEarly: true,
            });
            resolve({
              status: shotCount > 0 ? "partial" : "timeout",
              success: shotCount > 0,
              mode,
              captureProvider: evidenceShared.provider,
              expectedPageCount: evidenceShared.expectedPageCount,
              capturedPageCount: shotCount,
              captureCompleteness: completeness,
              finalSubmitDetected: evidenceShared.finalSubmitDetected,
              finalSubmitClicked: false,
              screenshots: evidenceShared.screenshots.map(toAutoScreenshotPayload),
              pageMetas: evidenceShared.pageMetas,
              limitations: [
                ...new Set([
                  ...evidenceShared.limitations,
                  ...limitationTimeout(),
                ]),
              ],
              temporaryAnswersUsed: evidenceShared.temporaryAnswersUsed,
              startedAt,
              finishedAt: new Date().toISOString(),
            });
            return;
          }
          const status = deriveCaptureStatus(
            partial.screenshots.length,
            true,
            true,
          );
          resolve(
            finalize(
              mode,
              status === "failed" ? "timeout" : status,
              partial,
              startedAt,
              limitationTimeout(),
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (hardTimer) clearTimeout(hardTimer);
  }
}
