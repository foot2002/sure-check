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
    <div className="rounded-[1.75rem] border border-border-subtle bg-white p-6 shadow-[var(--report-shadow-soft)] md:p-7">
      <h3 className="mb-5 flex items-center gap-2.5 text-xl font-bold text-foreground md:text-2xl">
        <Share2 size={20} className="text-teal-700" strokeWidth={2.25} />
        공유 · 복사 · 다운로드
      </h3>

      <div className="flex flex-wrap gap-3">
        {primaryActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="report-btn-primary bg-teal-700 text-white shadow-md hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-300"
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
            className={`report-btn-secondary ${
              disabled
                ? "cursor-not-allowed opacity-50"
                : accent
                  ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : ""
            }`}
          >
            <Icon size={16} strokeWidth={2.25} />
            {label}
          </button>
        ))}
      </div>

      {toast && (
        <p
          className={`mt-4 rounded-2xl px-4 py-3 text-base font-medium ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-amber-50 text-amber-900"
          }`}
          role="status"
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
