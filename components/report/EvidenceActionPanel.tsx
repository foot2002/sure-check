"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react";
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
  type ManualEvidenceFile,
} from "@/lib/evidence/evidenceTypes";

interface EvidenceActionPanelProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

type CaptureStatus = "idle" | "loading" | "success" | "failed" | "skipped";

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
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>(() =>
    enableAutoCapture ? "loading" : "skipped",
  );
  const [autoScreenshots, setAutoScreenshots] = useState<
    AutoCaptureEvidenceFile[]
  >([]);
  const [captureLimitations, setCaptureLimitations] = useState<string[]>([]);
  const [showCaptureWaitPrompt, setShowCaptureWaitPrompt] = useState(false);
  const captureStarted = useRef(false);

  useEffect(() => {
    if (!enableAutoCapture) return;
    if (captureStarted.current) return;
    captureStarted.current = true;

    let cancelled = false;
    const run = async () => {
      try {
        const surveyUrl =
          report.debug?.inputUrl || report.formUrl || report.form.url || "";
        const finalUrl =
          report.debug?.finalUrl || report.form.url || report.formUrl || "";
        const response = await fetch("/api/evidence/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surveyUrl,
            finalUrl,
            diagnosisId: report.scanId,
          }),
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
      } catch {
        if (cancelled) return;
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
    };
  }, [enableAutoCapture, report]);

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

  return (
    <section
      aria-labelledby="evidence-cta-title"
      className="relative overflow-hidden rounded-[1.75rem] border-2 border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50/40 p-5 shadow-[var(--report-shadow)] md:p-8"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-rose-200/40 blur-3xl"
        aria-hidden
      />
      <div className="relative space-y-5">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-rose-700 md:text-sm">
            신고 검토 안내
          </p>
          <h2
            id="evidence-cta-title"
            className="mt-2 text-2xl font-extrabold tracking-tight text-rose-950 md:text-3xl"
          >
            신고가 필요할 수 있는 설문입니다
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-rose-950/80 md:text-base">
            이 설문은 개인정보 수집 또는 처리 방식에 중대한 문제가 있을 수
            있습니다. 응답하지 않고 신고를 검토하는 것이 좋습니다.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-rose-900/70 md:text-[15px]">
            진단 결과, 탐지 문항, 고지문 확인 결과, 원본 추출자료, 자동 화면
            캡처, 해시값을 포함한 증빙자료를 내려받을 수 있습니다.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-rose-900/70 md:text-[15px]">
            화면 캡처는 응답값을 입력하지 않은 상태에서 자동으로 시도됩니다.
            필수응답이 필요한 뒷페이지는 자동 캡처하지 않습니다.
          </p>
        </div>

        {enableAutoCapture ? (
          <div className="rounded-2xl border border-rose-100 bg-white/80 p-4 md:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-800">
                {captureStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Camera className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {captureStatus === "loading" ? (
                  <>
                    <p className="text-sm font-semibold text-rose-950">
                      진단 당시 설문 화면을 자동으로 캡처하고 있습니다.
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-rose-800/75 md:text-sm">
                      응답값 입력이나 제출은 하지 않습니다.
                    </p>
                  </>
                ) : null}
                {captureStatus === "success" ? (
                  <>
                    <p className="text-sm font-semibold text-rose-950">
                      자동 화면 캡처 완료: {autoScreenshots.length}개
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-rose-800/75 md:text-sm">
                      캡처 이미지는 신고용 증빙자료 ZIP에 함께 포함됩니다.
                    </p>
                    {captureLimitations.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-rose-800/80">
                        {captureLimitations.map((item) => (
                          <li key={item}>· {item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
                {captureStatus === "failed" ? (
                  <>
                    <p className="text-sm font-semibold text-rose-950">
                      자동 화면 캡처를 완료하지 못했습니다.
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-rose-800/75 md:text-sm">
                      설문 페이지 접근 제한, 로딩 시간 초과, 필수응답 차단 등의
                      이유로 캡처가 제한될 수 있습니다. 문항 원문과 고지문
                      원문은 증빙자료에 포함됩니다.
                    </p>
                    {captureLimitations[0] ? (
                      <p className="mt-2 text-xs font-medium text-rose-800">
                        자동 화면 캡처 실패: {captureLimitations.slice(0, 2).join(" ")}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-rose-100 bg-white/80 p-4 md:p-5">
          <p className="text-sm font-semibold text-rose-950">추가 캡처 첨부</p>
          <p className="mt-2 text-xs leading-relaxed text-rose-800/75 md:text-sm">
            자동 캡처에 포함되지 않은 뒷페이지 문항이나 고지문 화면이 있다면
            직접 캡처 파일을 추가할 수 있습니다.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-rose-800/75 md:text-sm">
            응답값을 입력한 화면이나 본인의 개인정보가 입력된 화면은 첨부하지
            않는 것이 좋습니다. 가능하면 입력 전 화면을 캡처해 주세요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-900 transition hover:bg-rose-100"
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
            <span className="text-xs text-rose-800/70">
              PNG·JPG·PDF · 최대 {MAX_MANUAL_EVIDENCE_FILES}개 · 파일당 5MB
              이하 · 서버에 저장하지 않음
            </span>
          </div>
          {manualFiles.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {manualFiles.map((file, index) => (
                <li
                  key={`${file.fileName}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-rose-50/80 px-3 py-2 text-sm text-rose-950"
                >
                  <span className="truncate">{file.fileName}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-900"
                    aria-label={`${file.fileName} 제거`}
                  >
                    <X className="h-4 w-4" />
                    제거
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {showCaptureWaitPrompt ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4">
            <p className="text-sm font-semibold text-amber-950">
              화면 캡처가 아직 진행 중입니다. 캡처를 포함하려면 잠시 후 다시
              다운로드해 주세요.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowCaptureWaitPrompt(false)}
                className="inline-flex items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white"
              >
                캡처 완료 후 다운로드
              </button>
              <button
                type="button"
                onClick={() => {
                  void runDownload(false);
                }}
                className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900"
              >
                캡처 없이 다운로드
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={onDownloadClick}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
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
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-rose-300 bg-white px-5 py-3 text-sm font-bold text-rose-900 transition hover:bg-rose-50"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            KISA 개인정보침해 신고센터로 이동
          </a>
        </div>
        <p className="text-xs leading-relaxed text-rose-800/80 md:text-sm">
          증빙자료를 먼저 내려받은 뒤, 신고센터에서 첨부자료로 활용하세요.
        </p>
        <p className="text-xs leading-relaxed text-rose-900/65 md:text-sm">
          이 자료는 신고기관의 사실관계 확인을 돕기 위한 참고자료입니다. 최종
          위법 여부는 개인정보보호위원회 또는 KISA의 검토·조사 결과에 따라
          판단됩니다.
        </p>
        {error ? (
          <p className="text-sm font-medium text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
