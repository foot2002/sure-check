"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  FileText,
  FileUp,
  Info,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { ScanReport } from "@/lib/types/scan";

interface FileScanFormProps {
  onScanStart?: () => void;
  onScanComplete: (report: ScanReport) => void;
  onClear?: () => void;
}

type UploadPhase =
  | "idle"
  | "ready"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "building";

const EXTENSION_CHIPS = ["DOCX", "XLSX", "PDF", "HWPX"] as const;

const RECOMMENDED_ITEMS = [
  "설문 제목과 운영기관",
  "설문 목적과 안내문",
  "개인정보 수집·이용 고지문",
  "수집 항목, 보유기간, 파기 기준",
  "담당부서 또는 문의처",
  "전체 설문 문항과 선택지",
] as const;

const PHASE_LABEL: Record<Exclude<UploadPhase, "idle" | "ready">, string> = {
  uploading: "파일을 업로드하고 있습니다.",
  extracting: "파일에서 설문 문항을 읽고 있습니다.",
  analyzing: "개인정보 수집 항목을 확인하고 있습니다.",
  building: "고지문과 보유기간 안내를 확인하고 있습니다.",
};

const ALLOWED_EXTENSIONS = new Set(["docx", "xlsx", "pdf", "hwpx"]);

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function describeSelectedFile(file: File): {
  extensionLabel: string;
  supported: boolean;
  hint: string;
  tone: "ok" | "warn" | "error";
} {
  const extension = getExtension(file.name);
  const extensionLabel = extension ? extension.toUpperCase() : "알 수 없음";

  if (extension === "hwp") {
    return {
      extensionLabel,
      supported: false,
      hint: "HWP 파일은 현재 지원하지 않습니다. HWPX, PDF, DOCX로 변환 후 업로드해 주세요.",
      tone: "error",
    };
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      extensionLabel,
      supported: false,
      hint: "지원하지 않는 파일 형식입니다. DOCX, XLSX, 텍스트 PDF, HWPX 파일만 업로드해 주세요.",
      tone: "error",
    };
  }

  if (extension === "pdf") {
    return {
      extensionLabel,
      supported: true,
      hint: "PDF는 텍스트가 포함된 경우에만 정확히 분석됩니다. 스캔본이면 문항 분석이 제한될 수 있습니다.",
      tone: "warn",
    };
  }

  return {
    extensionLabel,
    supported: true,
    hint: "업로드 가능한 파일입니다. 진단하기를 눌러 분석을 시작하세요.",
    tone: "ok",
  };
}

