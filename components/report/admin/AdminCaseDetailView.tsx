"use client";

import Link from "next/link";
import { useState, useEffect, type ReactNode } from "react";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import type { PublicationStatus, ReviewOutcome, ReviewStatus } from "@/lib/db/types";
import { AdminOutreachSections } from "@/components/report/admin/AdminOutreachSections";
import { AdminEvidenceDownloads } from "@/components/report/admin/AdminEvidenceDownloads";
import {
  formatDataCollectionSummary,
  outreachUiStatusKo,
  classifyOutreachUiStatus,
  isOutreachCandidate,
  classifyOutreachPriority,
  pickIssueBadges,
  publicPrivateKo,
  publicationStatusKo,
  reviewStatusKo,
  riskLabelKo,
} from "@/lib/report/adminOutreach";
import { AdminCaseActionBar } from "@/components/report/admin/AdminCaseActionBar";
import { publicCaseStatusKo } from "@/lib/report/publicCasePolicy";

const TABS = ["요약", "증거", "검토·조치"] as const;

type Tab = (typeof TABS)[number];

function severityRank(severity: string): number {
  const s = severity.toLowerCase();
  if (s === "critical") return 0;
  if (s === "high") return 1;
  if (s === "medium") return 2;
  return 3;
}

function questionKindLabel(q: {
  hasPersonalInfo: boolean;
  hasSensitiveInfo: boolean;
  hasHighRiskInfo: boolean;
}): string {
  if (q.hasHighRiskInfo) return "고위험정보";
  if (q.hasSensitiveInfo) return "민감정보";
  if (q.hasPersonalInfo) return "개인정보";
  return "일반";
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-all text-sm text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

export function AdminCaseDetailView({
  detail,
  error,
}: {
  detail: AdminCaseDetail | null;
  error: string | null;
}) {
  const [tab, setTab] = useState<Tab>("요약");
  const [message, setMessage] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [namedWarningOpen, setNamedWarningOpen] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(
    detail?.summary.reviewStatus || "pending",
  );
  const [reviewerNote, setReviewerNote] = useState(
    detail?.reviewCase?.reviewerNote || "",
  );
  const [resolutionNote, setResolutionNote] = useState(
    detail?.reviewCase?.resolutionNote || "",
  );
  const [outcome, setOutcome] = useState<ReviewOutcome | "">(
    detail?.reviewCase?.outcome || "",
  );
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus>(
    detail?.summary.publicationStatus || "private",
  );

  const reportJsonText = detail?.reportJson
    ? JSON.stringify(detail.reportJson, null, 2)
    : "";

  async function openEvidence(evidenceFileId: string) {
    setMessage(null);
    const res = await fetch(
      `/api/report/admin/evidence/${evidenceFileId}/signed-url`,
      { method: "POST" },
    );
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      url?: string;
      signedUrl?: string;
      error?: string;
    } | null;
    const url = data?.url || data?.signedUrl;
    if (!res.ok || !url) {
      setMessage(
        data?.error ||
          "증빙 파일 메타데이터는 있으나 Storage 접근 URL 생성에 실패했습니다. Storage 경로, 버킷 권한, 파일 만료 여부를 확인하세요.",
      );
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyHash(value: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setMessage("SHA256을 복사했습니다.");
  }

  async function saveReview() {
    if (!detail) return;
    setMessage(null);
    const res = await fetch(`/api/report/admin/cases/${detail.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewStatus,
        reviewerNote,
        resolutionNote,
        outcome: outcome || null,
      }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(data?.error || "검토 저장 실패");
      return;
    }
    setMessage("검토 상태를 저장했습니다.");
  }

  async function savePublication(allowNamed = false) {
    if (!detail) return;
    setMessage(null);
    if (publicationStatus === "public_named" && !allowNamed) {
      setNamedWarningOpen(true);
      return;
    }
    const res = await fetch(`/api/report/admin/cases/${detail.id}/publication`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicationStatus,
        allowNamed,
      }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setMessage(data?.error || "개선안내 상태 저장 실패");
      return;
    }
    setNamedWarningOpen(false);
    setMessage("개선안내 상태를 저장했습니다.");
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <p className="text-lg font-semibold text-slate-900">
          {error || "케이스를 찾을 수 없습니다."}
        </p>
        <Link
          href="/report/admin"
          className="mt-4 inline-block text-sm text-teal-800 hover:underline"
        >
          목록으로
        </Link>
      </div>
    );
  }

  const s = detail.summary;

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/report/admin" className="text-sm text-teal-800 hover:underline">
            ← 검토 큐
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {s.surveyTitle || "(제목 없음)"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {s.operatorName || "운영주체 미확인"} · {publicPrivateKo(s.publicPrivateType)} · {riskLabelKo(s.overallRiskLevel)}
          </p>
          <div className="mt-3">
            <AdminCaseActionBar
              caseId={detail.id}
              surveyUrl={s.surveyUrl}
              zipFileId={s.temporaryZipId}
              screenshotIds={s.screenshotFileIds}
              screenshotMeta={detail.evidenceFiles}
              showIndividualCaptures
              publicCaseStatus={s.publicCaseStatus}
              onMessage={setMessage}
            />
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>검토: {reviewStatusKo(s.reviewStatus)}</p>
          <p>
            개선안내:{" "}
            {outreachUiStatusKo(
              classifyOutreachUiStatus({
                reviewStatus: s.reviewStatus,
                publicationStatus: s.publicationStatus,
                outreachCandidate: isOutreachCandidate(
                  classifyOutreachPriority({
                    publicPrivateType: s.publicPrivateType,
                    hasPersonalInfo: s.hasPersonalInfo,
                    hasSensitiveInfo: s.hasSensitiveInfo,
                    hasHighRiskInfo: s.hasHighRiskInfo,
                    overallRiskLevel: s.overallRiskLevel,
                    userDecisionLabel: s.userDecisionLabel,
                    evidenceCount: s.evidenceCount,
                    issueBadges: pickIssueBadges({
                      userDecisionLabel: s.userDecisionLabel,
                      hasSensitiveInfo: s.hasSensitiveInfo,
                      hasHighRiskInfo: s.hasHighRiskInfo,
                      isPublic: s.publicPrivateType === "public",
                    }),
                  }),
                ),
              }),
            )}
          </p>
          <p>
            공개 사례: {publicCaseStatusKo(s.publicCaseStatus)}
            {s.publicId ? ` · ${s.publicId}` : ""}
          </p>
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {message}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === name
                ? "bg-teal-700 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "요약" ? (
        <div className="space-y-5">
          <AdminOutreachSections detail={detail} onMessage={setMessage} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-500">
                  {s.operatorName || "운영주체 미확인"} · {s.platform} ·{" "}
                  {publicPrivateKo(s.publicPrivateType)}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  점수 {s.score == null ? "—" : s.score.toFixed(1)} ·{" "}
                  <span
                    className={
                      s.overallRiskLevel === "critical"
                        ? "text-rose-700"
                        : s.overallRiskLevel === "high"
                          ? "text-orange-600"
                          : "text-amber-600"
                    }
                  >
                    {riskLabelKo(s.overallRiskLevel)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {s.userDecisionLabel || "—"} · 상태 {s.diagnosisStatus || "—"}
                </p>
              </div>
              <div className="text-right text-sm text-slate-700">
                <p className="whitespace-pre-line">
                  {formatDataCollectionSummary({
                    personalCount: s.personalInfoQuestionCount,
                    sensitiveCount: s.sensitiveQuestionCount,
                    highRiskCount: s.highRiskQuestionCount,
                    hasPersonalInfo: s.hasPersonalInfo,
                    hasSensitiveInfo: s.hasSensitiveInfo,
                    hasHighRiskInfo: s.hasHighRiskInfo,
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  캡처 {s.captureStatus || "—"} · 증거 {s.evidenceCount}
                </p>
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">핵심 문제 TOP 3</h3>
            <p className="mt-1 text-xs text-slate-500">
              자동진단 결과이며 위법 여부를 단정하지 않습니다. 위반 소지·미흡·확인
              필요로 해석하세요.
            </p>
            <ol className="mt-3 space-y-2">
              {[...detail.findings]
                .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
                .slice(0, 3)
                .map((f, index) => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-slate-500">
                      {index + 1}. {f.severity.toUpperCase()}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-900">{f.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {f.evidenceNote || f.description || "—"}
                    </p>
                  </li>
                ))}
              {detail.findings.length === 0 ? (
                <li className="text-sm text-slate-500">핵심 finding이 없습니다.</li>
              ) : null}
            </ol>
          </section>

          {detail.indexScores ? (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["overall", detail.indexScores.overallScore],
                ["data", detail.indexScores.dataScore],
                ["notice", detail.indexScores.noticeScore],
                ["tool", detail.indexScores.toolScore],
                ["management", detail.indexScores.managementScore],
              ].map(([k, v]) => (
                <Meta
                  key={String(k)}
                  label={`${k} score`}
                  value={v == null ? "—" : Number(v).toFixed(1)}
                />
              ))}
            </div>
          ) : null}

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              개인정보·민감정보 문항
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {detail.questions
                .filter(
                  (q) =>
                    q.hasPersonalInfo || q.hasSensitiveInfo || q.hasHighRiskInfo,
                )
                .slice(0, 8)
                .map((q) => (
                  <li key={q.id} className="rounded border border-slate-100 px-2 py-1.5">
                    <span className="text-xs text-slate-500">
                      {questionKindLabel(q)}
                    </span>{" "}
                    {q.questionLabel}
                  </li>
                ))}
              {detail.questions.every(
                (q) =>
                  !q.hasPersonalInfo && !q.hasSensitiveInfo && !q.hasHighRiskInfo,
              ) ? (
                <li className="text-slate-500">탐지된 개인정보 문항이 없습니다.</li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">고지/기관/연락처 상태</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {detail.complianceChecks.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <p className="text-slate-800">{c.checkItem}</p>
                  <p className="text-xs text-slate-500">
                    {c.statusLabel || c.status}
                    {c.evidenceNote ? ` · ${c.evidenceNote}` : ""}
                  </p>
                </div>
              ))}
              {detail.complianceChecks.length === 0 ? (
                <p className="text-sm text-slate-500">고지 점검 항목이 없습니다.</p>
              ) : null}
            </div>
          </section>

          <div>
            <button
              type="button"
              onClick={() => setQuestionsOpen((v) => !v)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800"
            >
              {questionsOpen ? "문항 전체 접기" : "문항 전체 펼치기"}
            </button>
            {questionsOpen ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      {["번호", "문항", "수집 유형", "등급"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.questions.map((q) => (
                      <tr key={q.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-500">
                          {q.questionNumber || "—"}
                        </td>
                        <td className="max-w-md px-3 py-2 text-slate-900">
                          {q.questionLabel}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {questionKindLabel(q)}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {q.dataRiskLevel || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {detail.performance ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setTechOpen((v) => !v)}
                className="text-sm font-semibold text-slate-900"
              >
                기술정보 {techOpen ? "▾" : "▸"}
              </button>
              {techOpen ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Meta
                    label="extractionMode"
                    value={detail.performance.extractionMode}
                  />
                  <Meta
                    label="browserUsed"
                    value={detail.performance.browserUsed ? "true" : "false"}
                  />
                  <Meta
                    label="totalDurationMs"
                    value={detail.performance.totalDurationMs}
                  />
                  <Meta
                    label="extractDurationMs"
                    value={detail.performance.extractDurationMs}
                  />
                  <Meta
                    label="analysisDurationMs"
                    value={detail.performance.analysisDurationMs}
                  />
                  <Meta
                    label="saveDurationMs"
                    value={detail.performance.saveDurationMs}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "증거" ? (
        <div className="space-y-5">
          <AdminEvidenceDownloads detail={detail} onMessage={setMessage} />
          {detail.captureJobs.length > 0 ? (
            detail.captureJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="mb-3 text-sm font-semibold text-slate-800">
                  캡처 작업 요약
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Meta label="캡처 모드" value={job.captureMode} />
                  <Meta label="캡처 상태" value={job.status} />
                  <Meta label="완료 수준" value={job.completeness} />
                  <Meta label="캡처 페이지 수" value={job.capturedPageCount} />
                  <Meta label="핵심 증거 수" value={job.keyEvidenceCount} />
                  <Meta
                    label="임시 입력값 사용"
                    value={job.temporaryAnswersUsed ? "예" : "아니오"}
                  />
                  <Meta
                    label="최종 제출 클릭"
                    value={job.finalSubmitClicked ? "예" : "아니오"}
                  />
                  <Meta label="중단 사유" value={job.stopReason || "—"} />
                </div>
                {job.finalSubmitClicked ? (
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    주의: 이 캡처 작업에서 최종 제출 클릭 기록이 있습니다.
                    정상적인 증빙 캡처에서는 final_submit_clicked가 false여야
                    합니다.
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              연결된 캡처 작업(capture_jobs)이 없습니다.
            </div>
          )}

          {detail.evidenceFiles.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="font-semibold text-amber-900">
                {detail.evidenceEmptyState.title}
              </p>
              <p className="mt-2 text-sm text-amber-800">
                {detail.evidenceEmptyState.detail}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    {[
                      "유형",
                      "라벨",
                      "페이지",
                      "보관 수준",
                      "만료일",
                      "크기",
                      "SHA256",
                      "동작",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.evidenceFiles.map((file) => (
                    <tr key={file.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-900">
                        {file.evidenceTypeLabel}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-slate-700">
                        {file.label || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {file.pageNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {file.retentionLevel}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {file.expiresAt
                          ? new Date(file.expiresAt).toLocaleString("ko-KR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {file.byteSize == null
                          ? "—"
                          : `${Math.round(file.byteSize / 1024)} KB`}
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2 font-mono text-xs text-slate-500">
                        {file.sha256 || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEvidence(file.id)}
                            className="rounded bg-teal-700 px-2 py-1 text-xs font-semibold text-white"
                          >
                            {file.evidenceType === "temporary_zip"
                              ? "ZIP 다운로드"
                              : "캡처 보기"}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyHash(file.sha256)}
                            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                          >
                            해시 복사
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "검토·조치" ? (
        <div className="space-y-6">
          <div className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">검토 처리</h3>
            <p className="text-sm text-slate-500">
              법률 확정 표현을 피하고, 위반 소지 / 개선 권고 / 추가 확인 필요로
              기록하세요.
            </p>
            <label className="block text-sm text-slate-700">
              검토 상태
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}
              >
                {["none", "pending", "in_review", "resolved", "dismissed"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {reviewStatusKo(v)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              조치 결과 (outcome)
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={outcome}
                onChange={(e) =>
                  setOutcome((e.target.value || "") as ReviewOutcome | "")
                }
              >
                <option value="">(선택 안 함)</option>
                {[
                  "needs_more_info",
                  "improvement_recommended",
                  "deficiency_suspected",
                  "violation_risk",
                  "no_action",
                  "dismissed",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              검토 메모
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              해결 메모
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={saveReview}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              검토 상태 저장
            </button>
          </div>

          <div className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">개선안내 상태</h3>
            <ul className="space-y-1 text-sm text-slate-500">
              <li>내부검토: 공문 발송 전 내부 확인</li>
              <li>통계만 반영: 집계 통계에만 포함</li>
              <li>익명 사례 가능: 익명 사례로 참고 가능</li>
              <li>기관명 포함 검토: 기관명 포함 여부는 신중히 판단</li>
              <li>보관/제외: 발송 대상에서 제외</li>
            </ul>
            <label className="block text-sm text-slate-700">
              개선안내 상태
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={publicationStatus}
                onChange={(e) =>
                  setPublicationStatus(e.target.value as PublicationStatus)
                }
              >
                {[
                  "private",
                  "aggregate_only",
                  "public_anonymized",
                  "public_named",
                  "archived",
                ].map((v) => (
                  <option key={v} value={v}>
                    {publicationStatusKo(v)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => savePublication(false)}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              개선안내 상태 저장
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">원본 진단 JSON</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setJsonOpen((v) => !v)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800"
              >
                {jsonOpen ? "접기" : "펼치기"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(reportJsonText);
                  setMessage("report_json을 복사했습니다.");
                }}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-900"
              >
                복사
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              관리자·개발 검수용입니다. 집계 통계 API에는 포함되지 않습니다.
            </p>
            {jsonOpen ? (
              <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                {reportJsonText || "(report_json 없음)"}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}

      {namedWarningOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-lg rounded-2xl border border-amber-200 bg-white p-5">
            <h2 className="text-lg font-bold text-amber-900">
              기관명 포함 검토 경고
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              기관·기업명을 외부 자료에 넣는 것은 명예훼손, 사실오인, 법적 분쟁
              가능성이 있으므로 검토 완료 후 신중하게 선택해야 합니다. 자동진단
              결과만으로 위법 여부를 단정하거나 단정적으로 표현해서는 안 됩니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNamedWarningOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => savePublication(true)}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white"
              >
                이해했으며 기관명 포함 검토로 저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
