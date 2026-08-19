"use client";

import { useState } from "react";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  classifyOutreachPriority,
  evidenceDownloadFilename,
  needsEvidenceDownload,
  pickEvidenceFile,
} from "@/lib/report/adminOutreach";
import {
  downloadAdminBlob,
  evidenceProxyDownloadUrl,
} from "@/components/report/admin/adminDownloads";

export function AdminEvidenceDownloads({
  detail,
  onMessage,
}: {
  detail: AdminCaseDetail;
  onMessage?: (text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const s = detail.summary;
  const priority = classifyOutreachPriority({
    publicPrivateType: s.publicPrivateType,
    hasPersonalInfo: s.hasPersonalInfo,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    overallRiskLevel: s.overallRiskLevel,
    userDecisionLabel: s.userDecisionLabel,
    evidenceCount: s.evidenceCount,
  });
  const show = needsEvidenceDownload({
    overallRiskLevel: s.overallRiskLevel,
    userDecisionLabel: s.userDecisionLabel,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    publicPrivateType: s.publicPrivateType,
    priority,
  });
  const files = detail.evidenceFiles;
  const zip = pickEvidenceFile(files, "zip");
  const notice = pickEvidenceFile(files, "notice");
  const personal = pickEvidenceFile(files, "pii");
  const sensitive = pickEvidenceFile(files, "sensitive");
  const highRisk = pickEvidenceFile(files, "high_risk");
  const firstPage = pickEvidenceFile(files, "first_page");
  const submitPage = pickEvidenceFile(files, "final_page");
  const screenshots = files.filter((f) => f.evidenceType !== "temporary_zip");

  async function downloadFile(fileId: string, filename: string) {
    setBusy(fileId);
    try {
      await downloadAdminBlob(evidenceProxyDownloadUrl(fileId, detail.id), filename);
    } catch {
      onMessage?.("증빙 파일을 내려받지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadAllScreenshots() {
    if (screenshots.length > 0) {
      for (const file of screenshots) {
        await downloadFile(
          file.id,
          evidenceDownloadFilename({
            caseId: detail.id,
            evidenceType: file.evidenceType,
            label: file.label,
            pageNumber: file.pageNumber,
          }),
        );
      }
      return;
    }
    if (zip) {
      await downloadFile(
        zip.id,
        evidenceDownloadFilename({
          caseId: detail.id,
          evidenceType: "temporary_zip",
        }),
      );
    }
  }

  async function enqueueCapture() {
    const diagnosisId = s.externalScanId;
    if (!diagnosisId || (!s.surveyUrl && !s.finalUrl)) {
      onMessage?.("캡처를 시작할 설문 URL 또는 진단 ID가 없습니다.");
      return;
    }
    setBusy("capture");
    try {
      const res = await fetch("/api/evidence/capture/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyUrl: s.surveyUrl,
          finalUrl: s.finalUrl,
          diagnosisId,
          mode: "evidence_full_walkthrough",
          captureMode: "evidence_full_walkthrough",
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        onMessage?.(data?.error || "증빙 생성을 큐에 넣지 못했습니다.");
        return;
      }
      onMessage?.("증빙 캡처를 대기열에 등록했습니다. 완료 후 새로고침하세요.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50";
  const ghost =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

  if (!show && files.length === 0) return null;

  function typedButton(
    label: string,
    file: { id: string; evidenceType: string; label?: string | null; pageNumber?: number | null } | null,
  ) {
    return (
      <button
        type="button"
        className={ghost}
        disabled={!file || Boolean(busy)}
        title={file ? undefined : `${label} 없음`}
        onClick={() => {
          if (!file) return;
          void downloadFile(
            file.id,
            evidenceDownloadFilename({
              caseId: detail.id,
              evidenceType: file.evidenceType,
              label: file.label,
              pageNumber: file.pageNumber,
            }),
          );
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">증빙자료 다운로드</h3>
      {files.length === 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p className="font-semibold">증거 부족 — 개선안내 전 추가 캡처 권장</p>
          <p className="mt-1 text-xs text-amber-800">
            {detail.evidenceEmptyState.detail}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              disabled={busy === "capture"}
              onClick={() => void enqueueCapture()}
            >
              증빙자료 생성
            </button>
            <button
              type="button"
              className={ghost}
              disabled={busy === "capture"}
              onClick={() => void enqueueCapture()}
            >
              캡처 다시 실행
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={!zip || Boolean(busy)}
            title={zip ? undefined : "신고용 ZIP 없음"}
            onClick={() => {
              if (!zip) return;
              void downloadFile(
                zip.id,
                evidenceDownloadFilename({
                  caseId: detail.id,
                  evidenceType: "temporary_zip",
                }),
              );
            }}
          >
            신고용 ZIP 다운로드
          </button>
          <button
            type="button"
            className={btn}
            disabled={(screenshots.length === 0 && !zip) || Boolean(busy)}
            onClick={() => void downloadAllScreenshots()}
          >
            캡처 이미지 전체 다운로드
          </button>
          {typedButton("첫 페이지 캡처 다운로드", firstPage)}
          {typedButton("고지문 캡처 다운로드", notice)}
          {typedButton("개인정보 문항 캡처 다운로드", personal)}
          {typedButton("민감정보 문항 캡처 다운로드", sensitive)}
          {typedButton("고위험정보 문항 캡처 다운로드", highRisk)}
          {typedButton("제출 직전 페이지 캡처 다운로드", submitPage)}
          <button
            type="button"
            className={ghost}
            disabled={busy === "capture"}
            onClick={() => void enqueueCapture()}
          >
            캡처 다시 실행
          </button>
        </div>
      )}
    </section>
  );
}
