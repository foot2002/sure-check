"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
import { buildCapturePriorityQuestions } from "@/lib/evidence/buildCapturePriority";
import {
  buildReportEvidenceModel,
  shouldShowEvidenceActionPanel,
} from "@/lib/evidence/buildEvidenceModel";
import {
  MAX_MANUAL_EVIDENCE_BYTES,
  MAX_MANUAL_EVIDENCE_FILES,
  type AutoCaptureEvidenceFile,
  type ManualEvidenceFile,
} from "@/lib/evidence/evidenceTypes";

interface EvidenceActionPanelProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

type CaptureStatus =
  | "idle"
  | "loading"
  | "success"
  | "failed"
  | "timeout"
  | "skipped";

const CAPTURE_CLIENT_TIMEOUT_MS = 330_000;

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

export function EvidenceActionPanel({
  report,
  audienceReport,
}: EvidenceActionPanelProps) {
  const inputId = useId();
  const enableAutoCapture = shouldAutoCapture(report, audienceReport);
  const [manualFiles, setManualFiles] = useState<ManualEvidenceFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>(() =>
    enableAutoCapture ? "loading" : "skipped",
  );
  const [autoScreenshots, setAutoScreenshots] = useState<
    AutoCaptureEvidenceFile[]
  >([]);
  const [captureLimitations, setCaptureLimitations] = useState<string[]>([]);
  const [showCaptureWaitPrompt, setShowCaptureWaitPrompt] = useState(false);

  const priorityQuestions = useMemo(
    () => buildCapturePriorityQuestions(report),
    // 동일 진단 결과에서는 문항 우선순위가 바뀌지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report.scanId
    [report.scanId],
  );

  useEffect(() => {
    if (!enableAutoCapture) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
      if (cancelled) return;
      setAutoScreenshots([]);
      setCaptureStatus("timeout");
      setCaptureLimitations([
        "자동 화면 캡처 시간이 초과되었습니다.",
        "문항 원문과 고지문 원문은 증빙자료에 포함됩니다. 필요하면 추가 캡처를 첨부하세요.",
      ]);
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
            priorityQuestions,
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          success?: boolean;
          screenshots?: Array<{
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
          }>;
          limitations?: string[];
        };

        if (cancelled) return;
        window.clearTimeout(timeoutId);

        const limitations = data.limitations ?? [];
        setCaptureLimitations(limitations);

        if (data.success && data.screenshots && data.screenshots.length > 0) {
          setAutoScreenshots(
            data.screenshots.map((shot) => ({
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
            })),
          );
          setCaptureStatus("success");
        } else {
          setAutoScreenshots([]);
          setCaptureStatus("failed");
          if (limitations.length === 0) {
            setCaptureLimitations([
              "자동 화면 캡처에 실패했습니다.",
              "설문 페이지가 접근을 차단했거나 로딩 시간이 초과되었습니다.",
            ]);
          }
        }
      } catch (err) {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          // timeout handler already updated status
          return;
        }
        setAutoScreenshots([]);
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
    };
  }, [
    enableAutoCapture,
    priorityQuestions,
    report.scanId,
    report.debug?.inputUrl,
    report.debug?.finalUrl,
    report.formUrl,
    report.form.url,
  ]);

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

  const runDownload = async (includeCapture: boolean) => {
    setError(null);
    setBusy(true);
    setShowCaptureWaitPrompt(false);
    try {
      const model = buildReportEvidenceModel(report, audienceReport);
      const pkg = await buildEvidencePackage(model, manualFiles, {
        autoScreenshots: includeCapture ? autoScreenshots : [],
        captureLimitations: [
          ...(enableAutoCapture ? captureLimitations : []),
          ...(!includeCapture && enableAutoCapture
            ? ["사용자가 캡처 없이 다운로드를 선택했습니다."]
            : []),
        ],
        captureAttempted: enableAutoCapture,
      });
      downloadBlob(pkg.blob, pkg.fileName);
    } catch (err) {
      console.error(err);
      setError("증빙자료 생성 중 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const onDownloadClick = () => {
    if (enableAutoCapture && captureStatus === "loading") {
      setShowCaptureWaitPrompt(true);
      return;
    }
    void runDownload(true);
  };

  const sourceKind =
    report.form.metadata?.source?.kind === "file" ? "file" : "url";

  const captureIcon =
    captureStatus === "loading" ? (
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    ) : captureStatus === "success" ? (
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
      {enableAutoCapture ? (
        <div className="flex items-start gap-3.5 rounded-xl border border-rose-200 bg-white px-4 py-3.5">
          <span
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${
              captureStatus === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : captureStatus === "loading"
                  ? "border-slate-200 bg-slate-50 text-slate-600"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {captureIcon}
          </span>
          <div className="min-w-0 flex-1">
            {captureStatus === "loading" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  자동 화면 캡처 진행 중
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  공개 설문 전체 페이지를 캡처합니다. 개인정보 값 입력·제출은
                  하지 않습니다.
                </p>
              </>
            ) : null}
            {captureStatus === "success" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  자동 화면 캡처 완료 · {autoScreenshots.length}장
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {`전체 ${autoScreenshots.length}장 캡처 · ZIP에 포함됩니다.`}
                  {captureLimitations.some((line) => /막혔|추가 캡처/.test(line))
                    ? " 일부 페이지는 필수 개인정보 문항 등으로 이동이 막혀 추가 첨부가 필요할 수 있습니다."
                    : ""}
                </p>
              </>
            ) : null}
            {captureStatus === "timeout" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  자동 화면 캡처 시간 초과
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  문항·고지문 원문은 증빙에 포함됩니다. 필요하면 추가 캡처를
                  첨부하세요.
                </p>
              </>
            ) : null}
            {captureStatus === "failed" ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  자동 화면 캡처 실패
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  접근 제한·로딩 초과·필수응답 차단 등으로 캡처가 제한될 수
                  있습니다.
                </p>
              </>
            ) : null}
          </div>
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
            화면 캡처가 아직 진행 중입니다. 캡처를 포함하려면 잠시 후 다시
            다운로드해 주세요.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowCaptureWaitPrompt(false)}
              className="inline-flex items-center justify-center rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800"
            >
              캡처 완료 후 다운로드
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

      <div className="flex flex-col gap-2.5 sm:flex-row">
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
