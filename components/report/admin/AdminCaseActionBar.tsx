"use client";

import Link from "next/link";
import { useState } from "react";
import { evidenceDownloadFilename } from "@/lib/report/adminOutreach";
import {
  downloadAdminBlob,
  detailReportDownloadUrl,
  detailReportFilename,
  evidenceProxyDownloadUrl,
  reviewReportDownloadUrl,
  reviewReportFilename,
} from "@/components/report/admin/adminDownloads";
import { AdminPublishCaseModal } from "@/components/report/admin/AdminPublishCaseModal";
import { PUBLIC_INDIVIDUAL_CASES_ENABLED } from "@/lib/report/publicCasePolicy";
import type { PublicCaseStatus } from "@/lib/db/types";

export function AdminCaseActionBar({
  caseId,
  surveyUrl,
  zipFileId,
  screenshotIds,
  screenshotMeta,
  showFullDetailLink = false,
  showIndividualCaptures = false,
  publicCaseStatus = "private",
  publicId = null,
  onMessage,
  onPublicCaseChanged,
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
  publicCaseStatus?: PublicCaseStatus;
  publicId?: string | null;
  onMessage?: (text: string) => void;
  onPublicCaseChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
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

  async function downloadDetailReport() {
    await downloadAdminBlob(detailReportDownloadUrl(caseId), detailReportFilename(caseId));
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
        요약리포트
      </button>
      <button
        type="button"
        className={btn}
        disabled={busy === "detail"}
        onClick={() => void run("detail", downloadDetailReport)}
      >
        상세리포트
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
      {PUBLIC_INDIVIDUAL_CASES_ENABLED ? (
        <>
          {publicCaseStatus === "private" || publicCaseStatus === "archived" ? (
            <button type="button" className={btn} onClick={() => setPublishOpen(true)}>
              공개 사례 등록
            </button>
          ) : null}
          {publicCaseStatus === "reviewing" || publicCaseStatus === "published" ? (
            <>
              <button type="button" className={btn} onClick={() => setPublishOpen(true)}>
                공개 사례 수정
              </button>
              <button
                type="button"
                className={ghost}
                disabled={busy === "pause"}
                onClick={() =>
                  void run("pause", async () => {
                    if (!window.confirm("이 공개 사례를 중지할까요?")) return;
                    const res = await fetch(`/api/report/admin/cases/${caseId}/public-case`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "pause" }),
                    });
                    const data = (await res.json().catch(() => null)) as { error?: string } | null;
                    if (!res.ok) throw new Error(data?.error || "중지 실패");
                    onMessage?.("공개 사례를 중지했습니다.");
                    onPublicCaseChanged?.();
                  })
                }
              >
                공개 중지
              </button>
            </>
          ) : null}
          {publicCaseStatus === "paused" ? (
            <button type="button" className={btn} onClick={() => setPublishOpen(true)}>
              다시 공개
            </button>
          ) : null}
          {publicCaseStatus === "published" && publicId ? (
            <Link
              href={`/cases/${publicId}`}
              target="_blank"
              className={`${ghost} inline-flex items-center`}
            >
              공개 페이지 열기
            </Link>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] leading-relaxed text-slate-500">
          개별 공개 사례 기능은 현재 운영하지 않습니다. 주간 리포트는 익명 통계와
          대표 위험 유형 중심으로 제공합니다.
        </p>
      )}
      {publishOpen ? (
        <AdminPublishCaseModal
          caseId={caseId}
          onClose={() => setPublishOpen(false)}
          onSaved={(text) => {
            onMessage?.(text);
            onPublicCaseChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}
