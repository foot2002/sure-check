"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import type { PublicationStatus, ReviewOutcome, ReviewStatus } from "@/lib/db/types";

const TABS = [
  "요약",
  "문제 판단",
  "문항 분석",
  "증빙자료",
  "원본 진단 JSON",
  "검토 처리",
  "공개 처리",
] as const;

type Tab = (typeof TABS)[number];

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
      <p className="text-[11px] font-semibold tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-all text-sm text-slate-100">{value ?? "—"}</p>
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
  const [namedWarningOpen, setNamedWarningOpen] = useState(false);

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
      signedUrl?: string;
      error?: string;
    } | null;
    if (!res.ok || !data?.signedUrl) {
      setMessage(data?.error || "서명 URL 생성 실패");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
      setMessage(data?.error || "공개 상태 저장 실패");
      return;
    }
    setNamedWarningOpen(false);
    setMessage("공개 상태를 저장했습니다.");
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <p className="text-lg font-semibold text-white">
          {error || "케이스를 찾을 수 없습니다."}
        </p>
        <Link
          href="/report/admin"
          className="mt-4 inline-block text-sm text-teal-300 hover:underline"
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
          <Link href="/report/admin" className="text-sm text-teal-300 hover:underline">
            ← 검토 큐
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-white">
            {s.surveyTitle || "(제목 없음)"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {s.operatorName || "운영주체 미확인"} · {s.platform} · {s.overallRiskLevel}
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>검토: {s.reviewStatus}</p>
          <p>공개: {s.publicationStatus}</p>
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-teal-500/30 bg-teal-950/40 px-3 py-2 text-sm text-teal-100">
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
                ? "bg-teal-600 text-white"
                : "border border-slate-600 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "요약" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="설문 제목" value={s.surveyTitle} />
          <Meta
            label="설문 URL"
            value={
              s.surveyUrl ? (
                <a href={s.surveyUrl} target="_blank" rel="noreferrer" className="text-teal-300">
                  {s.surveyUrl}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Meta label="최종 URL" value={s.finalUrl} />
          <Meta label="플랫폼" value={s.platform} />
          <Meta label="운영주체" value={s.operatorName} />
          <Meta label="기관 유형" value={s.subjectType} />
          <Meta label="공공/민간" value={s.publicPrivateType} />
          <Meta label="위험도" value={s.overallRiskLevel} />
          <Meta label="점수" value={s.score == null ? "—" : s.score.toFixed(1)} />
          <Meta label="응답 판단" value={s.userDecisionLabel} />
          <Meta label="진단 상태" value={s.diagnosisStatus} />
          <Meta label="진단 신뢰도" value={s.confidence} />
          <Meta label="문항 수" value={s.questionCount} />
          <Meta label="개인정보 문항 수" value={s.personalInfoQuestionCount} />
          <Meta label="민감정보 문항 수" value={s.sensitiveQuestionCount} />
          <Meta label="고위험정보 문항 수" value={s.highRiskQuestionCount} />
          <Meta label="캡처 상태" value={s.captureStatus} />
          <Meta label="캡처 완료 여부" value={s.captureCompleteness} />
          <Meta label="증거 파일 수" value={s.evidenceCount} />
        </div>
      ) : null}

      {tab === "문제 판단" ? (
        <div className="space-y-6">
          <p className="text-sm text-slate-400">
            자동진단 항목입니다. 위반 확정이 아니라 위반 소지·미흡·확인 필요·개선
            권고로 해석하세요.
          </p>
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
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-400">
                <tr>
                  {["판단 항목", "상태/심각도", "근거 메모", "권고", "법/정책 코드"].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 text-left">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {detail.findings.map((f) => (
                  <tr key={f.id} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-100">
                      <p className="font-medium">{f.title}</p>
                      <p className="text-xs text-slate-500">
                        {f.findingType} · {f.checkDomain || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {f.status} / {f.severity}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-slate-300">
                      {f.evidenceNote || f.description || "—"}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-slate-300">
                      {f.recommendation || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {f.legalBasisCodes.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-400">
                <tr>
                  {["고지 항목", "도메인", "상태", "라벨", "근거", "법코드"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.complianceChecks.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-100">{c.checkItem}</td>
                    <td className="px-3 py-2 text-slate-400">{c.checkDomain}</td>
                    <td className="px-3 py-2 text-slate-300">{c.status}</td>
                    <td className="px-3 py-2 text-slate-300">{c.statusLabel}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {c.evidenceNote || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {c.legalBasisCode || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "문항 분석" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-700 text-xs text-slate-400">
              <tr>
                {[
                  "번호",
                  "페이지",
                  "문항 원문",
                  "유형",
                  "필수",
                  "등급",
                  "P/S/H",
                  "탐지 유형",
                  "키워드",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.questions.map((q) => (
                <tr key={q.id} className="border-b border-slate-800 align-top">
                  <td className="px-3 py-2 text-slate-300">{q.questionNumber || "—"}</td>
                  <td className="px-3 py-2 text-slate-300">{q.pageNumber ?? "—"}</td>
                  <td className="max-w-md px-3 py-2 text-slate-100">
                    {q.questionLabel}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{q.questionType || "—"}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {q.isRequired == null ? "—" : q.isRequired ? "Y" : "N"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {q.dataRiskLevel || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {q.hasPersonalInfo ? "P" : "-"}/
                    {q.hasSensitiveInfo ? "S" : "-"}/
                    {q.hasHighRiskInfo ? "H" : "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {q.categories.map((c) => c.categoryLabel).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {q.categories
                      .map((c) => c.matchedKeyword)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "증빙자료" ? (
        <div className="space-y-5">
          {detail.captureJobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-slate-700 bg-slate-950/40 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Meta label="캡처 모드" value={job.captureMode} />
                <Meta label="캡처 상태" value={job.status} />
                <Meta label="전체/부분" value={job.completeness} />
                <Meta label="캡처 페이지 수" value={job.capturedPageCount} />
                <Meta
                  label="임시 입력값 사용"
                  value={job.temporaryAnswersUsed ? "예" : "아니오"}
                />
                <Meta
                  label="최종 제출 감지"
                  value={job.finalSubmitDetected ? "예" : "아니오"}
                />
                <Meta
                  label="최종 제출 클릭"
                  value={job.finalSubmitClicked ? "예" : "아니오"}
                />
                <Meta label="경로 범위" value={job.pathScope} />
              </div>
              {job.finalSubmitClicked ? (
                <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
                  경고: final_submit_clicked=true 입니다. 정상적으로는 false여야
                  합니다.
                </p>
              ) : null}
            </div>
          ))}

          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-400">
                <tr>
                  {["유형", "키증거", "보관", "만료", "크기", "SHA256", "동작"].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 text-left">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {detail.evidenceFiles.map((file) => (
                  <tr key={file.id} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-100">
                      {file.label || file.evidenceType}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {file.isKeyEvidence ? "Y" : "N"}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {file.retentionLevel}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {file.expiresAt || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
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
                          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300"
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
        </div>
      ) : null}

      {tab === "원본 진단 JSON" ? (
        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setJsonOpen((v) => !v)}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
            >
              {jsonOpen ? "접기" : "펼치기"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(reportJsonText);
                setMessage("report_json을 복사했습니다.");
              }}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white"
            >
              복사
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            관리자·개발 검수용입니다. 공개 API에는 포함되지 않습니다.
          </p>
          {jsonOpen ? (
            <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
              {reportJsonText || "(report_json 없음)"}
            </pre>
          ) : null}
        </div>
      ) : null}

      {tab === "검토 처리" ? (
        <div className="max-w-2xl space-y-4 rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <p className="text-sm text-slate-400">
            법률 확정 표현을 피하고, 위반 소지 / 개선 권고 / 추가 확인 필요로
            기록하세요.
          </p>
          <label className="block text-sm text-slate-300">
            검토 상태
            <select
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}
            >
              {["none", "pending", "in_review", "resolved", "dismissed"].map(
                (v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            조치 결과 (outcome)
            <select
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
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
          <label className="block text-sm text-slate-300">
            검토 메모
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              value={reviewerNote}
              onChange={(e) => setReviewerNote(e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-300">
            해결 메모
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={saveReview}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
          >
            검토 상태 저장
          </button>
        </div>
      ) : null}

      {tab === "공개 처리" ? (
        <div className="max-w-2xl space-y-4 rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <ul className="space-y-1 text-sm text-slate-400">
            <li>private: 내부 전용</li>
            <li>aggregate_only: 공개 통계에만 포함</li>
            <li>public_anonymized: 익명 사례로 공개 가능</li>
            <li>public_named: 기관명 포함 공개 가능 (검토 완료 후)</li>
            <li>archived: 보관/제외</li>
          </ul>
          <label className="block text-sm text-slate-300">
            공개 상태
            <select
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
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
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => savePublication(false)}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
          >
            공개 상태 저장
          </button>
        </div>
      ) : null}

      {namedWarningOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-lg rounded-2xl border border-amber-500/40 bg-slate-900 p-5">
            <h2 className="text-lg font-bold text-amber-100">
              기관·기업명 공개 경고
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              기관·기업명 공개는 명예훼손, 사실오인, 법적 분쟁 가능성이 있으므로
              검토 완료 후 신중하게 선택해야 합니다. 자동진단 결과만으로 위반을
              확정하거나 단정적으로 표현해서는 안 됩니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNamedWarningOpen(false)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => savePublication(true)}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white"
              >
                이해했으며 public_named로 저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
