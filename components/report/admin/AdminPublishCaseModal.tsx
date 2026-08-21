"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicCaseDraft } from "@/lib/report/adminPublicCase";
import { evidenceProxyDownloadUrl } from "@/components/report/admin/adminDownloads";

const URL_WARNING =
  "설문 URL을 공개하면 외부 사용자가 해당 설문에 직접 접근할 수 있습니다. 종료되지 않은 설문이거나 개인정보 입력 화면이 포함된 경우 신중하게 선택하세요.";

export function AdminPublishCaseModal({
  caseId,
  onClose,
  onSaved,
}: {
  caseId: string | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
}) {
  const [draft, setDraft] = useState<PublicCaseDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [surveyTitle, setSurveyTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [problemSummary, setProblemSummary] = useState("");
  const [improvementSummary, setImprovementSummary] = useState("");
  const [urlVisibility, setUrlVisibility] = useState<"full" | "hidden" | "domain_only">(
    "domain_only",
  );
  const [surveyUrl, setSurveyUrl] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cNotViolation, setCNotViolation] = useState(false);
  const [cDisplayName, setCDisplayName] = useState(false);
  const [cEvidence, setCEvidence] = useState(false);
  const [cUrl, setCUrl] = useState(false);
  const [cPii, setCPii] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    fetch(`/api/report/admin/cases/${caseId}/public-case`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "초안을 불러오지 못했습니다.");
        return data.draft as PublicCaseDraft;
      })
      .then((next) => {
        if (cancelled) return;
        setError(null);
        setDraft(next);
        setDisplayName(next.displayName);
        setSurveyTitle(next.surveyTitle);
        setSummary(next.summary);
        setProblemSummary(next.problemSummary);
        setImprovementSummary(next.improvementSummary);
        setUrlVisibility(next.urlVisibility);
        setSurveyUrl(next.surveyUrl || "");
        setSelectedIds(next.selectedEvidenceFileIds);
        setCNotViolation(false);
        setCDisplayName(false);
        setCEvidence(false);
        setCUrl(false);
        setCPii(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "초안을 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const selectedKinds = useMemo(() => {
    if (!draft) return [];
    return draft.evidenceCandidates
      .filter((c) => selectedIds.includes(c.id))
      .map((c) => c.kind);
  }, [draft, selectedIds]);
  const needsPii = selectedKinds.some(
    (kind) =>
      kind === "pii_question" ||
      kind === "sensitive_question" ||
      kind === "high_risk_question",
  );
  const canSubmit =
    cNotViolation &&
    cDisplayName &&
    cEvidence &&
    cUrl &&
    (!needsPii || cPii) &&
    Boolean(displayName.trim()) &&
    Boolean(surveyTitle.trim()) &&
    !busy;

  if (!caseId) return null;

  function toggleEvidence(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit() {
    if (!caseId || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/admin/cases/${caseId}/public-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: draft?.status === "published" ? "update" : "publish",
          displayName,
          surveyTitle,
          summary,
          problemSummary,
          improvementSummary,
          urlVisibility,
          surveyUrl,
          selectedEvidenceFileIds: selectedIds,
          confirmations: {
            notViolationConfirmed: cNotViolation,
            displayNameConfirmed: cDisplayName,
            evidenceSafeConfirmed: cEvidence,
            urlVisibilityConfirmed: cUrl,
            piiEvidenceConfirmed: cPii,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        publicId?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || "공개 등록에 실패했습니다.");
      const editing =
        draft?.status === "published" ||
        draft?.status === "paused" ||
        draft?.status === "reviewing";
      onSaved?.(
        data?.publicId
          ? editing
            ? `공개 사례를 저장했습니다. /cases/${data.publicId}`
            : `공개 사례로 등록했습니다. /cases/${data.publicId}`
          : "공개 사례를 저장했습니다.",
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const isEdit =
    draft?.status === "published" ||
    draft?.status === "reviewing" ||
    draft?.status === "paused";
  const modalTitle =
    draft?.status === "paused"
      ? "공개 진단 사례 다시 공개"
      : isEdit
        ? "공개 진단 사례 수정"
        : "공개 진단 사례 등록";
  const submitLabel =
    draft?.status === "paused"
      ? "다시 공개"
      : draft?.status === "published" || draft?.status === "reviewing"
        ? "저장"
        : "공개 등록";
  const input =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-case-modal-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="public-case-modal-title" className="text-lg font-bold text-slate-900">
              {modalTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isEdit
                ? "공개 문구, URL 공개 범위, 캡처 선택을 수정하거나 공개 중지할 수 있습니다."
                : "이 사례는 외부에 공개됩니다. 기관명, 설문 제목, URL, 캡처 이미지에 민감한 정보가 포함되어 있지 않은지 확인한 뒤 공개하세요."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        {!draft && !error ? (
          <p className="mt-4 text-sm text-slate-500">공개용 초안을 불러오는 중…</p>
        ) : null}

        {draft ? (
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-slate-700">
              공개용 기관/기업명
              <input
                className={input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              공개용 설문 제목
              <input
                className={input}
                value={surveyTitle}
                onChange={(e) => setSurveyTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              공개용 요약
              <textarea
                className={`${input} min-h-24`}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              공개할 주요 문제
              <textarea
                className={`${input} min-h-24`}
                value={problemSummary}
                onChange={(e) => setProblemSummary(e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-700">
              공개할 개선 권고
              <textarea
                className={`${input} min-h-24`}
                value={improvementSummary}
                onChange={(e) => setImprovementSummary(e.target.value)}
              />
            </label>

            <fieldset>
              <legend className="text-sm text-slate-700">설문 URL 공개 여부</legend>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {(
                  [
                    ["domain_only", "도메인만 공개"],
                    ["hidden", "비공개"],
                    ["full", "공개"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="url-visibility"
                      checked={urlVisibility === value}
                      onChange={() => setUrlVisibility(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {urlVisibility === "full" ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                  {URL_WARNING}
                </p>
              ) : null}
            </fieldset>

            <label className="block text-sm text-slate-700">
              공개할 설문 URL
              <input
                className={input}
                value={surveyUrl}
                onChange={(e) => setSurveyUrl(e.target.value)}
                disabled={urlVisibility === "hidden"}
              />
              {draft.urlHost ? (
                <p className="mt-1 text-xs text-slate-500">도메인: {draft.urlHost}</p>
              ) : null}
            </label>

            <fieldset>
              <legend className="text-sm text-slate-700">공개할 캡처 이미지 선택</legend>
              <p className="mt-1 text-xs text-slate-500">
                캡처 이미지에 실제 입력값, 담당자 연락처, 민감한 정보가 보이면
                공개하지 마세요.
              </p>
              <div className="mt-2 space-y-2">
                {draft.evidenceCandidates.length === 0 ? (
                  <p className="text-sm text-slate-500">공개 가능한 캡처가 없습니다.</p>
                ) : (
                  draft.evidenceCandidates.map((file) => (
                    <label
                      key={file.id}
                      className="flex gap-3 rounded-lg border border-slate-200 p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIds.includes(file.id)}
                        onChange={() => toggleEvidence(file.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-900">
                          {file.kindLabel}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {file.label || file.kind}
                          {file.pageNumber != null ? ` · p.${file.pageNumber}` : ""}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={evidenceProxyDownloadUrl(file.id, caseId)}
                          alt=""
                          className="mt-2 max-h-24 rounded border border-slate-100 object-contain"
                        />
                      </span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <p className="text-sm text-slate-700">
              공개 사례 상태: {draft.statusLabel}
              {draft.publicId ? ` · ${draft.publicId}` : ""}
            </p>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={cNotViolation}
                  onChange={(e) => setCNotViolation(e.target.checked)}
                />
                자동진단 결과가 위반 확정이 아니라는 점을 확인했습니다.
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={cDisplayName}
                  onChange={(e) => setCDisplayName(e.target.checked)}
                />
                공개용 기관/기업명과 설문 제목을 확인했습니다.
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={cEvidence}
                  onChange={(e) => setCEvidence(e.target.checked)}
                />
                공개할 캡처 이미지에 불필요한 개인정보나 민감한 정보가 포함되어
                있지 않은지 확인했습니다.
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={cUrl}
                  onChange={(e) => setCUrl(e.target.checked)}
                />
                설문 URL 공개 범위를 확인했습니다.
              </label>
              {needsPii ? (
                <label className="flex gap-2 text-amber-900">
                  <input
                    type="checkbox"
                    checked={cPii}
                    onChange={(e) => setCPii(e.target.checked)}
                  />
                  개인정보 문항 캡처를 공개하는 점을 추가로 확인했습니다.
                </label>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              {draft.status === "published" || draft.status === "reviewing" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("이 공개 사례를 중지할까요? 공개 목록에서 내려갑니다.")) {
                      return;
                    }
                    setBusy(true);
                    setError(null);
                    void fetch(`/api/report/admin/cases/${caseId}/public-case`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "pause" }),
                    })
                      .then(async (res) => {
                        const data = (await res.json().catch(() => null)) as {
                          error?: string;
                        } | null;
                        if (!res.ok) throw new Error(data?.error || "중지 실패");
                        onSaved?.("공개 사례를 중지했습니다.");
                        onClose();
                      })
                      .catch((err: unknown) => {
                        setError(
                          err instanceof Error ? err.message : "공개 중지에 실패했습니다.",
                        );
                      })
                      .finally(() => setBusy(false));
                  }}
                  className="mr-auto rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-45"
                >
                  공개 중지
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submit()}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
