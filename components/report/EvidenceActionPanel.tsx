"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  ShieldAlert,
  TimerOff,
  X,
  XCircle,
} from "lucide-react";
import { PlatformMark } from "@/components/report/ui/PlatformMark";
import { ReportExpandTrigger } from "@/components/report/ui/ReportExpandTrigger";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { ScanReport } from "@/lib/types/scan";
import {
  buildEvidencePackage,
  downloadBlob,
} from "@/lib/evidence/buildEvidencePackage";
import {
  buildReportEvidenceModel,
  shouldShowEvidenceActionPanel,
} from "@/lib/evidence/buildEvidenceModel";
import {
  MAX_MANUAL_EVIDENCE_BYTES,
  MAX_MANUAL_EVIDENCE_FILES,
  type AutoCaptureEvidenceFile,
  type CapturePageMetaEvidence,
  type ManualEvidenceFile,
} from "@/lib/evidence/evidenceTypes";
import {
  CAPTURE_CLIENT_TIMEOUT_MS,
  EVIDENCE_FULL_CLIENT_TIMEOUT_MS,
} from "@/lib/evidence/capture/captureConfig";
import type { CaptureMode } from "@/lib/evidence/capture/captureTypes";

interface EvidenceActionPanelProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

type CaptureUiStatus =
  | "idle"
  | "capturing"
  | "success"
  | "partial"
  | "failed"
  | "timeout"
  | "skipped";

type CaptureApiStatus = "success" | "partial" | "failed" | "timeout";

const KISA_REPORT_URL =
  process.env.NEXT_PUBLIC_KISA_REPORT_URL?.trim() ||
  "https://privacy.kisa.or.kr";

