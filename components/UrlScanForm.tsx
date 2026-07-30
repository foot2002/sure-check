"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Check, Copy, Link2, Loader2, X } from "lucide-react";
import { ScanProgress } from "@/components/ScanProgress";
import type { ScanJob, ScanReport } from "@/lib/types/scan";
import { copyToClipboard } from "@/lib/utils/copy";

interface UrlScanFormProps {
  onScanStart?: () => void;
  onScanComplete: (scanId: string) => void;
  /** Prefer this when /api/scan/start returns the report inline (Vercel-safe). */
  onReportReady?: (report: ScanReport) => void;
  onUrlClear?: () => void;
}

export function UrlScanForm({
  onScanStart,
  onScanComplete,
  onReportReady,
  onUrlClear,
}: UrlScanFormProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    onScanStart?.();

    const trimmed = url.trim();
    if (!trimmed) {
      setError("설문 URL을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setActiveScanId(null);

    try {
      const res = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formUrl: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "진단을 시작할 수 없습니다.");
        setIsSubmitting(false);
        return;
      }

      // Synchronous diagnosis: report comes back with /start (avoids lost
      // in-memory state across Vercel isolates + removes poll round-trips).
      if (data.report && onReportReady) {
        setIsSubmitting(false);
        onReportReady(data.report as ScanReport);
        return;
      }

      if (
        data.status === "completed" ||
        data.status === "limited" ||
        data.status === "failed"
      ) {
        setIsSubmitting(false);
        if (data.status === "failed") {
          setError(
            (data.errorMessage as string) || "진단 중 오류가 발생했습니다.",
          );
          return;
        }
        onScanComplete(data.scanId as string);
        return;
      }

      setActiveScanId(data.scanId);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      setIsSubmitting(false);
    }
  }

  const handleProgressError = useCallback((msg: string) => {
    setError(msg);
    setIsSubmitting(false);
    setActiveScanId(null);
  }, []);

  const handleProgressComplete = useCallback(
    (job: ScanJob) => {
      setIsSubmitting(false);
      setActiveScanId(null);
      onScanComplete(job.scanId);
    },
    [onScanComplete],
  );

  function handleClearUrl() {
    setUrl("");
    setError(null);
    setCopiedUrl(false);
    setIsSubmitting(false);
    setActiveScanId(null);
    onUrlClear?.();
  }

  async function handleCopyUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;

    const success = await copyToClipboard(trimmed);
    if (!success) {
      setError("링크를 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
      return;
    }

    setCopiedUrl(true);
    setError(null);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  return (
    <div className="w-full space-y-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="form-url" className="block text-xs font-medium text-muted">
          설문 URL
        </label>
        <div className="relative">
          <Link2
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60"
            size={16}
            strokeWidth={2}
          />
          <input
            id="form-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/forms/..."
            disabled={isSubmitting}
            className="w-full rounded-xl border border-border bg-background py-3.5 pl-10 pr-20 text-[15px] text-foreground placeholder:text-muted/50 transition focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
          />
          {url && (
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCopyUrl()}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-border/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20"
                aria-label="입력한 URL 복사"
                title={copiedUrl ? "복사됨" : "URL 복사"}
              >
                {copiedUrl ? (
                  <Check size={15} strokeWidth={2.25} />
                ) : (
                  <Copy size={15} strokeWidth={2.25} />
                )}
              </button>
              <button
                type="button"
                onClick={handleClearUrl}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-border/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20"
                aria-label="입력한 URL 삭제"
                title="URL 삭제"
              >
                <X size={15} strokeWidth={2.25} />
              </button>
            </div>
          )}
        </div>

        {error && (
          <p
            className="rounded-xl border border-[#f5c2cc] bg-[#fdf0f2] px-4 py-2.5 text-sm text-[#9e2a3e]"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-[15px] font-medium text-white transition hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              진단 중
            </>
          ) : (
            <>
              진단하기
              <ArrowRight size={16} strokeWidth={2} />
            </>
          )}
        </button>
      </form>

      {activeScanId && (
        <ScanProgress
          scanId={activeScanId}
          onComplete={handleProgressComplete}
          onError={handleProgressError}
        />
      )}
    </div>
  );
}
