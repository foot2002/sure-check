"use client";

import Link from "next/link";
import { useState } from "react";
import { evidenceDownloadFilename } from "@/lib/report/adminOutreach";
import {
  downloadAdminBlob,
  evidenceProxyDownloadUrl,
  reviewReportDownloadUrl,
  reviewReportFilename,
} from "@/components/report/admin/adminDownloads";

export function AdminCaseActionBar({
  caseId,
  surveyUrl,
  zipFileId,
  screenshotIds,
  screenshotMeta,
  showFullDetailLink = false,
  showIndividualCaptures = false,
  onMessage,
}: {
  caseId: string;
  surveyUrl?: string | null;
  zipFileId?: string | null;
  screenshotIds?: string[];
  screenshotMeta?: Array<{
    id: string;
    evidenceType: string;
    label?: string | null;
    pageNumber?: number | null;
  }>;
  showFullDetailLink?: boolean;
  showIndividualCaptures?: boolean;
  onMessage?: (text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const shots = screenshotIds || [];
  const hasUrl = Boolean(surveyUrl);
  const btn =
    "rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45";
  const ghost =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    try {
      await task();
    } catch {
      onMessage?.("다운로드에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!surveyUrl) return;
    await navigator.clipboard.writeText(surveyUrl);
    onMessage?.("복사되었습니다.");
  }

  async function downloadReport() {
    await downloadAdminBlob(reviewReportDownloadUrl(caseId), reviewReportFilename(caseId));
  }

  async function downloadZip() {
    if (!zipFileId) return;
    await downloadAdminBlob(
      evidenceProxyDownloadUrl(zipFileId, caseId),
      evidenceDownloadFilename({ caseId, evidenceType: "temporary_zip" }),
    );
  }

  async function downloadScreenshots() {
    if (shots.length > 0) {
      const metaById = new Map((screenshotMeta || []).map((f) => [f.id, f]));
      for (const id of shots) {
        const meta = metaById.get(id);
        await downloadAdminBlob(
          evidenceProxyDownloadUrl(id, caseId),
          evidenceDownloadFilename({
            caseId,
            evidenceType: meta?.evidenceType || "key_screenshot",
            label: meta?.label,
            pageNumber: meta?.pageNumber,
          }),
        );
      }
      return;
    }
    if (zipFileId) {
      await downloadZip();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasUrl ? (
        <a
          href={surveyUrl || undefined}
          target="_blank"
          rel="noreferrer"
          className={btn}
        >
          원본 설문 열기
        </a>
      ) : (
        <button type="button" className={btn} disabled>
          원본 없음
        </button>
      )}
      <button
        type="button"
        className={ghost}
        disabled={!hasUrl}
        onClick={() => void copyUrl()}
      >
        {hasUrl ? "설문 URL 복사" : "URL 없음"}
      </button>
      <button
        type="button"
        className={btn}
        disabled={busy === "report"}
        onClick={() => void run("report", downloadReport)}
      >
        검토 리포트 다운로드
      </button>
      <button
        type="button"
        className={btn}
        disabled={!zipFileId || Boolean(busy)}
        title={zipFileId ? undefined : "신고용 ZIP 없음"}
        onClick={() => void run("zip", downloadZip)}
      >
        신고용 ZIP 다운로드
      </button>
      <button
        type="button"
        className={btn}
        disabled={(shots.length === 0 && !zipFileId) || Boolean(busy)}
        title={shots.length > 0 || zipFileId ? undefined : "캡처 이미지 없음"}
        onClick={() => void run("shots", downloadScreenshots)}
      >
        캡처 이미지 전체 다운로드
      </button>
      {showIndividualCaptures && (screenshotMeta || []).length > 0 ? (
        <details className="relative">
          <summary className={`${ghost} list-none cursor-pointer`}>
            개별 캡처 다운로드
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {(screenshotMeta || []).map((file) => (
              <button
                key={file.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(file.id, async () => {
                    await downloadAdminBlob(
                      evidenceProxyDownloadUrl(file.id, caseId),
                      evidenceDownloadFilename({
                        caseId,
                        evidenceType: file.evidenceType,
                        label: file.label,
                        pageNumber: file.pageNumber,
                      }),
                    );
                  })
                }
              >
                {file.label || file.evidenceType}
              </button>
            ))}
          </div>
        </details>
      ) : null}
      {showFullDetailLink ? (
        <Link
          href={`/report/admin/cases/${caseId}`}
          target="_blank"
          className={`${ghost} inline-flex items-center`}
        >
          새 탭에서 전체 상세 보기
        </Link>
      ) : null}
    </div>
  );
}
