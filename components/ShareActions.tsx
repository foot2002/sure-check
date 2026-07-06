"use client";

import { useState } from "react";
import {
  Copy,
  Download,
  FileText,
  Link2,
  MessageCircle,
  Share2,
} from "lucide-react";
import type { ScanReport } from "@/lib/types/scan";
import { copyToClipboard, getShareUrl } from "@/lib/utils/copy";
import {
  downloadMarkdown,
  reportToMarkdown,
  reportToSummaryText,
} from "@/lib/utils/markdown";

interface ShareState {
  message: string | null;
  type: "success" | "error";
}

interface ShareActionsProps {
  report: ScanReport;
}

export function ShareActions({ report }: ShareActionsProps) {
  const [toast, setToast] = useState<ShareState | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleCopySummary() {
    const ok = await copyToClipboard(reportToSummaryText(report));
    showToast(ok ? "요약이 복사되었습니다." : "복사에 실패했습니다.", ok ? "success" : "error");
  }

  async function handleCopyFull() {
    const ok = await copyToClipboard(reportToMarkdown(report));
    showToast(ok ? "전체 리포트가 복사되었습니다." : "복사에 실패했습니다.", ok ? "success" : "error");
  }

  async function handleCopyLink() {
    const ok = await copyToClipboard(getShareUrl(report.scanId));
    showToast(ok ? "공유 링크가 복사되었습니다." : "복사에 실패했습니다.", ok ? "success" : "error");
  }

  function handleMarkdownDownload() {
    downloadMarkdown(report);
    showToast("Markdown 파일을 다운로드했습니다.");
  }

  function handlePdfDownload() {
    showToast("PDF 다운로드는 준비 중입니다.", "error");
  }

  function handleKakaoShare() {
    showToast("카카오톡 공유는 준비 중입니다. 공유 링크 복사를 이용해 주세요.");
  }

  const primaryActions = [
    { label: "요약 복사", icon: Copy, onClick: handleCopySummary },
    { label: "링크 복사", icon: Link2, onClick: handleCopyLink },
  ];

  const secondaryActions = [
    { label: "전체 복사", icon: FileText, onClick: handleCopyFull },
    { label: "Markdown", icon: Download, onClick: handleMarkdownDownload },
    { label: "카카오톡", icon: MessageCircle, onClick: handleKakaoShare, accent: true },
    { label: "PDF (준비중)", icon: FileText, onClick: handlePdfDownload, disabled: true },
  ];

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-5 md:p-6">
      <h3 className="mb-4 flex items-center gap-2.5 text-base font-bold text-foreground md:text-lg">
        <Share2 size={18} className="text-brand" strokeWidth={2.25} />
        공유 · 복사 · 다운로드
      </h3>

      <div className="flex flex-wrap gap-2.5">
        {primaryActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <Icon size={16} strokeWidth={2.25} />
            {label}
          </button>
        ))}
        {secondaryActions.map(({ label, icon: Icon, onClick, accent, disabled }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand/20 ${
              disabled
                ? "cursor-not-allowed border-border-subtle text-muted/50"
                : accent
                  ? "border-[#f0e0a0] bg-[#fefce8] text-[#8a6914] hover:bg-[#fef9c3]"
                  : "border-border bg-background text-foreground hover:border-brand-muted hover:bg-brand-light/30"
            }`}
          >
            <Icon size={16} strokeWidth={2.25} />
            {label}
          </button>
        ))}
      </div>

      {toast && (
        <p
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
            toast.type === "success"
              ? "bg-[#edf7f1] text-[#1f6b47]"
              : "bg-[#fdf6e8] text-[#8a5f12]"
          }`}
          role="status"
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
