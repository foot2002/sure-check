"use client";

import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOutreachCopy,
  classifyOutreachPriority,
  improvementChecklist,
  isOutreachCandidate,
  pickIssueBadges,
  publicationStatusKo,
  recommendedAction,
  reviewStatusKo,
  assertNoConfirmedViolationWording,
} from "@/lib/report/adminOutreach";
import { AdminEvidenceDownloads } from "@/components/report/admin/AdminEvidenceDownloads";

export function AdminOutreachSections({
  detail,
  onMessage,
}: {
  detail: AdminCaseDetail;
  onMessage?: (text: string) => void;
}) {
  const s = detail.summary;
  const categoryLabels = [
    ...new Set(
      detail.questions.flatMap((q) => q.categories.map((c) => c.categoryLabel)),
    ),
  ].slice(0, 6);
  const issueBadges = pickIssueBadges({
    userDecisionLabel: s.userDecisionLabel,
    complianceLabels: detail.complianceChecks.map(
      (c) => `${c.checkItem} ${c.statusLabel}`,
    ),
    findingTitles: detail.findings.map((f) => f.title),
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    isPublic: s.publicPrivateType === "public",
  });
  const priority = classifyOutreachPriority({
    publicPrivateType: s.publicPrivateType,
    hasPersonalInfo: s.hasPersonalInfo,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    overallRiskLevel: s.overallRiskLevel,
    userDecisionLabel: s.userDecisionLabel,
    evidenceCount: s.evidenceCount,
    issueBadges,
  });
  const copy = buildOutreachCopy({ categoryLabels, issueBadges });
  const checks = improvementChecklist({
    issueBadges,
    isPublic: s.publicPrivateType === "public",
  });
  const keyQuestions = detail.questions.filter(
    (q) =>
      q.hasPersonalInfo ||
      q.hasSensitiveInfo ||
      q.hasHighRiskInfo ||
      /d3|d4|d5/i.test(q.dataRiskLevel || ""),
  );
  const weakNotices = detail.complianceChecks.filter((c) =>
    /missing|fail|미흡|없음|확인/.test(`${c.status} ${c.statusLabel}`),
  );

  async function copyText(text: string) {
    if (!assertNoConfirmedViolationWording(text)) return;
    try {
      await navigator.clipboard.writeText(text);
      onMessage?.("복사되었습니다.");
    } catch {
      onMessage?.("복사에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">개선안내 판단</h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">개선안내 후보</dt>
            <dd className="font-semibold text-slate-900">
              {isOutreachCandidate(priority) ? "예" : "아니오"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">우선순위</dt>
            <dd className="font-semibold text-slate-900">{priority}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">권장 조치</dt>
            <dd className="font-medium text-slate-800">
              {recommendedAction({
                issueBadges,
                hasPersonalInfo: s.hasPersonalInfo,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">증거 상태</dt>
            <dd>{s.evidenceCount > 0 ? "캡처 확보됨" : "증거 부족"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">검토 상태</dt>
            <dd>{reviewStatusKo(s.reviewStatus)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">공개 상태</dt>
            <dd>{publicationStatusKo(s.publicationStatus)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">왜 문제가 되는가</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {copy.problemReason}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">어떻게 개선해야 하는가</h3>
        <p className="mt-2 text-xs text-slate-500">보완 권고 항목</p>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
          {checks.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-0.5 text-teal-700">☐</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          공문용 개선 요청 문구
        </h3>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800">
          {copy.letterSummary}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
            onClick={() => void copyText(copy.problemReason)}
          >
            문제 사유 복사
          </button>
          <button
            type="button"
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
            onClick={() => void copyText(copy.improvementRequest)}
          >
            개선 요청 문구 복사
          </button>
          <button
            type="button"
            className="rounded-lg border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50"
            onClick={() => void copyText(copy.letterSummary)}
          >
            공문 요약 복사
          </button>
        </div>
      </section>

      <AdminEvidenceDownloads detail={detail} onMessage={onMessage} />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          핵심 문항·고지 미흡 항목
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          {keyQuestions.slice(0, 12).map((q) => (
            <li key={q.id} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-slate-900">{q.questionLabel}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {q.hasHighRiskInfo
                  ? "고위험정보"
                  : q.hasSensitiveInfo
                    ? "민감정보"
                    : q.hasPersonalInfo
                      ? "직접식별정보"
                      : q.dataRiskLevel || "확인 필요"}
                {q.categories[0]?.categoryLabel
                  ? ` · ${q.categories[0].categoryLabel}`
                  : ""}
              </p>
            </li>
          ))}
          {keyQuestions.length === 0 ? (
            <li className="text-xs text-slate-500">핵심 개인정보 문항이 없습니다.</li>
          ) : null}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {weakNotices.slice(0, 8).map((c) => (
            <li
              key={c.id}
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
            >
              {c.checkItem} {c.statusLabel}
            </li>
          ))}
          {issueBadges.map((b) => (
            <li
              key={b}
              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800"
            >
              {b}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