const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
]);

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  return /\.(png|jpe?g|pdf)$/i.test(file.name);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function shouldAutoCapture(
  report: ScanReport,
  audienceReport: AudienceReport,
): boolean {
  if (!shouldShowEvidenceActionPanel(audienceReport)) return false;
  if (report.form.metadata?.source?.kind === "file") return false;
  const url = report.debug?.finalUrl || report.form.url || report.formUrl;
  return Boolean(url && /^https?:\/\//i.test(url));
}

/** 신고 검토 대상 → 결과 표시 직후 evidence_full_walkthrough 자동 실행 */
function shouldAutoRunFullEvidenceCapture(
  report: ScanReport,
  audienceReport: AudienceReport,
): boolean {
  if (!shouldAutoCapture(report, audienceReport)) return false;
  if (audienceReport.safetyType.typeId === "JUDGMENT_UNKNOWN") return false;
  if (audienceReport.safetyType.typeId === "STOP_RESPONSE") return true;
  if (audienceReport.safetyType.needsReportOrInquire) return true;
  if (audienceReport.safetyType.displayName === "응답 거부·신고 검토") {
    return true;
  }
  return (
    audienceReport.respondentDecision === "DO_NOT_RESPOND" ||
    audienceReport.respondentDecision === "REPORT_OR_INQUIRE"
  );
}

export function EvidenceActionPanel({
  report,
  audienceReport,
}: EvidenceActionPanelProps) {
  const inputId = useId();
  const enableAutoCapture = shouldAutoCapture(report, audienceReport);
  const autoRunFullCapture = shouldAutoRunFullEvidenceCapture(
    report,
    audienceReport,
  );
  const [manualFiles, setManualFiles] = useState<ManualEvidenceFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<CaptureUiStatus>(() =>
    enableAutoCapture ? "capturing" : "skipped",
  );
  const [autoScreenshots, setAutoScreenshots] = useState<
    AutoCaptureEvidenceFile[]
  >([]);
  const [safeScreenshots, setSafeScreenshots] = useState<
    AutoCaptureEvidenceFile[]
  >([]);
  const [fullScreenshots, setFullScreenshots] = useState<
    AutoCaptureEvidenceFile[]
  >([]);
  const [captureLimitations, setCaptureLimitations] = useState<string[]>([]);
  const [showCaptureWaitPrompt, setShowCaptureWaitPrompt] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [fullRetryKey, setFullRetryKey] = useState(0);
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() =>
    autoRunFullCapture ? "evidence_full_walkthrough" : "safe_public_only",
  );
  const [pageMetas, setPageMetas] = useState<CapturePageMetaEvidence[]>([]);
  const [temporaryAnswersUsed, setTemporaryAnswersUsed] = useState(false);
  const [fullWalkStatus, setFullWalkStatus] = useState<CaptureUiStatus>(() =>
    autoRunFullCapture && enableAutoCapture ? "capturing" : "idle",
  );
  const [captureProvider, setCaptureProvider] = useState<string | null>(null);
  const [expectedPageCount, setExpectedPageCount] = useState<number | null>(
    null,
  );
  const [sectionProgressTotal, setSectionProgressTotal] = useState<
    number | null
  >(null);
  const [expectedCapturablePageCount, setExpectedCapturablePageCount] =
    useState<number | null>(null);
  const [capturePathScope, setCapturePathScope] = useState<string | null>(null);
  const [branchLimitations, setBranchLimitations] = useState<string[]>([]);
  const [piiSensitiveScreenshotFiles, setPiiSensitiveScreenshotFiles] =
    useState<string[]>([]);
  const [capturedPageCount, setCapturedPageCount] = useState(0);
  const [captureCompleteness, setCaptureCompleteness] = useState<
    "complete" | "partial" | "failed" | null
  >(null);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [stopPage, setStopPage] = useState<number | null>(null);

  /** Abort in-flight safe auto-capture when full walkthrough starts. */
  const safeAbortRef = useRef<AbortController | null>(null);
  const fullAbortRef = useRef<AbortController | null>(null);
  /** Ignore late safe_public_only responses after full walk begins/finishes. */
  const preferFullWalkRef = useRef(autoRunFullCapture);

  const mapShots = (
    shots: Array<{
      id: string;
      label: string;
      fileName: string;
      mimeType: string;
      capturedAt: string;
      capturedAtKst?: string;
      capturedUrl: string;
      finalUrl: string;
      pageTitle: string;
      viewport: { width: number; height: number };
      source: "auto_browser_capture";
      base64: string;
      size: number;
      pageNumber?: number;
      mode?: string;
    }>,
  ): AutoCaptureEvidenceFile[] =>
    shots.map((shot) => ({
      id: shot.id,
      label: shot.label,
      fileName: shot.fileName,
      mimeType: shot.mimeType,
      bytes: base64ToUint8Array(shot.base64),
      capturedAt: shot.capturedAt,
      capturedAtKst: shot.capturedAtKst,
      capturedUrl: shot.capturedUrl,
      finalUrl: shot.finalUrl,
      pageTitle: shot.pageTitle,
      viewport: shot.viewport,
      source: "auto_browser_capture",
      size: shot.size,
      pageNumber: shot.pageNumber,
      mode: shot.mode,
    }));

  const applyCaptureResult = useCallback((
    data: {
      success?: boolean;
      status?: CaptureApiStatus;
      mode?: CaptureMode;
      screenshots?: Parameters<typeof mapShots>[0];
      pageMetas?: CapturePageMetaEvidence[];
      temporaryAnswersUsed?: boolean;
      limitations?: string[];
      captureProvider?: string | null;
      expectedPageCount?: number | null;
      expectedCapturablePageCount?: number | null;
      sectionProgressTotal?: number | null;
      capturedPageCount?: number;
      captureCompleteness?: "complete" | "partial" | "failed" | null;
      capturePathScope?: string | null;
      branchLimitations?: string[];
      piiSensitiveScreenshotFiles?: string[];
      stopReason?: string | null;
      stopPage?: number | null;
    },
    setStatus: (s: CaptureUiStatus) => void,
  ) => {
    // Late safe_public_only must never replace a full-walkthrough result
    if (
      preferFullWalkRef.current &&
      data.mode === "safe_public_only"
    ) {
      return;
    }

    const limitations = data.limitations ?? [];
    setCaptureLimitations(limitations);
    setPageMetas(data.pageMetas ?? []);
    setTemporaryAnswersUsed(Boolean(data.temporaryAnswersUsed));
    if (data.mode) setCaptureMode(data.mode);
    if (data.captureProvider !== undefined) {
      setCaptureProvider(data.captureProvider);
    }
    if (data.expectedPageCount !== undefined) {
      setExpectedPageCount(data.expectedPageCount);
    }
    if (data.expectedCapturablePageCount !== undefined) {
      setExpectedCapturablePageCount(data.expectedCapturablePageCount);
    }
    if (data.sectionProgressTotal !== undefined) {
      setSectionProgressTotal(data.sectionProgressTotal);
    }
    if (data.capturePathScope !== undefined) {
      setCapturePathScope(data.capturePathScope);
    }
    if (data.branchLimitations !== undefined) {
      setBranchLimitations(data.branchLimitations ?? []);
    }
    if (data.piiSensitiveScreenshotFiles !== undefined) {
      setPiiSensitiveScreenshotFiles(data.piiSensitiveScreenshotFiles ?? []);
    }
    if (typeof data.capturedPageCount === "number") {
      setCapturedPageCount(data.capturedPageCount);
    } else {
      setCapturedPageCount(data.screenshots?.length ?? 0);
    }
    if (data.captureCompleteness !== undefined) {
      setCaptureCompleteness(data.captureCompleteness);
    }
    if (data.stopReason !== undefined) {
      setStopReason(data.stopReason);
    }
    if (data.stopPage !== undefined) {
      setStopPage(data.stopPage ?? null);
    }

    const shots = data.screenshots ?? [];
    const mapped = shots.length > 0 ? mapShots(shots) : [];
    if (data.mode === "evidence_full_walkthrough") {
      setFullScreenshots(mapped);
      setAutoScreenshots(mapped);
    } else if (data.mode === "safe_public_only") {
      setSafeScreenshots(mapped);
      // Prefer full walkthrough shots for ZIP/UI when already present
      setAutoScreenshots((prev) =>
        preferFullWalkRef.current && prev.length > 0 ? prev : mapped,
      );
    } else {
      setAutoScreenshots(mapped);
    }

    const apiStatus = data.status;
    const completeness = data.captureCompleteness;
    if (completeness === "partial" && apiStatus === "success") {
      setStatus("partial");
    } else if (apiStatus === "timeout") {
      setStatus(shots.length > 0 ? "partial" : "timeout");
    } else if (apiStatus === "partial" || completeness === "partial") {
      setStatus(shots.length > 0 ? "partial" : "failed");
    } else if (apiStatus === "failed" || completeness === "failed") {
      setStatus("failed");
      if (limitations.length === 0) {
        setCaptureLimitations([
          "자동 화면 캡처에 실패했습니다.",
          "문항 원문과 고지문 원문은 증빙자료에 포함됩니다.",
        ]);
      }
    } else if (
      (apiStatus === "success" || completeness === "complete" || data.success) &&
      shots.length > 0
    ) {
      setStatus("success");
    } else {
      setStatus(shots.length > 0 ? "partial" : "failed");
    }
  }, []);

  useEffect(() => {
    // 신고 검토 대상은 safe_public_only를 실행하지 않음
    if (!enableAutoCapture || autoRunFullCapture) return;

    preferFullWalkRef.current = false;
    let cancelled = false;
    const controller = new AbortController();
    safeAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
      if (cancelled || preferFullWalkRef.current) return;
      setCaptureStatus((prev) =>
        prev === "capturing" ? "timeout" : prev,
      );
      setCaptureLimitations((prev) =>
        prev.length > 0
          ? prev
          : [
              "자동 화면 캡처 시간이 초과되었습니다.",
              "문항 원문과 고지문 원문은 증빙자료에 포함되며, 캡처 없이도 다운로드할 수 있습니다.",
            ],
      );
    }, CAPTURE_CLIENT_TIMEOUT_MS);

    const surveyUrl =
      report.debug?.inputUrl || report.formUrl || report.form.url || "";
    const finalUrl =
      report.debug?.finalUrl || report.form.url || report.formUrl || "";

    const run = async () => {
      try {
        const response = await fetch("/api/evidence/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surveyUrl,
            finalUrl,
            diagnosisId: report.scanId,
            mode: "safe_public_only",
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (cancelled || preferFullWalkRef.current) return;
        window.clearTimeout(timeoutId);
        applyCaptureResult(data, setCaptureStatus);
      } catch (err) {
        if (cancelled || preferFullWalkRef.current) return;
        window.clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setAutoScreenshots([]);
        setSafeScreenshots([]);
        setCaptureStatus("failed");
        setCaptureLimitations([
          "자동 화면 캡처에 실패했습니다.",
          "설문 페이지가 접근을 차단했거나 로딩 시간이 초과되었습니다.",
        ]);
      }
    };

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
      if (safeAbortRef.current === controller) {
        safeAbortRef.current = null;
      }
    };
  }, [
    enableAutoCapture,
    autoRunFullCapture,
    retryKey,
    report.scanId,
    report.debug?.inputUrl,
    report.debug?.finalUrl,
    report.formUrl,
    report.form.url,
    applyCaptureResult,
  ]);

  const runFullWalkthrough = useCallback(async () => {
    if (!enableAutoCapture) return;
    setError(null);
    preferFullWalkRef.current = true;
    safeAbortRef.current?.abort();
    safeAbortRef.current = null;
    fullAbortRef.current?.abort();

    setFullWalkStatus("capturing");
    setCaptureStatus("capturing");
    setCaptureMode("evidence_full_walkthrough");
    setShowCaptureWaitPrompt(false);
    setFullScreenshots([]);
    setAutoScreenshots([]);
    setPageMetas([]);
    setCapturedPageCount(0);
    setCaptureLimitations([]);
    setCaptureCompleteness(null);
    setStopReason(null);
    setStopPage(null);

    const controller = new AbortController();
    fullAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
      setFullWalkStatus((prev) =>
        prev === "capturing" ? "timeout" : prev,
      );
      setCaptureStatus((prev) =>
        prev === "capturing" ? "timeout" : prev,
      );
      setCaptureLimitations((prev) =>
        prev.length > 0
          ? prev
          : [
              "신고용 전체 화면 캡처 시간이 초과되었습니다.",
              "확보된 화면까지는 ZIP에 포함되며, 캡처 없이도 다운로드할 수 있습니다.",
            ],
      );
    }, EVIDENCE_FULL_CLIENT_TIMEOUT_MS);

    const surveyUrl =
      report.debug?.inputUrl || report.formUrl || report.form.url || "";
    const finalUrl =
      report.debug?.finalUrl || report.form.url || report.formUrl || "";

    if (!surveyUrl && !finalUrl) {
      window.clearTimeout(timeoutId);
      setFullWalkStatus("failed");
      setCaptureStatus("failed");
      setCaptureLimitations([
        "신고용 전체 화면 캡처에 실패했습니다.",
        "설문 URL이 없어 화면 캡처를 실행할 수 없습니다.",
      ]);
      return;
    }

    try {
      const response = await fetch("/api/evidence/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyUrl,
          finalUrl,
          diagnosisId: report.scanId,
          mode: "evidence_full_walkthrough",
          captureMode: "evidence_full_walkthrough",
          includeFullWalkthrough: true,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      window.clearTimeout(timeoutId);
      if (fullAbortRef.current !== controller) return;
      preferFullWalkRef.current = true;
      applyCaptureResult(data, (status) => {
        setCaptureStatus(status);
        setFullWalkStatus(status);
      });
    } catch (err) {
      window.clearTimeout(timeoutId);
      if (fullAbortRef.current !== controller) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setFullWalkStatus("failed");
      setCaptureStatus("failed");
      setCaptureLimitations([
        "신고용 전체 화면 캡처에 실패했습니다.",
        "캡처 없이도 신고용 증빙자료를 다운로드할 수 있습니다.",
      ]);
    } finally {
      if (fullAbortRef.current === controller) {
        fullAbortRef.current = null;
      }
    }
  }, [
    enableAutoCapture,
    report.debug?.inputUrl,
    report.debug?.finalUrl,
    report.formUrl,
    report.form.url,
    report.scanId,
    applyCaptureResult,
  ]);

  // 신고 검토 대상: 결과 표시 직후 전체 캡처 자동 시작
  useEffect(() => {
    if (!autoRunFullCapture) return;
    const startId = window.setTimeout(() => {
      void runFullWalkthrough();
    }, 0);
    return () => {
      window.clearTimeout(startId);
      fullAbortRef.current?.abort();
    };
  }, [autoRunFullCapture, fullRetryKey, runFullWalkthrough]);

  if (!shouldShowEvidenceActionPanel(audienceReport)) {
    return null;
  }

  const onAddFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const next = [...manualFiles];
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_MANUAL_EVIDENCE_FILES) {
        setError(
          `캡처 파일은 최대 ${MAX_MANUAL_EVIDENCE_FILES}개까지 추가할 수 있습니다.`,
        );
        break;
      }
      if (!isAcceptedFile(file)) {
        setError("PNG, JPG, JPEG, PDF 파일만 추가할 수 있습니다.");
        continue;
      }
      if (file.size > MAX_MANUAL_EVIDENCE_BYTES) {
        setError("파일당 5MB 이하만 추가할 수 있습니다.");
        continue;
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      next.push({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: buffer,
        label: file.name,
      });
    }
    setManualFiles(next);
  };

  const removeFile = (index: number) => {
    setManualFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const screenshotsForZip =
    fullScreenshots.length > 0
      ? fullScreenshots
      : safeScreenshots.length > 0
        ? safeScreenshots
        : autoScreenshots;

  const runDownload = async (includeCapture: boolean) => {
    setError(null);
    setBusy(true);
    setShowCaptureWaitPrompt(false);
    try {
      const model = buildReportEvidenceModel(report, audienceReport);
      const shots = includeCapture ? screenshotsForZip : [];
      const pkg = await buildEvidencePackage(model, manualFiles, {
        autoScreenshots: shots,
        captureLimitations: [
          ...(enableAutoCapture ? captureLimitations : []),
          ...(!includeCapture && enableAutoCapture
            ? ["사용자가 캡처 없이 다운로드를 선택했습니다."]
            : []),
        ],
        captureAttempted: enableAutoCapture,
        captureStatus:
          captureStatus === "skipped" || captureStatus === "idle"
            ? undefined
            : captureStatus === "capturing"
              ? "partial"
              : captureStatus,
        captureMode:
          fullScreenshots.length > 0 ||
          captureMode === "evidence_full_walkthrough"
            ? "evidence_full_walkthrough"
            : captureMode,
        captureProvider: includeCapture
          ? captureProvider ?? undefined
          : undefined,
        expectedPageCount: includeCapture ? expectedPageCount : undefined,
        expectedCapturablePageCount: includeCapture
          ? expectedCapturablePageCount ?? expectedPageCount
          : undefined,
        sectionProgressTotal: includeCapture ? sectionProgressTotal : undefined,
        capturedPageCount: includeCapture
          ? capturedPageCount || shots.length
          : undefined,
        captureCompleteness: includeCapture
          ? captureCompleteness ?? undefined
          : undefined,
        capturePathScope: includeCapture
          ? capturePathScope ?? undefined
          : undefined,
        branchLimitations: includeCapture ? branchLimitations : undefined,
        piiSensitiveScreenshotFiles: includeCapture
          ? piiSensitiveScreenshotFiles
          : undefined,
        piiSensitivePagesCaptured: includeCapture
          ? piiSensitiveScreenshotFiles.length > 0
          : undefined,
        finalSubmitDetected: false,
        finalSubmitClicked: false,
        stopReason: includeCapture ? stopReason ?? undefined : undefined,
        stopPage: includeCapture ? stopPage ?? undefined : undefined,
        pageMetas: includeCapture ? pageMetas : [],
        temporaryAnswersUsed: includeCapture ? temporaryAnswersUsed : false,
      });
      downloadBlob(pkg.blob, pkg.fileName);
    } catch (err) {
      console.error(err);
      setError("증빙자료 생성 중 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const isFullCapturing =
    autoRunFullCapture && fullWalkStatus === "capturing";

  const onDownloadClick = () => {
    if (isFullCapturing || captureStatus === "capturing") {
      setShowCaptureWaitPrompt(true);
      return;
    }
    void runDownload(true);
  };

  const onRetrySafeCapture = () => {
    setShowCaptureWaitPrompt(false);
    preferFullWalkRef.current = false;
    setAutoScreenshots([]);
    setSafeScreenshots([]);
    setPageMetas([]);
    setTemporaryAnswersUsed(false);
    setCaptureMode("safe_public_only");
    setCaptureLimitations([]);
    setCaptureStatus("capturing");
    setFullWalkStatus("idle");
    setCaptureProvider(null);
    setExpectedPageCount(null);
    setExpectedCapturablePageCount(null);
    setSectionProgressTotal(null);
    setCapturePathScope(null);
    setBranchLimitations([]);
    setPiiSensitiveScreenshotFiles([]);
    setCapturedPageCount(0);
    setCaptureCompleteness(null);
    setStopReason(null);
    setStopPage(null);
    setRetryKey((k) => k + 1);
  };

  const onRetryFullCapture = () => {
    setShowCaptureWaitPrompt(false);
    setCaptureProvider(null);
    setExpectedPageCount(null);
    setExpectedCapturablePageCount(null);
    setSectionProgressTotal(null);
    setCapturePathScope(null);
    setBranchLimitations([]);
    setPiiSensitiveScreenshotFiles([]);
    setCapturedPageCount(0);
    setCaptureCompleteness(null);
    setStopReason(null);
    setStopPage(null);
    if (autoRunFullCapture) {
      setFullRetryKey((k) => k + 1);
    } else {
      void runFullWalkthrough();
    }
  };

  const providerDisplayName = (() => {
    switch (captureProvider) {
      case "google_forms":
        return "Google Forms";
      case "naver_form":
        return "Naver Form";
      case "moaform":
        return "Moaform";
      case "generic":
        return "Generic";
      default:
        return report.platform || "설문도구";
    }
  })();

  const stopReasonLabel = (() => {
    switch (stopReason) {
      case "validation_error_remained":
        return stopPage
          ? `${stopPage}페이지 이동 전 필수문항 입력 실패(검증 오류 유지)`
          : "필수문항 입력 후 검증 오류가 남았습니다";
      case "required_fill_failed":
        return "필수문항 임시값 입력에 실패했습니다";
      case "next_button_not_found":
        return "다음 버튼을 찾지 못했습니다. iframe 또는 동적 렌더링 구조를 확인해야 합니다";
      case "page_transition_failed":
        return "페이지 전환을 확인하지 못했습니다";
      case "submit_detected_on_first_page":
        return "첫 페이지에서 제출 버튼만 감지되어 추가 탐색을 중단했습니다";
      case "branch_or_validation_stop":
        return "조건분기 또는 검증으로 예상보다 이른 제출 화면에 도달했습니다";
      case "dynamic_render_timeout":
        return "페이지 전환 후 문항 렌더링을 확인하지 못했습니다";
      case "iframe_not_handled":
        return "iframe 내부 설문 구조를 처리하지 못했습니다";
      case "timeout":
        return "캡처 제한 시간이 초과되었습니다";
      case "submit_detected":
        return "제출 직전 페이지까지 도달했습니다";
      default:
        return stopReason || "원인 미상 — 디버그 로그를 확인하세요";
    }
  })();

  const fullWalkProgressLabel =
    sectionProgressTotal != null && sectionProgressTotal > 0
      ? `${capturedPageCount || autoScreenshots.length} / ${sectionProgressTotal}`
      : expectedCapturablePageCount != null && expectedCapturablePageCount > 0
        ? `${capturedPageCount || autoScreenshots.length} / ${expectedCapturablePageCount}`
        : `${capturedPageCount || autoScreenshots.length}`;

  const capturableCountForUi =
    expectedCapturablePageCount ??
    (capturedPageCount || autoScreenshots.length);
  const skippedSectionCount =
    sectionProgressTotal != null &&
    capturableCountForUi != null &&
    sectionProgressTotal > capturableCountForUi
      ? sectionProgressTotal - capturableCountForUi
      : 0;
  const piiFileLabels = piiSensitiveScreenshotFiles.map((f) =>
    f.replace(/^08_화면캡처\//, ""),
  );

  const sourceKind =
    report.form.metadata?.source?.kind === "file" ? "file" : "url";

  const captureIcon =
    captureStatus === "capturing" ? (
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    ) : captureStatus === "success" || captureStatus === "partial" ? (
      <CheckCircle2 className="h-5 w-5" aria-hidden />
    ) : captureStatus === "timeout" ? (
      <TimerOff className="h-5 w-5" aria-hidden />
    ) : captureStatus === "failed" ? (
      <XCircle className="h-5 w-5" aria-hidden />
    ) : (
      <Camera className="h-5 w-5" aria-hidden />
    );

  return (
    <section
      aria-labelledby="evidence-cta-title"
      className="rounded-[1.25rem] border-[2.5px] border-rose-500 bg-[#FFF1F2] p-5 shadow-[0_1px_0_rgba(225,29,72,0.08)] md:p-7"
    >
      <header className="pb-5 md:pb-6">
        <div className="flex items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-rose-300 bg-white text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
            aria-hidden
          >
            <ShieldAlert className="h-7 w-7" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex rounded-md border border-rose-300 bg-rose-700 px-2.5 py-1 text-xs font-semibold tracking-wide text-white">
                신고 검토 안내
              </span>
              <PlatformMark
                platform={report.platform}
                source={sourceKind}
                label={audienceReport.safetyType.toolBadge}
                size="md"
              />
            </div>
            <h2
              id="evidence-cta-title"
              className="text-xl font-bold tracking-tight text-rose-950 md:text-2xl"
            >
              신고가 필요할 수 있는 설문입니다
            </h2>
            <p className="max-w-3xl text-[15px] leading-relaxed text-rose-950/75">
              개인정보 수집·처리 방식에 중대한 문제가 있을 수 있습니다. 응답하지
              않고 신고를 검토하는 것이 좋습니다.
            </p>
          </div>
        </div>
      </header>

      <div className="border-t-2 border-rose-200" aria-hidden />

      <div className="space-y-4 pt-5 md:pt-6">
      {enableAutoCapture && !autoRunFullCapture ? (
        <div className="flex items-start gap-3.5 rounded-xl border border-rose-200 bg-white px-4 py-3.5">
          <span
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${
              captureStatus === "success" || captureStatus === "partial"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : captureStatus === "capturing"
                  ? "border-slate-200 bg-slate-50 text-slate-600"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {captureIcon}
          </span>
          <div className="min-w-0 flex-1">
            {captureStatus === "capturing" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  기본 미리보기 캡처 중 (최대 3페이지)
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  응답값 입력이나 제출은 하지 않습니다.
                </p>
              </>
            ) : null}
            {captureStatus === "success" || captureStatus === "partial" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  1차 화면 캡처 완료: {safeScreenshots.length || autoScreenshots.length}장
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  캡처 이미지는 신고용 증빙자료 ZIP에 함께 포함됩니다.
                </p>
              </>
            ) : null}
            {captureStatus === "timeout" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  자동 화면 캡처 시간이 초과되었습니다.
                </p>
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-rose-800 underline-offset-2 hover:underline"
                  onClick={onRetrySafeCapture}
                >
                  캡처 다시 시도
                </button>
              </>
            ) : null}
            {captureStatus === "failed" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  자동 화면 캡처를 완료하지 못했습니다.
                </p>
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-rose-800 underline-offset-2 hover:underline"
                  onClick={onRetrySafeCapture}
                >
                  기본 캡처 다시 시도
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {enableAutoCapture ? (
        <div className="rounded-xl border border-rose-200 bg-white px-4 py-3.5">
          <div className="flex items-start gap-3.5">
            <span
              className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${
                fullWalkStatus === "success" ||
                (fullWalkStatus === "partial" &&
                  captureCompleteness === "complete")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : fullWalkStatus === "capturing"
                    ? "border-slate-200 bg-slate-50 text-slate-600"
                    : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {fullWalkStatus === "capturing" ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : fullWalkStatus === "success" ||
                fullWalkStatus === "partial" ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              ) : fullWalkStatus === "timeout" ? (
                <TimerOff className="h-5 w-5" aria-hidden />
              ) : fullWalkStatus === "failed" ? (
                <XCircle className="h-5 w-5" aria-hidden />
              ) : (
                <Camera className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">
                신고용 전체 화면 캡처
                {autoRunFullCapture && fullWalkStatus === "capturing"
                  ? " · 자동 실행"
                  : ""}
              </p>

              {fullWalkStatus === "idle" && !autoRunFullCapture ? (
                <p>
                  개인정보 문항이 뒤쪽 페이지에 있을 수 있으므로, 신고용
                  증빙자료에는 전체 화면 캡처를 포함하는 것이 좋습니다.
                </p>
              ) : null}

              {fullWalkStatus === "capturing" ? (
                <>
                  <p className="font-semibold text-slate-900">
                    신고용 전체 화면 캡처 진행 중
                  </p>
                  <p>
                    개인정보/민감정보 문항이 뒤쪽 페이지에 있을 수 있어, 제출
                    직전까지 가능한 화면을 자동으로 캡처하고 있습니다.
                  </p>
                  <p>설문도구: {providerDisplayName}</p>
                  {(capturedPageCount > 0 ||
                    sectionProgressTotal != null ||
                    expectedCapturablePageCount != null) && (
                    <p>현재 {fullWalkProgressLabel} 페이지 캡처 중입니다.</p>
                  )}
                  <p>최종 제출은 하지 않습니다.</p>
                </>
              ) : null}

              {fullWalkStatus === "success" ||
              (fullWalkStatus === "partial" &&
                captureCompleteness === "complete") ? (
                <>
                  <p className="font-semibold text-slate-900">
                    {capturePathScope === "single_page"
                      ? "신고용 화면 캡처 완료"
                      : "신고용 전체 화면 캡처 완료"}
                  </p>
                  {capturePathScope === "single_page" ||
                  captureProvider === "naver_form" ? (
                    <>
                      <p>
                        이 설문은 단일 페이지 폼으로, 전체 화면 캡처에
                        개인정보 문항과 제출 버튼이 포함되어 있습니다.
                      </p>
                      {piiSensitiveScreenshotFiles.length > 0 ? (
                        <p>
                          개인정보 관련 화면: {piiFileLabels.join(", ")}
                        </p>
                      ) : null}
                      <p>최종 제출은 수행하지 않았습니다.</p>
                    </>
                  ) : (
                    <>
                      <p>
                        제출 직전까지 자동 탐색 가능한 경로의{" "}
                        {capturedPageCount ||
                          fullScreenshots.length ||
                          autoScreenshots.length}
                        개 화면을 캡처했습니다.
                      </p>
                      {piiSensitiveScreenshotFiles.length > 0 ? (
                        <p>
                          개인정보/인적사항 문항은 {piiFileLabels.join(", ")}에
                          포함되어 있습니다.
                        </p>
                      ) : (
                        <p>
                          개인정보/민감정보 문항이 포함된 페이지가 증빙자료에
                          포함됩니다.
                        </p>
                      )}
                      {branchLimitations.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                      {skippedSectionCount > 0 ? (
                        <p>
                          조건분기 구조상 미경유된 섹션 {skippedSectionCount}
                          개가 있을 수 있습니다.
                        </p>
                      ) : null}
                      <p>최종 제출은 수행하지 않았습니다.</p>
                    </>
                  )}
                </>
              ) : null}

              {fullWalkStatus === "partial" &&
              captureCompleteness !== "complete" ? (
                <>
                  <p className="font-semibold text-slate-900">
                    신고용 전체 화면 캡처 일부 완료
                  </p>
                  <p>일부 페이지만 캡처되었습니다.</p>
                  <p>
                    {providerDisplayName}:{" "}
                    {expectedPageCount != null
                      ? `${expectedPageCount}페이지 중 ${capturedPageCount || fullScreenshots.length || autoScreenshots.length}페이지까지만 캡처했습니다.`
                      : `${capturedPageCount || fullScreenshots.length || autoScreenshots.length}페이지까지만 캡처했습니다.`}
                  </p>
                  <p>중단 원인: {stopReasonLabel}</p>
                  <p>
                    이 상태로는 뒤쪽 개인정보 문항의 화면 증빙이 부족할 수
                    있습니다.
                  </p>
                </>
              ) : null}

              {fullWalkStatus === "failed" || fullWalkStatus === "timeout" ? (
                <>
                  <p className="font-semibold text-slate-900">
                    신고용 전체 화면 캡처 실패
                  </p>
                  <p>
                    설문 페이지 접근 제한 또는 동적 렌더링 문제로 캡처하지
                    못했습니다.
                  </p>
                </>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            disabled={busy || fullWalkStatus === "capturing"}
            onClick={onRetryFullCapture}
            className={
              fullWalkStatus === "success" ||
              (fullWalkStatus === "partial" &&
                captureCompleteness === "complete")
                ? "mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                : "mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {fullWalkStatus === "capturing" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-4 w-4" aria-hidden />
            )}
            {fullWalkStatus === "capturing"
              ? "신고용 전체 화면 캡처 중"
              : fullWalkStatus === "success" ||
                  (fullWalkStatus === "partial" &&
                    captureCompleteness === "complete")
                ? "신고용 전체 화면 캡처 다시 실행"
                : fullWalkStatus === "partial" ||
                    fullWalkStatus === "failed" ||
                    fullWalkStatus === "timeout"
                  ? "전체 캡처 다시 시도"
                  : "신고용 전체 화면 캡처 시작"}
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[0.875rem]">
        <ReportExpandTrigger
          open={manualOpen}
          title="추가 캡처 첨부"
          description="선택 · 자동 캡처에 빠진 화면이 있을 때만 사용하세요."
          icon={ImagePlus}
          onClick={() => setManualOpen((prev) => !prev)}
          compact
          tone="soft"
        />
        {manualOpen ? (
          <div className="report-expand-panel">
            <div className="report-detail-stack">
              <p className="report-detail-body">
                뒷페이지·고지문 화면이 빠졌다면 PNG·JPG·PDF를 추가할 수
                있습니다. 개인정보가 입력된 화면은 첨부하지 마세요.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={inputId}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  캡처 파일 추가
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void onAddFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <span className="report-detail-note">
                  최대 {MAX_MANUAL_EVIDENCE_FILES}개 · 파일당 5MB
                </span>
              </div>
              {manualFiles.length > 0 ? (
                <ul className="space-y-1.5">
                  {manualFiles.map((file, index) => (
                    <li
                      key={`${file.fileName}-${index}`}
                      className="report-detail-tile flex items-center justify-between gap-2"
                    >
                      <span className="report-detail-body-strong truncate">
                        {file.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600"
                        aria-label={`${file.fileName} 제거`}
                      >
                        <X className="h-3.5 w-3.5" />
                        제거
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {showCaptureWaitPrompt ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">
            신고용 전체 화면 캡처가 아직 진행 중입니다. 뒤쪽 개인정보 문항
            화면이 포함되려면 완료 후 다운로드하는 것이 좋습니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowCaptureWaitPrompt(false)}
              className="inline-flex items-center justify-center rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800"
            >
              전체 캡처 완료 후 다운로드
            </button>
            <button
              type="button"
              onClick={() => {
                void runDownload(true);
              }}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              현재까지 캡처된 자료로 다운로드
            </button>
            <button
              type="button"
              onClick={() => {
                void runDownload(false);
              }}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              캡처 없이 다운로드
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        {isFullCapturing ? (
          <>
            <button
              type="button"
              onClick={() => setShowCaptureWaitPrompt(true)}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              전체 캡처 완료 후 다운로드
            </button>
            <button
              type="button"
              onClick={() => {
                void runDownload(true);
              }}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              <Download className="h-4 w-4" aria-hidden />
              현재까지 캡처된 자료로 다운로드
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onDownloadClick}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            신고용 증빙자료 다운로드
          </button>
        )}
        <a
          href={KISA_REPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 sm:w-auto"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          KISA 개인정보침해 신고센터로 이동
        </a>
      </div>
      <p className="text-sm leading-relaxed text-slate-500">
        증빙자료는 신고기관 사실관계 확인을 위한 참고자료입니다. 최종 위법
        여부는 개인정보보호위원회 또는 KISA 검토·조사 결과에 따릅니다.
      </p>
      {error ? (
        <p className="text-sm font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      </div>
    </section>
  );
}
