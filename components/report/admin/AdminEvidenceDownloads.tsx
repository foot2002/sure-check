"use client";

import { useState } from "react";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  classifyOutreachPriority,
  evidenceDownloadFilename,
  needsEvidenceDownload,
} from "@/lib/report/adminOutreach";

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
  const zip = files.find((f) => f.evidenceType === "temporary_zip");
  const notice = files.find((f) => f.evidenceType === "notice_screenshot");
  const personal = files.find((f) => f.evidenceType === "pii_question_screenshot");
  const sensitive = files.find((f) => f.evidenceType === "sensitive_question_screenshot");
  const highRisk = files.find((f) => f.evidenceType === "high_risk_question_screenshot");
  const firstPage =
    files.find(
      (f) =>
        f.evidenceType === "key_screenshot" &&
        (f.pageNumber === 1 || /첫|공개 설문/.test(f.label || "")),
    ) || files.find((f) => f.evidenceType === "key_screenshot");
  const submitPage = files.find((f) =>
    /제출|직전|submit/.test(`${f.label || ""}`),
  );
  const screenshots = files.filter((f) => f.evidenceType !== "temporary_zip");

  async function downloadFile(fileId: string, filename: string) {
    setBusy(fileId);
    try {
      const res = await fetch(
        `/api/report/admin/evidence/${fileId}/download?caseId=${encodeURIComponent(detail.id)}`,
      );
      if (!res.ok) {
        onMessage?.("증빙 파일을 내려받지 못했습니다.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function downloadAllScreenshots() {
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
    "rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50";
  const ghost =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  if (!show && files.length === 0) return null;

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
          {zip ? (
            <button
              type="button"
              className={btn}
              disabled={Boolean(busy)}
              onClick={() =>
                void downloadFile(
                  zip.id,
                  evidenceDownloadFilename({
                    caseId: detail.id,
                    evidenceType: "temporary_zip",
                  }),
                )
              }
            >
              신고용 ZIP 다운로드
            </button>
          ) : (
            <p className="w-full text-xs text-amber-800">
              신고용 ZIP이 없습니다. 증빙자료 생성을 권장합니다.
            </p>
          )}
          {screenshots.length > 0 ? (
            <button
              type="button"
              className={btn}
              disabled={Boolean(busy)}
              onClick={() => void downloadAllScreenshots()}
            >
              캡처 이미지 전체 다운로드
            </button>
          ) : null}
          {firstPage ? (
            <button type="button" className={ghost} disabled={Boolean(busy)} onClick={() => void downloadFile(firstPage.id, evidenceDownloadFilename({ caseId: detail.id, evidenceType: firstPage.evidenceType, label: firstPage.label, pageNumber: firstPage.pageNumber }))}>
              첫 페이지 캡처 다운로드
            </button>
          ) : null}
          {notice ? (
            <button type="button" className={ghost} disabled={Boolean(busy)} onClick={() => void downloadFile(notice.id, evidenceDownloadFilename({ caseId: detail.id, evidenceType: notice.evidenceType, label: notice.label }))}>
              고지문 캡처 다운로드
            </button>
          ) : null}
          {personal ? (
            <button type="button" className={ghost} disabled={Boolean(busy)} onClick={() => void downloadFile(personal.id, evidenceDownloadFilename({ caseId: detail.id, evidenceType: personal.evidenceType }))}>
              개인정보 문항 캡처 다운로드
            </button>
          ) : null}
          {sensitive ? (
            <button type="button" className={ghost} disabled={Boolean(busy)} onClick={() => void downloadFile(sensitive.id, evidenceDownloadFilename({ caseId: detail.id, evidenceType: sensitive.evidenceType }))}>
              민감정보 문항 캡처 다운로드
            </button>
          ) : null}
          {highRisk ? (
            <button type="button" className={ghost} disabled={Boolean(busy)} onClick={() => void downloadFile(highRisk.id, evidenceDownloadFilename({ caseId: detail.id, evidenceType: highRisk.evidenceType }))}>
              고위험정보 문항 캡처 다운로드
            </button>
          ) : null}
          {submitPage ? (
            <button type="button" className={ghost} disabled={Boolean(busy)} onClick={() => void downloadFile(submitPage.id, evidenceDownloadFilename({ caseId: detail.id, evidenceType: submitPage.evidenceType, label: submitPage.label }))}>
              제출 직전 페이지 캡처 다운로드
            </button>
          ) : null}
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
