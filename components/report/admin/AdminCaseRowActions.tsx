"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminCaseListItem } from "@/lib/report/adminCases";
import { evidenceDownloadFilename } from "@/lib/report/adminOutreach";
import {
  downloadAdminBlob,
  evidenceProxyDownloadUrl,
  reviewReportDownloadUrl,
  reviewReportFilename,
} from "@/components/report/admin/adminDownloads";

export function AdminCaseRowActions({
  row,
  onReview,
  onMessage,
}: {
  row: AdminCaseListItem;
  onReview: () => void;
  onMessage?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasUrl = Boolean(row.surveyUrl);
  const hasZip = Boolean(row.temporaryZipId);
  const hasShots = row.screenshotFileIds.length > 0;
  const evidenceLabel =
    !hasZip && !hasShots
      ? row.evidenceStatus === "캡처 필요"
        ? "캡처 필요"
        : "증빙 없음"
      : "증빙";

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const btn =
    "rounded border border-teal-700 bg-teal-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45";
  const ghost =
    "rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch {
      onMessage?.("다운로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-nowrap items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button type="button" className={btn} onClick={onReview}>
        검토
      </button>
      {hasUrl ? (
        <a
          href={row.surveyUrl || undefined}
          target="_blank"
          rel="noreferrer"
          className={ghost}
        >
          원본
        </a>
      ) : (
        <button type="button" className={ghost} disabled title="원본 없음">
          원본 없음
        </button>
      )}
      <button
        type="button"
        className={ghost}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await downloadAdminBlob(
              reviewReportDownloadUrl(row.id),
              reviewReportFilename(row.id),
            );
          })
        }
      >
        리포트
      </button>
      <button
        type="button"
        className={ghost}
        disabled={busy || (!hasZip && !hasShots)}
        title={evidenceLabel}
        onClick={() =>
          void run(async () => {
            if (row.temporaryZipId) {
              await downloadAdminBlob(
                evidenceProxyDownloadUrl(row.temporaryZipId, row.id),
                evidenceDownloadFilename({
                  caseId: row.id,
                  evidenceType: "temporary_zip",
                }),
              );
              return;
            }
            for (const id of row.screenshotFileIds) {
              await downloadAdminBlob(
                evidenceProxyDownloadUrl(id, row.id),
                evidenceDownloadFilename({
                  caseId: row.id,
                  evidenceType: "key_screenshot",
                }),
              );
            }
          })
        }
      >
        {hasZip || hasShots ? "증빙" : evidenceLabel}
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className={ghost}
          onClick={() => setOpen((v) => !v)}
          aria-label="추가 조치"
        >
          ⋯
        </button>
        {open ? (
          <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={!hasUrl}
              onClick={async () => {
                if (!row.surveyUrl) return;
                await navigator.clipboard.writeText(row.surveyUrl);
                onMessage?.("복사되었습니다.");
                setOpen(false);
              }}
            >
              URL 복사
            </button>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={!hasShots || busy}
              onClick={() => {
                setOpen(false);
                void run(async () => {
                  for (const id of row.screenshotFileIds) {
                    await downloadAdminBlob(
                      evidenceProxyDownloadUrl(id, row.id),
                      evidenceDownloadFilename({
                        caseId: row.id,
                        evidenceType: "key_screenshot",
                      }),
                    );
                  }
                });
              }}
            >
              개별 캡처 다운로드
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
