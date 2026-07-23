"use client";

import { useState } from "react";
import {
  Copy,
  Download,
  FileText,
  Link2,
  MessageCircle,
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
  /** Compact toolbar for report header / utility strip */
  variant?: "toolbar" | "panel";
}

export function ShareActions({
  report,
  variant = "toolbar",
}: ShareActionsProps) {
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

  const actions = [
    {
      label: "요약 복사",
      icon: Copy,
      onClick: handleCopySummary,
      primary: true,
    },
    { label: "링크 복사", icon: Link2, onClick: handleCopyLink, primary: true },
    { label: "전체 복사", icon: FileText, onClick: handleCopyFull },
    { label: "Markdown", icon: Download, onClick: handleMarkdownDownload },
    { label: "카카오톡", icon: MessageCircle, onClick: handleKakaoShare },
    {
      label: "PDF",
      icon: FileText,
      onClick: handlePdfDownload,
      disabled: true,
      title: "PDF 다운로드 준비 중",
    },
  ];

  return (
    <div className={variant === "panel" ? "space-y-2" : "space-y-2"}>
      <div
        className={`flex flex-wrap items-center gap-1.5 ${
          variant === "toolbar" ? "justify-end" : ""
        }`}
        role="toolbar"
        aria-label="공유 · 복사 · 다운로드"
      >
        {actions.map(({ label, icon: Icon, onClick, primary, disabled, title }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title ?? label}
            className={`report-toolbar-btn ${
              primary ? "report-toolbar-btn-primary" : ""
            }`}
          >
            <Icon size={13} strokeWidth={2} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {toast ? (
        <p
          className={`text-xs font-medium ${
            toast.type === "success" ? "text-emerald-700" : "text-amber-700"
          } ${variant === "toolbar" ? "text-right" : ""}`}
          role="status"
        >
          {toast.message}
        </p>
      ) : null}
    </div>
  );
}
