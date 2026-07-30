import type { Browser, Page } from "puppeteer-core";
import { launchCaptureBrowser } from "@/lib/evidence/capture/browserLauncher";
import {
  CAPTURE_SETTLE_MS,
  CAPTURE_SERVERLESS_VIEWPORT,
  CAPTURE_VIEWPORT,
  EVIDENCE_FULL_MAX_PAGES,
  evidenceFullPageTimeoutMs,
  isServerlessCaptureRuntime,
} from "@/lib/evidence/capture/captureConfig";
import {
  limitationCaptureFailed,
  limitationEvidenceBlocked,
  limitationEvidenceTempPolicy,
  limitationNoMorePages,
  limitationSubmitDetected,
} from "@/lib/evidence/capture/captureLimitations";
import {
  deriveCompleteness,
  toAutoScreenshotPayload,
  type CaptureAnswerType,
  type CapturePageMeta,
  type CapturePathScope,
  type CaptureProvider,
  type CaptureScreenshot,
  type CaptureSurveyResult,
  type CaptureStatus,
} from "@/lib/evidence/capture/captureTypes";
import type { FormCaptureAdapter } from "@/lib/evidence/capture/fullWalkthrough/FormCaptureAdapter";
import { sleep } from "@/lib/evidence/capture/fullWalkthrough/adapterUtils";
import {
  CaptureDebugSession,
  dumpPageDebugArtifacts,
  type CaptureStopReason,
} from "@/lib/evidence/capture/fullWalkthrough/captureTrace";
import { genericFormAdapter } from "@/lib/evidence/capture/fullWalkthrough/genericFormAdapter";
import { googleFormsAdapter } from "@/lib/evidence/capture/fullWalkthrough/googleFormsAdapter";
import {
  captureGoogleFormsViaLoadData,
} from "@/lib/evidence/capture/fullWalkthrough/googleFormsLoadDataCapture";
import { moaformAdapter } from "@/lib/evidence/capture/fullWalkthrough/moaformAdapter";
import { naverFormAdapter } from "@/lib/evidence/capture/fullWalkthrough/naverFormAdapter";
import { installSubmitRequestGuard } from "@/lib/evidence/capture/fullWalkthrough/submitRequestGuard";
import {
  gotoSurveyPage,
  prepareCapturePage,
} from "@/lib/evidence/capture/pageReadiness";
import {
  assertCaptureUrlSafe,
  isCaptureUrlSafeAfterNavigation,
} from "@/lib/evidence/capture/urlCaptureSafety";

const ADAPTERS: FormCaptureAdapter[] = [
  googleFormsAdapter,
  naverFormAdapter,
  moaformAdapter,
];

export async function resolveFormCaptureAdapter(
  url: string,
  page: Page,
): Promise<FormCaptureAdapter> {
  for (const adapter of ADAPTERS) {
    try {
      if (await adapter.detect(url, page)) return adapter;
    } catch {
      /* try next */
    }
  }
  return genericFormAdapter;
}

function providerLabel(provider: CaptureProvider): string {
  switch (provider) {
    case "google_forms":
      return "Google Forms";
    case "naver_form":
      return "Naver Form";
    case "moaform":
      return "Moaform";
    default:
      return "Generic";
  }
}

function providerFolder(provider: CaptureProvider): string {
  switch (provider) {
    case "google_forms":
      return "google";
    case "naver_form":
      return "naver";
    case "moaform":
      return "moaform";
    default:
      return "generic";
  }
}

function questionsToMeta(questions: Awaited<
  ReturnType<FormCaptureAdapter["extractVisibleQuestions"]>
>): Pick<
  CapturePageMeta,
  | "detectedQuestions"
  | "visibleQuestions"
  | "personalInfoQuestions"
  | "sensitiveInfoQuestions"
  | "highRiskQuestions"
> {
  const detectedQuestions = questions.map((q) => q.text);
  const personalInfoQuestions: string[] = [];
  const sensitiveInfoQuestions: string[] = [];
  const highRiskQuestions: string[] = [];
  for (const q of questions) {
    if (q.riskCategory === "민감정보") sensitiveInfoQuestions.push(q.text);
    else if (q.riskCategory === "고위험정보") highRiskQuestions.push(q.text);
    else if (
      q.riskCategory === "직접식별정보" ||
      q.riskCategory === "준식별정보"
    ) {
      personalInfoQuestions.push(q.text);
    }
  }
  return {
    detectedQuestions,
    visibleQuestions: detectedQuestions,
    personalInfoQuestions,
    sensitiveInfoQuestions,
    highRiskQuestions,
  };
}

