"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminCaseListItem, AdminCaseListPayload } from "@/lib/report/adminCases";
import { appliedAdminRangeLabel } from "@/lib/report/adminCases";
import { AdminCaseDrawer } from "@/components/report/admin/AdminCaseDrawer";
import { AdminCaseRowActions } from "@/components/report/admin/AdminCaseRowActions";
import {
  outreachUiStatusKo,
  publicPrivateKo,
  reviewStatusKo,
  riskLabelKo,
} from "@/lib/report/adminOutreach";
import { publicCaseStatusKo } from "@/lib/report/publicCasePolicy";
import { AdminPublishCaseModal } from "@/components/report/admin/AdminPublishCaseModal";

type Filters = {
  range: string;
  risk: string;
  reviewStatus: string;
  publicationStatus: string;
  platform: string;
  publicPrivate: string;
  hasPersonalInfo: string;
  hasSensitiveInfo: string;
  hasHighRiskInfo: string;
  hasEvidence: string;
  limitedOnly: string;
  outreachOnly: string;
  priority: string;
  noticeGap: string;
  reportReview: string;
  outreachStatus: string;
  q: string;
  from: string;
  to: string;
};

function riskBadge(level: string) {
  const map: Record<string, string> = {
    critical: "bg-rose-100 text-rose-800 border-rose-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    limited: "bg-slate-100 text-slate-700 border-slate-200",
    medium: "bg-amber-100 text-amber-800 border-amber-200",
    low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    unknown: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return map[level] || map.unknown;
}

function priorityBadge(p: string) {
  if (p === "A") return "bg-rose-600 text-white";
  if (p === "B") return "bg-orange-500 text-white";
  return "bg-slate-200 text-slate-700";
}

function kstDateInputValue(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function AdminConsoleView({
  data,
  error,
  filters,
}: {
  data: AdminCaseListPayload | null;
  error: string | null;
  filters: Filters;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Filters>({
    ...filters,
    from: filters.from || "",
    to: filters.to || "",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [clientPayload, setClientPayload] = useState<AdminCaseListPayload | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const payload = clientPayload ?? data;
  const loadError = clientError ?? error;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function toParams(next: Filters): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (key === "from" || key === "to" || key === "range") continue;
      if (!value || value === "all") continue;
      params.set(key, value);
    }
    if (next.range === "custom") {
      params.set("from", next.from);
      params.set("to", next.to);
    } else {
      params.set("range", next.range || "7d");
    }
    return params;
  }

  async function apply(next: Filters) {
    if (next.range === "custom") {
      if (!next.from || !next.to) {
        setRangeError("시작일과 종료일을 선택하세요.");
        setForm(next);
        return;
      }
      if (next.from > next.to) {
        setRangeError("시작일이 종료일보다 늦습니다.");
        setForm(next);
        return;
      }
    }
    setRangeError(null);
    setForm(next);
    const params = toParams(next);
    const qs = params.toString();
    router.replace(`/report/admin?${qs}`, { scroll: false });
    setLoading(true);
    try {
      const res = await fetch(`/api/report/admin/cases?${qs}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      });
      const json = (await res.json().catch(() => null)) as
        | (AdminCaseListPayload & { error?: string })
        | null;
      if (!res.ok || !json?.cases) {
        setClientError(json?.error || "검토 목록을 불러오지 못했습니다.");
        return;
      }
      setClientPayload(json);
      setClientError(null);
      setOpenId((id) =>
        id && json.cases.some((row) => row.id === id) ? id : null,
      );
    } catch {
      setClientError("검토 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    void apply(form);
  }

  function setQuick(patch: Partial<Filters>) {
    void apply({ ...form, ...patch });
  }

  async function logout() {
    await fetch("/api/report/admin/logout", { method: "POST" });
    router.replace("/report/admin/login");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] px-3 py-6 md:px-4">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            개선안내 후보 검토
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
            SURE Check 관리자 리포트
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            기관·기업에 개선 공문을 보낼지 판단하는 화면입니다. 위법 여부를
            단정하지 않으며 ‘위반 소지 / 개선 필요 / 확인 필요 / 개선안내
            후보’로 해석합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/report/admin/collector"
            className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm text-teal-800 hover:bg-teal-50"
          >
            수집함
          </Link>
          <Link
            href="/report"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            집계 통계 /report
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      ) : null}
      {toast ? (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {toast}
        </div>
      ) : null}

      {payload ? (
        <>
        <p className="mb-2 text-xs text-slate-500">
          적용 기간: {appliedAdminRangeLabel(payload)}
          {" · "}목록 {payload.cases.length.toLocaleString("ko-KR")}건
          {loading ? " · 갱신 중…" : ""}
        </p>
        <section className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ["분석 가능 진단", payload.kpi.totalScans],
            ["미검토", payload.kpi.reviewPendingCount],
            ["고위험/신고 검토", payload.kpi.highOrReportReviewCount],
            ["공공부문 확인 필요", payload.kpi.publicSectorReviewCount],
            ["증빙 캡처 확보", payload.kpi.evidenceCaptureCount],
            ["개선안내 후보", payload.kpi.publicationCandidateCount],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {Number(value).toLocaleString("ko-KR")}
              </p>
            </div>
          ))}
        </section>
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["스캔 대기", payload.queue.scanPending],
            ["스캔 실행", payload.queue.scanRunning],
            ["스캔 실패", payload.queue.scanFailed],
            ["캡처 대기", payload.queue.capturePending],
            ["캡처 실행", payload.queue.captureRunning],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">
                {Number(value).toLocaleString("ko-KR")}
              </p>
            </div>
          ))}
        </section>
        </>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["개선안내 후보", form.outreachOnly === "true", { outreachOnly: form.outreachOnly === "true" ? "all" : "true" }],
            ["우선순위 A", form.priority === "A", { priority: form.priority === "A" ? "all" : "A" }],
            ["증거 확보", form.hasEvidence === "true", { hasEvidence: form.hasEvidence === "true" ? "all" : "true" }],
            ["증거 부족", form.hasEvidence === "false", { hasEvidence: form.hasEvidence === "false" ? "all" : "false" }],
            ["미검토", form.outreachStatus === "unreviewed", { outreachStatus: form.outreachStatus === "unreviewed" ? "all" : "unreviewed" }],
            ["발송대상", form.outreachStatus === "send", { outreachStatus: form.outreachStatus === "send" ? "all" : "send" }],
            ["공문발송 검토", form.outreachStatus === "send", { outreachStatus: form.outreachStatus === "send" ? "all" : "send" }],
            ["공공기관", form.publicPrivate === "public", { publicPrivate: form.publicPrivate === "public" ? "all" : "public" }],
            ["민간기업", form.publicPrivate === "private", { publicPrivate: form.publicPrivate === "private" ? "all" : "private" }],
            ["개인정보 포함", form.hasPersonalInfo === "true", { hasPersonalInfo: form.hasPersonalInfo === "true" ? "all" : "true" }],
            ["민감정보 포함", form.hasSensitiveInfo === "true", { hasSensitiveInfo: form.hasSensitiveInfo === "true" ? "all" : "true" }],
            ["고지 미흡", form.noticeGap === "true", { noticeGap: form.noticeGap === "true" ? "all" : "true" }],
            ["신고검토", form.reportReview === "true", { reportReview: form.reportReview === "true" ? "all" : "true" }],
          ] as Array<[string, boolean, Partial<Filters>]>
        ).map(([label, active, patch]) => (
          <button
            key={label}
            type="button"
            onClick={() => setQuick(patch)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              active
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={applyFilters}
        className="sticky top-0 z-10 mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur md:grid-cols-3 lg:grid-cols-4"
      >
        {[
          {
            key: "range",
            label: "기간",
            options: [
              ["today", "오늘"],
              ["7d", "최근 7일"],
              ["30d", "최근 30일"],
              ["all", "전체"],
              ["custom", "기간 설정"],
            ],
          },
          {
            key: "priority",
            label: "우선순위",
            options: [
              ["all", "전체"],
              ["A", "A 우선 후보"],
              ["B", "B 추가 검토"],
              ["C", "C 참고/보류"],
            ],
          },
          {
            key: "risk",
            label: "위험도",
            options: [
              ["all", "전체"],
              ["high", "고위험(high+)"],
              ["critical", "critical"],
              ["limited", "limited"],
            ],
          },
          {
            key: "outreachStatus",
            label: "개선안내 상태",
            options: [
              ["all", "전체"],
              ["unreviewed", "미검토"],
              ["in_review", "검토중"],
              ["candidate", "개선안내 후보"],
              ["send", "발송대상"],
              ["hold", "보류"],
              ["exclude", "제외"],
              ["done", "완료"],
            ],
          },
          {
            key: "hasEvidence",
            label: "증거",
            options: [
              ["all", "전체"],
              ["true", "확보"],
              ["false", "부족"],
            ],
          },
          {
            key: "publicPrivate",
            label: "공공/민간",
            options: [
              ["all", "전체"],
              ["public", "공공"],
              ["private", "민간"],
            ],
          },
        ].map((field) => (
          <label key={field.key} className="text-xs text-slate-500">
            {field.label}
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
              value={form[field.key as keyof Filters]}
              onChange={(e) => {
                const value = e.target.value;
                if (field.key === "range") {
                  if (value === "custom") {
                    const today = kstDateInputValue();
                    setForm((prev) => ({
                      ...prev,
                      range: "custom",
                      from: prev.from || today,
                      to: prev.to || today,
                    }));
                    return;
                  }
                  void apply({ ...form, range: value, from: "", to: "" });
                  return;
                }
                const next = { ...form, [field.key]: e.target.value };
                if (field.key === "outreachStatus" || field.key === "priority" || field.key === "risk" || field.key === "hasEvidence" || field.key === "publicPrivate") {
                  void apply(next);
                } else {
                  setForm(next);
                }
              }}
            >
              {field.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-xs text-slate-500 md:col-span-2">
          검색어
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={form.q}
            onChange={(e) => setForm((prev) => ({ ...prev, q: e.target.value }))}
            placeholder="기관명 / 제목 / URL / 판단"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            필터 적용
          </button>
        </div>
        {form.range === "custom" ? (
          <div className="md:col-span-3 lg:col-span-4 rounded-lg border border-teal-100 bg-teal-50/60 p-3">
            <p className="text-xs font-semibold text-teal-900">기간 설정</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-600">
                시작일
                <input
                  type="date"
                  className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={form.from}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, from: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs text-slate-600">
                종료일
                <input
                  type="date"
                  className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={form.to}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, to: e.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                onClick={() => void apply({ ...form, range: "custom" })}
              >
                적용
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void apply({ ...form, range: "7d", from: "", to: "" })}
              >
                초기화
              </button>
            </div>
            {rangeError ? (
              <p className="mt-2 text-xs text-rose-700">{rangeError}</p>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[6.5rem]" />
            <col className="w-[2.4rem]" />
            <col className="w-[3.4rem]" />
            <col className="w-[11%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[8.5rem]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="px-2 py-2">진단일</th>
              <th className="px-1 py-2 text-center">우선</th>
              <th className="px-1 py-2">위험도</th>
              <th className="px-2 py-2">기관/기업명</th>
              <th className="px-2 py-2">설문 제목</th>
              <th className="px-2 py-2">주요 문제</th>
              <th className="px-2 py-2">수집 정보</th>
              <th
                className="px-2 py-2"
                title="증거 / 검토 / 개선안내 상태 / 공개 사례 상태"
              >
                상태
              </th>
              <th className="px-2 py-2 text-right">조치</th>
            </tr>
          </thead>
          <tbody>
            {(payload?.cases || []).map((row: AdminCaseListItem) => (
              <tr
                key={row.id}
                className={`cursor-pointer border-b border-slate-100 hover:bg-teal-50/60 ${
                  openId === row.id ? "bg-teal-50" : ""
                }`}
                onClick={() => setOpenId(row.id)}
              >
                <td className="overflow-hidden truncate px-2 py-2 text-slate-600">
                  {row.observedDateKst}
                </td>
                <td className="px-1 py-2 text-center">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${priorityBadge(row.outreachPriority)}`}
                  >
                    {row.outreachPriority}
                  </span>
                </td>
                <td className="px-1 py-2">
                  <span
                    className={`inline-block max-w-full truncate rounded border px-1 py-0.5 text-[10px] font-semibold ${riskBadge(row.overallRiskLevel)}`}
                  >
                    {riskLabelKo(row.overallRiskLevel)}
                  </span>
                </td>
                <td
                  className="overflow-hidden px-2 py-2 font-medium text-slate-900"
                  title={row.operatorName || undefined}
                >
                  <span className="block truncate">{row.operatorName || "—"}</span>
                  <span className="block truncate text-[10px] font-normal text-slate-500">
                    {publicPrivateKo(row.publicPrivateType)}
                  </span>
                </td>
                <td
                  className="overflow-hidden truncate px-2 py-2 text-slate-800"
                  title={row.surveyTitle || undefined}
                >
                  {row.surveyTitle || "—"}
                </td>
                <td className="overflow-hidden px-2 py-2">
                  {row.issueBadges.length > 0 ? (
                    <span
                      className="block truncate rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900"
                      title={row.issueBadges.join(" · ")}
                    >
                      {row.issueBadges[0]}
                      {row.issueBadges.length > 1
                        ? ` 외 ${row.issueBadges.length - 1}`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td
                  className="overflow-hidden truncate px-2 py-2 text-[11px] text-slate-700"
                  title={row.dataSummary}
                >
                  {row.dataSummary.replace(/\n/g, " · ")}
                </td>
                <td className="overflow-hidden px-2 py-2 text-[10px] leading-4 text-slate-600">
                  <div className="truncate" title={`증거 ${row.evidenceStatus}`}>
                    {row.evidenceStatus}
                  </div>
                  <div
                    className="truncate"
                    title={`검토 ${reviewStatusKo(row.reviewStatus)}`}
                  >
                    {reviewStatusKo(row.reviewStatus)}
                  </div>
                  <div
                    className="truncate"
                    title={`개선안내 상태 ${outreachUiStatusKo(row.outreachUiStatus)}`}
                  >
                    {outreachUiStatusKo(row.outreachUiStatus)}
                  </div>
                  <div
                    className="truncate"
                    title={`공개 사례 상태 ${publicCaseStatusKo(row.publicCaseStatus)}`}
                  >
                    {publicCaseStatusKo(row.publicCaseStatus)}
                  </div>
                </td>
                <td className="overflow-hidden px-1 py-2">
                  <AdminCaseRowActions
                    row={row}
                    onReview={() => setOpenId(row.id)}
                    onPublish={() => setPublishId(row.id)}
                    onMessage={setToast}
                  />
                </td>
              </tr>
            ))}
            {payload && payload.cases.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  조건에 맞는 케이스가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <AdminCaseDrawer caseId={openId} onClose={() => setOpenId(null)} />
      <AdminPublishCaseModal
        caseId={publishId}
        onClose={() => setPublishId(null)}
        onSaved={(text) => {
          setToast(text);
          void apply(form);
        }}
      />
    </div>
  );
}