export function FileScanForm({
  onScanStart,
  onScanComplete,
  onClear,
}: FileScanFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [dragOver, setDragOver] = useState(false);

  const busy =
    phase === "uploading" ||
    phase === "extracting" ||
    phase === "analyzing" ||
    phase === "building";

  const selectedInfo = useMemo(
    () => (file ? describeSelectedFile(file) : null),
    [file],
  );

  const selectFile = useCallback((next: File | null) => {
    setError(null);
    setFile(next);
    setPhase(next ? "ready" : "idle");
  }, []);

  function handleFiles(list: FileList | null) {
    const next = list?.[0] ?? null;
    selectFile(next);
  }

  function handleClear() {
    selectFile(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("설문지 파일을 선택해 주세요.");
      return;
    }

    const info = describeSelectedFile(file);
    if (!info.supported) {
      setError(info.hint);
      return;
    }

    onScanStart?.();
    setPhase("uploading");

    try {
      const body = new FormData();
      body.append("file", file);

      setPhase("extracting");
      await new Promise((resolve) => setTimeout(resolve, 250));
      setPhase("analyzing");

      const res = await fetch("/api/scan/file", {
        method: "POST",
        body,
      });

      setPhase("building");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "파일 진단을 완료하지 못했습니다.");
        setPhase("ready");
        return;
      }

      onScanComplete(data.report as ScanReport);
      setPhase("ready");
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      setPhase("ready");
    }
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-base font-bold text-foreground md:text-lg">
          설문 파일로 진단하기
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted md:text-[15px]">
          설문 링크가 없거나, 온라인 설문 문항을 자동으로 읽기 어려운 경우 설문지
          파일을 업로드해 진단할 수 있습니다.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted md:text-[15px]">
          문항만 있는 파일도 분석할 수 있지만, 설문 안내문과 개인정보 수집·이용
          고지문이 함께 포함되어 있으면 더 정확하게 진단됩니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXTENSION_CHIPS.map((ext) => (
          <span
            key={ext}
            className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-xs font-bold text-brand"
          >
            {ext}
          </span>
        ))}
      </div>

      <p className="text-sm text-muted">
        지원 파일: DOCX, XLSX, 텍스트 PDF, HWPX
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) handleFiles(e.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center transition ${
            dragOver
              ? "border-brand bg-[#eff6ff]"
              : "border-border bg-background"
          }`}
        >
          <Upload className="mx-auto text-brand" size={28} strokeWidth={1.75} />
          <p className="mt-3 text-sm font-semibold text-foreground">
            설문지·질문지·신청서 양식 파일을 업로드하세요.
          </p>
          <p className="mt-1 text-sm text-muted">
            DOCX, XLSX, 텍스트 PDF, HWPX 파일을 지원합니다.
          </p>
          <p className="mt-1 text-sm text-muted">
            안내문, 개인정보 고지문, 전체 문항이 함께 포함되어 있으면 더 정확하게
            진단됩니다.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            <FileUp size={16} />
            파일 선택
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.xlsx,.pdf,.hwpx,.hwp"
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {file && selectedInfo ? (
          <div
            className={`rounded-xl border px-4 py-3 ${
              selectedInfo.tone === "ok"
                ? "border-[#a7f3d0] bg-[#ecfdf5]"
                : selectedInfo.tone === "warn"
                  ? "border-[#fde68a] bg-[#fffbeb]"
                  : "border-[#fecaca] bg-[#fef2f2]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <p className="truncate text-sm font-semibold text-foreground">
                  {file.name}
                </p>
                <p className="text-xs text-muted md:text-sm">
                  형식: {selectedInfo.extensionLabel} · 크기:{" "}
                  {formatBytes(file.size)} · 지원 여부:{" "}
                  {selectedInfo.supported ? "지원" : "미지원"}
                </p>
                <p
                  className={`text-sm leading-relaxed ${
                    selectedInfo.tone === "error"
                      ? "text-[#991b1b]"
                      : selectedInfo.tone === "warn"
                        ? "text-[#92400e]"
                        : "text-[#065f46]"
                  }`}
                >
                  {selectedInfo.hint}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                disabled={busy}
                className="rounded-lg p-2 text-muted hover:bg-white/70 hover:text-foreground disabled:opacity-50"
                aria-label="선택 파일 지우기"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-4 text-sm leading-relaxed text-[#1e3a8a]">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-3">
              <div>
                <p className="font-bold text-[#1e40af]">
                  정확한 진단을 위한 권장 파일 구성
                </p>
                <p className="mt-1.5 text-[#1e3a8a]/90">
                  설문 문항만 있는 파일보다, 설문 안내문과 개인정보 수집·이용
                  고지문이 함께 포함된 파일이 더 정확하게 진단됩니다.
                </p>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {RECOMMENDED_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2563eb]"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg border border-[#93c5fd]/70 bg-white/70 px-3 py-2 text-[13px] font-medium text-[#1e40af] md:text-sm">
                안내문이나 고지문이 없는 파일도 분석은 가능하지만, 해당 항목은
                ‘미확인’으로 판단될 수 있습니다.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm leading-relaxed text-muted">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            HWP 파일은 HWPX, PDF, DOCX로 변환 후 업로드해 주세요. 스캔 PDF나
            이미지형 PDF는 문항을 정확히 읽지 못할 수 있습니다. PDF는 텍스트
            선택이 가능한 파일일 때 가장 정확하게 분석됩니다.
          </p>
        </div>

        {busy ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <Loader2 className="animate-spin text-brand" size={16} />
            {PHASE_LABEL[phase as Exclude<UploadPhase, "idle" | "ready">]}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-[#f5c2cc] bg-[#fdf0f2] px-4 py-3 text-sm text-[#9e2a3e]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!file || busy || selectedInfo?.supported === false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-[15px] font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              진단 중
            </>
          ) : (
            "진단하기"
          )}
        </button>
      </form>
    </div>
  );
}