function isPrematureSubmit(
  captured: number,
  expected: number | null,
): boolean {
  // Without an expected page count we cannot claim premature branch.
  if (expected == null) return false;
  if (expected <= 2) return false;
  return captured < Math.max(4, Math.floor(expected * 0.45));
}

function collectPiiScreenshotFiles(pageMetas: CapturePageMeta[]): string[] {
  const files: string[] = [];
  for (const meta of pageMetas) {
    const hasPii =
      meta.personalInfoQuestions.length > 0 ||
      meta.sensitiveInfoQuestions.length > 0 ||
      meta.highRiskQuestions.length > 0;
    if (hasPii) files.push(meta.screenshotFileName);
  }
  return [...new Set(files)];
}

function finalizeEvidence(input: {
  status: CaptureStatus;
  provider: CaptureProvider;
  expectedPageCount: number | null;
  sectionProgressTotal: number | null;
  screenshots: CaptureScreenshot[];
  pageMetas: CapturePageMeta[];
  limitations: string[];
  temporaryAnswersUsed: boolean;
  finalSubmitDetected: boolean;
  startedAt: string;
  reachedSubmitGate: boolean;
  timedOut: boolean;
  stoppedEarly: boolean;
  stopReason: CaptureStopReason;
  stopPage: number | null;
  blockedSubmitRequestCount: number;
  surveyUrl: string;
  debug?: CaptureDebugSession | null;
}): CaptureSurveyResult {
  const capturedPageCount = input.screenshots.length;
  const rawPiiFiles = collectPiiScreenshotFiles(input.pageMetas);
  const piiSensitiveScreenshotFiles = rawPiiFiles.map((f) =>
    f.startsWith("08_") ? f : `08_화면캡처/${f}`,
  );
  const piiSensitivePagesCaptured = piiSensitiveScreenshotFiles.length > 0;

  const sectionProgressTotal = input.sectionProgressTotal;
  // Capturable pages on the auto-explored path — do NOT shrink sectionProgressTotal
  const expectedCapturablePageCount = input.reachedSubmitGate
    ? capturedPageCount
    : (input.expectedPageCount ??
      (capturedPageCount > 0 ? capturedPageCount : null));

  // Legacy alias for older consumers (capturable count, not section hint)
  const expectedPageCount = expectedCapturablePageCount;

  const premature = Boolean(
    input.reachedSubmitGate &&
      isPrematureSubmit(
        capturedPageCount,
        sectionProgressTotal ?? expectedCapturablePageCount,
      ),
  );

  let captureCompleteness = deriveCompleteness({
    shotCount: capturedPageCount,
    reachedSubmitGate: input.reachedSubmitGate,
    timedOut: input.timedOut,
    stoppedEarly: input.stoppedEarly || premature,
    expectedPageCount: sectionProgressTotal ?? expectedCapturablePageCount,
    prematureSubmit: premature,
  });

  if (
    input.reachedSubmitGate &&
    !premature &&
    capturedPageCount > 0
  ) {
    captureCompleteness = "complete";
  }

  const skippedSections =
    sectionProgressTotal != null &&
    expectedCapturablePageCount != null &&
    sectionProgressTotal > expectedCapturablePageCount
      ? sectionProgressTotal - expectedCapturablePageCount
      : 0;

  const branchLimitations: string[] = [];
  if (skippedSections > 0) {
    branchLimitations.push(
      `조건분기 구조상 자동 탐색 경로에서 미경유된 섹션 ${skippedSections}개가 있습니다.`,
    );
  }
  if (input.provider === "naver_form" && capturedPageCount === 1) {
    // single-page — not a branch issue
  }

  let capturePathScope: CapturePathScope = "unknown";
  if (capturedPageCount === 0) capturePathScope = "unknown";
  else if (input.provider === "naver_form" && capturedPageCount === 1) {
    capturePathScope = "single_page";
  } else if (captureCompleteness === "complete" && input.reachedSubmitGate) {
    capturePathScope = "traversed_path";
  } else if (captureCompleteness === "partial") {
    capturePathScope = "partial_path";
  } else {
    capturePathScope = "traversed_path";
  }

  let status: CaptureStatus = input.status;
  if (captureCompleteness === "complete" && capturedPageCount > 0) {
    status = "success";
  } else if (capturedPageCount === 0) {
    status = input.timedOut ? "timeout" : "failed";
  } else {
    status = "partial";
  }

  let stopReason = input.stopReason;
  if (stopReason === "unknown_stop_reason") {
    if (input.timedOut) stopReason = "timeout";
    else if (premature) stopReason = "branch_or_validation_stop";
    else if (input.reachedSubmitGate && !premature) stopReason = "submit_detected";
    else if (capturedPageCount === 0) stopReason = "capture_error";
  }
  if (
    input.reachedSubmitGate &&
    capturedPageCount <= 1 &&
    sectionProgressTotal != null &&
    sectionProgressTotal > 3
  ) {
    stopReason = "submit_detected_on_first_page";
  }

  const uniq = [...new Set([...input.limitations, ...branchLimitations].filter(Boolean))];
  if (!uniq.some((l) => /임시 응답|증빙용 자동 탐색/.test(l))) {
    uniq.push(limitationEvidenceTempPolicy());
  }
  uniq.push("최종 제출은 수행하지 않았습니다.");
  if (skippedSections > 0) {
    uniq.push(
      `섹션 진행 힌트 ${sectionProgressTotal}개 중 자동 탐색 경로 기준 ${capturedPageCount}개 화면을 캡처했습니다.`,
    );
  }
  uniq.push(`중단 원인(stopReason): ${stopReason}`);
  uniq.push(
    `캡처 완성도: ${captureCompleteness} (captured=${capturedPageCount}, capturable=${expectedCapturablePageCount ?? "?"}, sectionHint=${sectionProgressTotal ?? "?"}, scope=${capturePathScope})`,
  );
  if (piiSensitivePagesCaptured) {
    uniq.push(
      `개인정보·민감정보 관련 화면: ${piiSensitiveScreenshotFiles.join(", ")}`,
    );
  }

  if (input.debug) {
    input.debug.stopReason = stopReason;
    input.debug.stopPage = input.stopPage;
    input.debug.writeSummary({
      provider: input.provider,
      mode: "evidence_full_walkthrough",
      surveyUrl: input.surveyUrl,
      expectedPageCount,
      capturedPageCount,
      captureCompleteness,
      stopReason,
      stopPage: input.stopPage,
      validationErrors: input.debug.lastValidationErrors,
      finalSubmitDetected: input.finalSubmitDetected,
      finalSubmitClicked: false,
      temporaryAnswersUsed: input.temporaryAnswersUsed,
      limitations: uniq,
      startedAt: input.startedAt,
      finishedAt: new Date().toISOString(),
      blockedSubmitRequestCount: input.blockedSubmitRequestCount,
    });
  }

  return {
    status,
    success: capturedPageCount > 0 && status !== "failed",
    mode: "evidence_full_walkthrough",
    captureProvider: input.provider,
    expectedPageCount,
    expectedCapturablePageCount,
    sectionProgressTotal,
    capturePathScope,
    capturedPageCount,
    captureCompleteness,
    finalSubmitDetected: input.finalSubmitDetected,
    finalSubmitClicked: false,
    blockedSubmitRequestCount: input.blockedSubmitRequestCount,
    stopReason,
    stopPage: input.stopPage,
    branchLimitations,
    piiSensitivePagesCaptured,
    piiSensitiveScreenshotFiles,
    screenshots: input.screenshots.map(toAutoScreenshotPayload),
    pageMetas: input.pageMetas,
    limitations: uniq,
    temporaryAnswersUsed: input.temporaryAnswersUsed,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export type FullWalkthroughSharedState = {
  screenshots: CaptureScreenshot[];
  pageMetas: CapturePageMeta[];
  limitations: string[];
  temporaryAnswersUsed: boolean;
  finalSubmitDetected: boolean;
  provider: CaptureProvider;
  expectedPageCount: number | null;
  reachedSubmitGate: boolean;
  stopReason?: CaptureStopReason;
  stopPage?: number | null;
  blockedSubmitRequestCount?: number;
};

export async function runFullWalkthroughOrchestrator(input: {
  surveyUrl: string;
  finalUrl?: string;
  shared?: FullWalkthroughSharedState;
  debug?: boolean | CaptureDebugSession;
  headless?: boolean;
  /** Folder name under tmp/capture-debug when debug=true */
  debugFolder?: string;
}): Promise<CaptureSurveyResult> {
  const startedAt = new Date().toISOString();
  const shared: FullWalkthroughSharedState = input.shared ?? {
    screenshots: [],
    pageMetas: [],
    limitations: [],
    temporaryAnswersUsed: false,
    finalSubmitDetected: false,
    provider: "generic",
    expectedPageCount: null,
    reachedSubmitGate: false,
  };
  const screenshots = shared.screenshots;
  const pageMetas = shared.pageMetas;
  const limitations = shared.limitations;
  limitations.push(
    "이 캡처는 신고용 증빙 수집을 위해 자동 탐색 모드로 수행되었습니다.",
    limitationEvidenceTempPolicy(),
  );
  let temporaryAnswersUsed = shared.temporaryAnswersUsed;
  let finalSubmitDetected = shared.finalSubmitDetected;
  let reachedSubmitGate = shared.reachedSubmitGate;
  let stoppedEarly = false;
  let provider: CaptureProvider = shared.provider;
  let expectedPageCount: number | null = shared.expectedPageCount;
  let sectionProgressTotal: number | null = null;
  let stopReason: CaptureStopReason = "unknown_stop_reason";
  let stopPage: number | null = null;
  let blockedSubmitRequestCount = 0;
  let googleBranchAttempt = 0;
  let lastClickLabel: string | null = null;

  let debug: CaptureDebugSession | null =
    input.debug instanceof CaptureDebugSession
      ? input.debug
      : input.debug
        ? new CaptureDebugSession(input.debugFolder || "run")
        : null;

  const syncShared = () => {
    shared.temporaryAnswersUsed = temporaryAnswersUsed;
    shared.finalSubmitDetected = finalSubmitDetected;
    shared.provider = provider;
    shared.expectedPageCount = expectedPageCount;
    shared.reachedSubmitGate = reachedSubmitGate;
    shared.stopReason = stopReason;
    shared.stopPage = stopPage;
    shared.blockedSubmitRequestCount = blockedSubmitRequestCount;
  };

  const targetRaw = (input.finalUrl || input.surveyUrl || "").trim();
  if (!targetRaw) {
    stopReason = "capture_error";
    return finalizeEvidence({
      status: "failed",
      provider,
      expectedPageCount,
      sectionProgressTotal,
      screenshots,
      pageMetas,
      limitations: [
        ...limitations,
        ...limitationCaptureFailed("캡처 대상 URL이 비어 있습니다."),
      ],
      temporaryAnswersUsed,
      finalSubmitDetected,
      startedAt,
      reachedSubmitGate,
      timedOut: false,
      stoppedEarly: true,
      stopReason,
      stopPage,
      blockedSubmitRequestCount,
      surveyUrl: targetRaw,
      debug,
    });
  }

  const safety = await assertCaptureUrlSafe(targetRaw);
  if (!safety.safe || !safety.normalizedUrl) {
    stopReason = "url_safety_blocked";
    return finalizeEvidence({
      status: "failed",
      provider,
      expectedPageCount,
      sectionProgressTotal,
      screenshots,
      pageMetas,
      limitations: [
        ...limitations,
        ...limitationCaptureFailed(
          safety.reason || "URL 보안 검사를 통과하지 못했습니다.",
        ),
      ],
      temporaryAnswersUsed,
      finalSubmitDetected,
      startedAt,
      reachedSubmitGate,
      timedOut: false,
      stoppedEarly: true,
      stopReason,
      stopPage,
      blockedSubmitRequestCount,
      surveyUrl: targetRaw,
      debug,
    });
  }

  let browser: Browser | null = null;

  try {
    browser = await launchCaptureBrowser({ headless: input.headless !== false });
    let page: Page = await browser.newPage();
    await page.setViewport(
      isServerlessCaptureRuntime()
        ? CAPTURE_SERVERLESS_VIEWPORT
        : CAPTURE_VIEWPORT,
    );
    await prepareCapturePage(page);
    await installSubmitRequestGuard(page, {
      onBlocked: (url) => {
        blockedSubmitRequestCount += 1;
        debug?.push({
          step: debug.nextStep(),
          provider,
          pageNumber: screenshots.length,
          url,
          action: "submit_request_blocked",
          reason: `blocked submit-like request: ${url.slice(0, 180)}`,
        });
      },
      getLastClickLabel: () => lastClickLabel,
      onFormResponseSeen: ({ url, method, lastClickLabel: clickLabel }) => {
        debug?.push({
          step: debug.step || debug.nextStep(),
          provider,
          pageNumber: screenshots.length,
          url: url.slice(0, 240),
          action: "page_transition_detected",
          reason: `formResponse allowed (${method}) after click="${clickLabel ?? "unknown"}"`,
        });
      },
    });

    const loaded = await gotoSurveyPage(page, safety.normalizedUrl);
    if (!loaded.ok) {
      if (loaded.limitation) limitations.push(loaded.limitation);
      stopReason = "dynamic_render_timeout";
      stopPage = 0;
      return finalizeEvidence({
        status: "failed",
        provider,
        expectedPageCount,
        sectionProgressTotal,
        screenshots,
        pageMetas,
        limitations: [...limitations, ...limitationCaptureFailed()],
        temporaryAnswersUsed,
        finalSubmitDetected,
        startedAt,
        reachedSubmitGate,
        timedOut: false,
        stoppedEarly: true,
        stopReason,
        stopPage,
        blockedSubmitRequestCount,
        surveyUrl: safety.normalizedUrl,
        debug,
      });
    }

    const adapter = await resolveFormCaptureAdapter(
      safety.normalizedUrl,
      page,
    );
    provider = adapter.provider;
    if (debug && !(input.debug instanceof CaptureDebugSession)) {
      debug = new CaptureDebugSession(
        input.debugFolder || providerFolder(provider),
      );
    }
    syncShared();
    limitations.push(`설문도구: ${providerLabel(provider)}`);

    // @sparticuz/chromium on Vercel cannot hydrate Google Forms freebird viewer
    // (empty shell / no Next). Reconstruct pages from FB_PUBLIC_LOAD_DATA_.
    if (provider === "google_forms" && isServerlessCaptureRuntime()) {
      debug?.push({
        step: debug.nextStep(),
        provider,
        pageNumber: 1,
        url: page.url(),
        action: "page_loaded",
        reason: "serverless Google Forms — load-data capture",
      });
      const rebuilt = await captureGoogleFormsViaLoadData({
        browser,
        formUrl: safety.normalizedUrl,
        existingPage: page,
      });
      for (const shot of rebuilt.screenshots) screenshots.push(shot);
      for (const meta of rebuilt.pageMetas) pageMetas.push(meta);
      limitations.push(...rebuilt.limitations);
      expectedPageCount = rebuilt.form.pages.length;
      sectionProgressTotal = rebuilt.form.pages.length;
      reachedSubmitGate = true;
      finalSubmitDetected = true;
      stopReason = "submit_detected";
      stopPage = rebuilt.screenshots.length;
      syncShared();
      return finalizeEvidence({
        status: "success",
        provider,
        expectedPageCount,
        sectionProgressTotal,
        screenshots,
        pageMetas,
        limitations,
        temporaryAnswersUsed: false,
        finalSubmitDetected,
        startedAt,
        reachedSubmitGate,
        timedOut: false,
        stoppedEarly: false,
        stopReason,
        stopPage,
        blockedSubmitRequestCount,
        surveyUrl: safety.normalizedUrl,
        debug,
      });
    }

    await adapter.waitForReady(page);
    expectedPageCount = await adapter.estimateExpectedPageCount(page);
    // Guard: Google Forms percent progress (aria-valuemax=100) must never be
    // treated as a 100-section survey.
    if (
      provider === "google_forms" &&
      expectedPageCount != null &&
      expectedPageCount >= 100
    ) {
      expectedPageCount = null;
    }
    sectionProgressTotal = expectedPageCount;
    syncShared();

    debug?.push({
      step: debug.nextStep(),
      provider,
      pageNumber: 1,
      url: page.url(),
      action: "page_loaded",
      reason: `expectedPageCount=${expectedPageCount}`,
    });

    const maxPages =
      provider === "generic"
        ? Math.min(10, EVIDENCE_FULL_MAX_PAGES)
        : EVIDENCE_FULL_MAX_PAGES;

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const step = debug?.nextStep() ?? pageNo;

      // Debug dump BEFORE fill
      let buttons: Awaited<ReturnType<typeof dumpPageDebugArtifacts>>["buttons"] =
        [];
      if (debug) {
        const dumped = await dumpPageDebugArtifacts(page, debug, {
          provider,
          pageNumber: pageNo,
          step,
        });
        buttons = dumped.buttons;
      }

      // Detect nav BEFORE capture mutates layout/fonts — screenshot CSS can
      // temporarily collapse Material buttons on serverless Chromium.
      let nextHandle = await adapter.findNextButton(page);
      let submitHandle = await adapter.findSubmitButton(page);
      let hasNext = Boolean(nextHandle);
      let hasSubmit = Boolean(submitHandle);
      if (nextHandle) await nextHandle.dispose().catch(() => undefined);
      if (submitHandle) await submitHandle.dispose().catch(() => undefined);

      // 1) Capture BEFORE any temporary answers
      // (Do not start the per-page fill/next deadline until after capture —
      // serverless screenshot + Hangul fonts often exceed 10s alone.)
      let shot: Awaited<ReturnType<FormCaptureAdapter["captureCurrentPage"]>>;
      try {
        shot = await adapter.captureCurrentPage(page, pageNo);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const recoverable =
          pageNo === 1 &&
          Boolean(browser) &&
          /Target closed|Session closed|Protocol error.*[Ss]creenshot/i.test(
            message,
          );
        if (!recoverable || !browser) throw error;

        // Serverless Chromium can kill the tab on the first Naver full-page
        // raster. Recreate the page once and retry capture.
        page = await browser.newPage();
        await page.setViewport(
          isServerlessCaptureRuntime()
            ? CAPTURE_SERVERLESS_VIEWPORT
            : CAPTURE_VIEWPORT,
        );
        await prepareCapturePage(page);
        await installSubmitRequestGuard(page, {
          onBlocked: (_url) => {
            blockedSubmitRequestCount += 1;
          },
        });
        const reloaded = await gotoSurveyPage(page, safety.normalizedUrl);
        if (!reloaded.ok) throw error;
        await adapter.waitForReady(page);
        nextHandle = await adapter.findNextButton(page);
        submitHandle = await adapter.findSubmitButton(page);
        hasNext = Boolean(nextHandle);
        hasSubmit = Boolean(submitHandle);
        if (nextHandle) await nextHandle.dispose().catch(() => undefined);
        if (submitHandle) await submitHandle.dispose().catch(() => undefined);
        shot = await adapter.captureCurrentPage(page, pageNo);
      }
      screenshots.push(shot);
      syncShared();
      const pageDeadline = Date.now() + evidenceFullPageTimeoutMs();
      debug?.push({
        step,
        provider,
        pageNumber: pageNo,
        url: page.url(),
        action: "page_captured",
        screenshotPath: debug
          ? `step_${String(step).padStart(3, "0")}_before.png`
          : undefined,
      });

      const questions = await adapter.extractVisibleQuestions(page);
      const qMeta = questionsToMeta(questions);
      debug?.push({
        step,
        provider,
        pageNumber: pageNo,
        url: page.url(),
        action: "questions_extracted",
        visibleQuestionCount: questions.length,
        visibleQuestions: questions.map((q) => q.text).slice(0, 30),
      });

      const state = await adapter.getCurrentPageState(page);
      if (
        expectedPageCount == null &&
        state.totalPageHint != null &&
        state.totalPageHint > 0 &&
        !(provider === "google_forms" && state.totalPageHint >= 100)
      ) {
        expectedPageCount = state.totalPageHint;
        if (sectionProgressTotal == null) {
          sectionProgressTotal = state.totalPageHint;
        }
      } else if (
        state.totalPageHint != null &&
        state.totalPageHint > (sectionProgressTotal ?? 0) &&
        !(provider === "google_forms" && state.totalPageHint >= 100)
      ) {
        sectionProgressTotal = state.totalPageHint;
      }

      // Re-check after capture (fonts/CSS). Prefer pre-capture detection if
      // post-capture lookup goes blind on serverless Google Forms.
      nextHandle = await adapter.findNextButton(page);
      submitHandle = await adapter.findSubmitButton(page);
      const hasNextAfter = Boolean(nextHandle);
      const hasSubmitAfter = Boolean(submitHandle);
      if (nextHandle) await nextHandle.dispose().catch(() => undefined);
      if (submitHandle) await submitHandle.dispose().catch(() => undefined);
      hasNext = hasNext || hasNextAfter;
      hasSubmit = hasSubmit || hasSubmitAfter;

      if (hasNext) {
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "next_detected",
        });
      }
      if (hasSubmit) {
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "submit_detected",
        });
      }

      // 3) Submit gate
      if (hasSubmit && !hasNext) {
        finalSubmitDetected = true;
        const premature = isPrematureSubmit(screenshots.length, expectedPageCount);

        // Google early branch: try alternate choice once
        if (
          premature &&
          provider === "google_forms" &&
          googleBranchAttempt < 2 &&
          typeof adapter.tryAlternateBranch === "function"
        ) {
          googleBranchAttempt += 1;
          debug?.push({
            step,
            provider,
            pageNumber: pageNo,
            url: page.url(),
            action: "branch_retry",
            reason: `premature submit at page ${pageNo}; trying alternate branch #${googleBranchAttempt}`,
          });
          const retried = await adapter.tryAlternateBranch(page);
          if (retried) {
            // Drop this premature last page meta and continue walking
            screenshots.pop();
            await sleep(CAPTURE_SETTLE_MS);
            pageNo -= 1;
            continue;
          }
        }

        reachedSubmitGate = true;
        stopPage = pageNo;
        stopReason = premature
          ? pageNo <= 1
            ? "submit_detected_on_first_page"
            : "branch_or_validation_stop"
          : "submit_detected";
        pageMetas.push({
          pageNumber: pageNo,
          pageTitle: shot.pageTitle,
          capturedUrl: shot.capturedUrl,
          capturedAt: shot.capturedAt,
          screenshotFileName: shot.fileName,
          provider,
          ...qMeta,
          temporaryAnswersUsed: false,
          temporaryAnswersUsedAfterCapture: false,
          temporaryAnswerTypes: [],
          finalSubmitDetected: true,
          finalSubmitClicked: false,
        });
        limitations.push(limitationSubmitDetected(pageNo));
        if (premature) {
          limitations.push(
            `제출 화면이 예상보다 이른 페이지(${pageNo}/${expectedPageCount ?? "?"})에서 감지되어 경로가 불완전할 수 있습니다.`,
          );
          stoppedEarly = true;
        }
        debug?.writeJson(`step_${String(step).padStart(3, "0")}_decision.json`, {
          decision: premature ? "stop_partial_premature_submit" : "stop_submit_gate",
          reason: stopReason,
          hasNext,
          hasSubmit,
          buttons,
        });
        break;
      }

      // 4) Temp fill AFTER capture
      let fillTypes: CaptureAnswerType[] = [];
      let fillUsed = false;
      if (hasNext || !hasSubmit) {
        if (Date.now() > pageDeadline) {
          stopReason = "timeout";
          stopPage = pageNo;
          limitations.push(
            `${pageNo}페이지 처리 시간이 초과되어 추가 탐색을 중단했습니다.`,
          );
          stoppedEarly = true;
          pageMetas.push({
            pageNumber: pageNo,
            pageTitle: shot.pageTitle,
            capturedUrl: shot.capturedUrl,
            capturedAt: shot.capturedAt,
            screenshotFileName: shot.fileName,
            provider,
            ...qMeta,
            temporaryAnswersUsed: false,
            temporaryAnswersUsedAfterCapture: false,
            temporaryAnswerTypes: [],
            finalSubmitDetected: false,
            finalSubmitClicked: false,
          });
          debug?.writeJson(`step_${String(step).padStart(3, "0")}_decision.json`, {
            decision: "stop_partial",
            reason: "page timeout before fill/next",
          });
          break;
        }

        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "fill_attempted",
        });
        const filled = await adapter.fillRequiredFieldsForNavigation(page);
        if (filled.filled > 0) {
          fillUsed = true;
          fillTypes = filled.types;
          temporaryAnswersUsed = true;
          await sleep(CAPTURE_SETTLE_MS);
        }
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "fill_completed",
          reason: `filled=${filled.filled} types=${filled.types.join(",")}`,
        });
      }

      pageMetas.push({
        pageNumber: pageNo,
        pageTitle: shot.pageTitle,
        capturedUrl: shot.capturedUrl,
        capturedAt: shot.capturedAt,
        screenshotFileName: shot.fileName,
        provider,
        ...qMeta,
        temporaryAnswersUsed: fillUsed,
        temporaryAnswersUsedAfterCapture: fillUsed,
        temporaryAnswerTypes: fillTypes,
        finalSubmitDetected: false,
        finalSubmitClicked: false,
      });

      if (!hasNext && !hasSubmit) {
        stopReason =
          provider === "naver_form" || provider === "moaform"
            ? "next_button_not_found"
            : "next_button_not_found";
        stopPage = pageNo;
        limitations.push(limitationNoMorePages(screenshots.length));
        stoppedEarly = true;
        debug?.writeJson(`step_${String(step).padStart(3, "0")}_decision.json`, {
          decision: "stop_partial",
          reason: stopReason,
          buttons,
        });
        break;
      }

      debug?.writeJson(`step_${String(step).padStart(3, "0")}_decision.json`, {
        decision: "click_next",
        reason: "visible next button found",
        nextButtonText:
          buttons?.find((b) => b.isNextCandidate)?.text || "다음",
      });
      lastClickLabel =
        buttons?.find((b) => b.isNextCandidate)?.text || "다음";

      let transition: Awaited<ReturnType<FormCaptureAdapter["clickNext"]>>;
      try {
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "next_clicked",
        });
        transition = await adapter.clickNext(page);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (
          /Execution context was destroyed|Target closed|frame was detached/i.test(
            message,
          )
        ) {
          await sleep(700);
          try {
            await adapter.waitForReady(page);
          } catch {
            /* continue */
          }
          transition = "moved";
        } else {
          throw error;
        }
      }

      if (transition === "submit_gate") {
        finalSubmitDetected = true;
        reachedSubmitGate = true;
        stopPage = pageNo;
        stopReason = isPrematureSubmit(screenshots.length, expectedPageCount)
          ? "branch_or_validation_stop"
          : "submit_detected";
        pageMetas[pageMetas.length - 1] = {
          ...pageMetas[pageMetas.length - 1],
          finalSubmitDetected: true,
          finalSubmitClicked: false,
        };
        limitations.push(limitationSubmitDetected(pageNo));
        break;
      }

      if (transition === "blocked") {
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "retry_fill_attempted",
        });
        const retry = await adapter.fillRequiredFieldsForNavigation(page);
        if (retry.filled > 0) {
          temporaryAnswersUsed = true;
          await sleep(CAPTURE_SETTLE_MS);
          transition = await adapter.clickNext(page);
        }
      }

      if (transition === "moved") {
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "page_transition_detected",
          reason: "moved",
        });
        const navOk = await isCaptureUrlSafeAfterNavigation(page.url());
        if (!navOk) {
          stopReason = "url_safety_blocked";
          stopPage = pageNo;
          limitations.push(
            "다음 페이지 이동 후 URL 보안 검사를 통과하지 못해 추가 캡처를 중단했습니다.",
          );
          stoppedEarly = true;
          break;
        }
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            await adapter.waitForReady(page);
            break;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (
              !/Execution context was destroyed|frame was detached/i.test(
                message,
              )
            ) {
              break;
            }
            await sleep(400);
          }
        }
        await sleep(CAPTURE_SETTLE_MS);
        continue;
      }

      if (transition === "none") {
        if (hasSubmit || (await adapter.findSubmitButton(page))) {
          finalSubmitDetected = true;
          reachedSubmitGate = true;
          stopPage = pageNo;
          stopReason = isPrematureSubmit(screenshots.length, expectedPageCount)
            ? pageNo <= 1
              ? "submit_detected_on_first_page"
              : "branch_or_validation_stop"
            : "submit_detected";
          limitations.push(limitationSubmitDetected(pageNo));
        } else {
          stopReason = "next_button_not_found";
          stopPage = pageNo;
          limitations.push(limitationNoMorePages(screenshots.length));
          stoppedEarly = true;
        }
        break;
      }

      const errors = await adapter.detectValidationErrors(page);
      if (debug) debug.lastValidationErrors = errors;
      if (errors.length > 0) {
        debug?.push({
          step,
          provider,
          pageNumber: pageNo,
          url: page.url(),
          action: "validation_error_detected",
          validationErrors: errors,
        });
        limitations.push(
          `${pageNo}페이지 검증 오류: ${errors.slice(0, 2).join(" / ")}`,
        );
        stopReason = "validation_error_remained";
      } else if (!fillUsed) {
        stopReason = "required_fill_failed";
      } else {
        stopReason = "page_transition_failed";
      }
      stopPage = pageNo;
      limitations.push(limitationEvidenceBlocked(pageNo));
      stoppedEarly = true;
      debug?.writeJson(`step_${String(step).padStart(3, "0")}_decision.json`, {
        decision: "stop_partial",
        reason: stopReason,
        validationErrors: errors,
      });
      break;
    }

    if (!reachedSubmitGate && screenshots.length >= maxPages) {
      limitations.push(`신고용 전체 캡처는 최대 ${maxPages}장까지입니다.`);
      stopReason = "max_pages_reached";
      stopPage = screenshots.length;
      stoppedEarly = true;
    }

    if (
      expectedPageCount != null &&
      expectedPageCount >= 5 &&
      screenshots.length <= 3 &&
      !reachedSubmitGate
    ) {
      limitations.push(
        `예상 ${expectedPageCount}페이지 중 ${screenshots.length}페이지만 캡처되어 신고용 전체 캡처가 불완전합니다.`,
      );
      if (stopReason === "unknown_stop_reason") {
        stopReason = "branch_or_validation_stop";
      }
      stoppedEarly = true;
    }

    if (stopReason === "unknown_stop_reason") {
      stopReason = reachedSubmitGate
        ? "submit_detected"
        : "page_transition_failed";
      stopPage = stopPage ?? screenshots.length;
    }

    syncShared();
    return finalizeEvidence({
      status: reachedSubmitGate && !isPrematureSubmit(screenshots.length, expectedPageCount)
        ? "success"
        : "partial",
      provider,
      expectedPageCount,
      sectionProgressTotal,
      screenshots,
      pageMetas,
      limitations,
      temporaryAnswersUsed,
      finalSubmitDetected,
      startedAt,
      reachedSubmitGate,
      timedOut: false,
      stoppedEarly: stoppedEarly || !reachedSubmitGate,
      stopReason,
      stopPage,
      blockedSubmitRequestCount,
      surveyUrl: safety.normalizedUrl,
      debug,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    stopReason = "capture_error";
    stopPage = screenshots.length || null;
    syncShared();
    debug?.push({
      step: debug.nextStep(),
      provider,
      pageNumber: screenshots.length,
      url: "",
      action: "error",
      reason: message.slice(0, 300),
    });
    return finalizeEvidence({
      status: screenshots.length > 0 ? "partial" : "failed",
      provider,
      expectedPageCount,
      sectionProgressTotal,
      screenshots,
      pageMetas,
      limitations: [
        ...limitations,
        ...limitationCaptureFailed(`상세: ${message.slice(0, 240)}`),
      ],
      temporaryAnswersUsed,
      finalSubmitDetected,
      startedAt,
      reachedSubmitGate,
      timedOut: false,
      stoppedEarly: true,
      stopReason,
      stopPage,
      blockedSubmitRequestCount,
      surveyUrl: targetRaw,
      debug,
    });
  } finally {
    syncShared();
    if (browser) await browser.close().catch(() => undefined);
  }
}
