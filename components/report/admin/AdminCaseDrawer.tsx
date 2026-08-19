"use client";

import { useEffect, useState } from "react";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import { AdminOutreachSections } from "@/components/report/admin/AdminOutreachSections";
import { AdminCaseActionBar } from "@/components/report/admin/AdminCaseActionBar";
import {
  classifyOutreachPriority,
  pickIssueBadges,
  publicPrivateKo,
  reviewStatusKo,
  riskLabelKo,
} from "@/lib/report/adminOutreach";

export function AdminCaseDrawer({
  caseId,
  onClose,
}: {
  caseId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AdminCaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [caseId, onClose]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    fetch(`/api/report/admin/cases/${caseId}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "상세를 불러오지 못했습니다.");
        return data as AdminCaseDetail;
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "상세를 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (!caseId) return null;
  const current = detail?.id === caseId ? detail : null;
  const s = current?.summary;
  const loading = !error && !current;
  const issueBadges = current
    ? pickIssueBadges({
        userDecisionLabel: current.summary.userDecisionLabel,
        complianceLabels: current.complianceChecks.map(
          (c) => `${c.checkItem} ${c.statusLabel}`,
        ),
        findingTitles: current.findings.map((f) => f.title),
        hasSensitiveInfo: current.summary.hasSensitiveInfo,
        hasHighRiskInfo: current.summary.hasHighRiskInfo,
        isPublic: current.summary.publicPrivateType === "public",
      })
    : [];
  const priority = s
    ? classifyOutreachPriority({
        publicPrivateType: s.publicPrivateType,
        hasPersonalInfo: s.hasPersonalInfo,
        hasSensitiveInfo: s.hasSensitiveInfo,
        hasHighRiskInfo: s.hasHighRiskInfo,
        overallRiskLevel: s.overallRiskLevel,
        userDecisionLabel: s.userDecisionLabel,
        evidenceCount: s.evidenceCount,
        issueBadges,
      })
    : "C";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30"
        aria-label="패널 닫기"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full flex-col overflow-y-auto bg-[#F7FAFB] shadow-2xl md:w-[720px] md:max-w-[760px]">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-teal-800">
                {s ? `${s.operatorName || "기관 미확인"} · ${publicPrivateKo(s.publicPrivateType)}` : "불러오는 중"}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {s?.surveyTitle || "설문 상세"}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                  {s ? riskLabelKo(s.overallRiskLevel) : "—"}
                </span>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-800">
                  우선순위 {priority}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                  {s ? reviewStatusKo(s.reviewStatus) : "—"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                  증거 {s?.evidenceCount ?? 0}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="mt-3">
            <AdminCaseActionBar
              caseId={caseId}
              surveyUrl={s?.surveyUrl}
              zipFileId={s?.temporaryZipId}
              screenshotIds={s?.screenshotFileIds}
              screenshotMeta={current?.evidenceFiles}
              showFullDetailLink
              onMessage={setMessage}
            />
          </div>
        </div>
        <div className="space-y-4 px-5 py-4">
          {message ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
              {message}
            </div>
          ) : null}
          {loading ? (
            <p className="text-sm text-slate-500">상세를 불러오는 중…</p>
          ) : null}
          {error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : null}
          {current ? (
            <AdminOutreachSections detail={current} onMessage={setMessage} />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
