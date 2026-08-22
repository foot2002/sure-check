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
import {
  publicCaseStatusBadgeClass,
  publicCaseStatusKo,
} from "@/lib/report/publicCasePolicy";
import { AdminPublishCaseModal } from "@/components/report/admin/AdminPublishCaseModal";
import {
  formatDataCollectionBrief,
  subjectTypeKo,
  type AdminDashboardView,
} from "@/lib/report/adminDashboardViews";

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
  publicCaseStatus: string;
  view: string;
  subjectType: string;
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

function workFilters(): Pick<
  Filters,
  | "risk"
  | "reviewStatus"
  | "publicationStatus"
  | "platform"
  | "publicPrivate"
  | "hasPersonalInfo"
  | "hasSensitiveInfo"
  | "hasHighRiskInfo"
  | "hasEvidence"
  | "limitedOnly"
  | "outreachOnly"
  | "priority"
  | "noticeGap"
  | "reportReview"
  | "outreachStatus"
  | "publicCaseStatus"
  | "view"
  | "subjectType"
  | "q"
> {
  return {
    risk: "all",
    reviewStatus: "all",
    publicationStatus: "all",
    platform: "all",
    publicPrivate: "all",
    hasPersonalInfo: "all",
    hasSensitiveInfo: "all",
    hasHighRiskInfo: "all",
    hasEvidence: "all",
    limitedOnly: "all",
    outreachOnly: "all",
    priority: "all",
    noticeGap: "all",
    reportReview: "all",
    outreachStatus: "all",
    publicCaseStatus: "all",
    view: "all",
    subjectType: "all",
    q: "",
  };
}

function KpiCard({
  label,
  value,
  hint,
  help,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  help: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={help}
      className={`rounded-xl border p-3 text-left shadow-sm transition ${
        active
          ? "border-teal-700 bg-teal-50"
          : "border-slate-200 bg-white hover:border-teal-300"
      }`}
    >
      <p className="flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-800">
        <span>{label}</span>
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500"
          title={help}
        >
          ?
        </span>
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value.toLocaleString("ko-KR")}건
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>
    </button>
  );
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
    view: filters.view || "all",
    subjectType: filters.subjectType || "all",
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmEvidence, setConfirmEvidence] = useState(false);
  const [enqueueingEvidence, setEnqueueingEvidence] = useState(false);
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
    void apply({ ...form, view: "all", ...patch });
  }

  function applyView(view: AdminDashboardView) {
    const nextView = form.view === view ? "all" : view;
    void apply({
      ...form,
      ...workFilters(),
      range: form.range,
      from: form.from,
      to: form.to,
      view: nextView,
    });
  }

  async function enqueuePriorityEvidence() {
    setEnqueueingEvidence(true);
    try {
      const res = await fetch("/api/report/admin/evidence/priority-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        queued?: number;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setToast(json?.error || "증빙 생성 큐 등록에 실패했습니다.");
        return;
      }
      setToast(`상위 ${json.queued || 0}건의 증빙 캡처를 비동기 큐에 등록했습니다.`);
      void apply(form);
    } catch {
      setToast("증빙 생성 큐 등록에 실패했습니다.");
    } finally {
      setEnqueueingEvidence(false);
      setConfirmEvidence(false);
    }
  }

  function resetFilters() {
    void apply({
      ...form,
      ...workFilters(),
      range: form.range,
      from: form.from,
      to: form.to,
    });
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
            href="/cases"
            target="_blank"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            공개 사례 /cases
          </Link>
          <Link
            href="/report"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            집계 통계 /report
          </Link>
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            사용 안내
          </button>
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

      {helpOpen ? (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          <p className="font-semibold">사용 안내</p>
          <p className="mt-1">
            이 화면은 기관·기업에 개인정보 수집 고지 개선을 요청할 후보를 검토하는
            관리자 화면입니다.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>우선순위 A와 치명적 설문부터 확인하세요.</li>
            <li>증거 확보 상태를 확인하세요.</li>
            <li>원본 설문을 열어 실제 화면을 확인하세요.</li>
            <li>요약리포트 또는 상세리포트를 다운로드하세요.</li>
            <li>공문용 문구를 복사해 개선 요청 공문에 활용하세요.</li>
          </ol>
          <p className="mt-2">
            표시된 결과는 자동진단 기반이며 위법 여부를 확정하지 않습니다.
          </p>
        </div>
      ) : null}

      {payload ? (
        <>
        <p className="mb-3 text-xs text-slate-500">
          적용 기간: {appliedAdminRangeLabel(payload)}
          {" · "}검토 대상 전체 {payload.kpi.totalScans.toLocaleString("ko-KR")}건
          {form.q
            ? ` · 전체 조건 ${payload.kpi.totalScans.toLocaleString("ko-KR")}건 중 검색 결과 ${payload.cases.length.toLocaleString("ko-KR")}건`
            : ` · 목록 ${payload.cases.length.toLocaleString("ko-KR")}건`}
          {loading ? " · 갱신 중…" : ""}
        </p>

        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-slate-900">오늘 검토해야 할 설문</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="검토 대상 전체"
              value={payload.kpi.totalScans}
              hint="현재 기간에서 관리자가 검토할 수 있는 진단 결과입니다."
              help="자동진단이 문항을 읽어 결과를 낸 설문입니다. 종료·접근제한 건은 포함하지 않습니다."
              active={form.view === "all" && !form.q}
              onClick={() => applyView("all")}
            />
            <KpiCard
              label="미검토"
              value={payload.kpi.reviewPendingCount}
              hint="아직 관리자가 확인하지 않은 설문입니다."
              help="검토 상태가 미검토인 설문입니다. 카드를 누르면 해당 목록만 봅니다."
              active={form.view === "unreviewed"}
              onClick={() => applyView("unreviewed")}
            />
            <KpiCard
              label="고위험·신고검토"
              value={payload.kpi.highOrReportReviewCount}
              hint="응답자에게 주의가 필요하거나 신고 검토 수준으로 분류된 설문입니다."
              help="자동진단 결과 응답 거부·신고 검토 또는 이에 준하는 위험 판단이 나온 설문입니다. 위반 확정은 아닙니다."
              active={form.view === "highOrReport"}
              onClick={() => applyView("highOrReport")}
            />
            <KpiCard
              label="개선안내 후보"
              value={payload.kpi.publicationCandidateCount}
              hint="기관·기업에 개인정보 수집 고지 보완을 요청할 수 있는 후보입니다."
              help="개인정보 수집·이용 고지, 보유기간, 파기 기준, 담당자 연락처, 외부도구 안내 등이 미흡해 개선 요청 공문 검토 대상이 될 수 있는 설문입니다."
              active={form.view === "outreach"}
              onClick={() => applyView("outreach")}
            />
            <KpiCard
              label="공공부문 확인 필요"
              value={payload.kpi.publicSectorReviewCount}
              hint="공공기관이 외부 설문도구로 개인정보를 수집하는 것으로 보여 확인이 필요합니다."
              help="공공기관 또는 공공기관 가능성이 있는 주체가 외부 설문도구를 사용해 개인정보를 수집하는 것으로 판단되어 보안 기준 확인이 필요한 설문입니다."
              active={form.view === "publicSector"}
              onClick={() => applyView("publicSector")}
            />
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-slate-900">증빙·리포트 준비 상태</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="증빙 확보"
              value={payload.kpi.evidenceCaptureCount}
              hint="캡처 또는 ZIP 증빙자료가 확보된 설문입니다."
              help="신고용 ZIP 또는 핵심 캡처 이미지가 저장되어 공문 첨부자료로 사용할 수 있는 설문입니다."
              active={form.view === "evidenceReady"}
              onClick={() => applyView("evidenceReady")}
            />
            <KpiCard
              label="증빙 부족"
              value={payload.kpi.evidenceMissingCount}
              hint="공문에 첨부할 캡처·ZIP이 아직 없는 설문입니다."
              help="증거 부족 또는 캡처가 필요한 설문입니다."
              active={form.view === "evidenceMissing"}
              onClick={() => applyView("evidenceMissing")}
            />
            <KpiCard
              label="캡처 대기"
              value={payload.kpi.captureNeededCount}
              hint="증빙자료 생성이 필요한 설문입니다."
              help="캡처 작업이 대기 중이거나 아직 끝나지 않아 화면 증거가 없는 설문입니다."
              active={form.view === "captureNeeded"}
              onClick={() => applyView("captureNeeded")}
            />
            <KpiCard
              label="요약리포트 가능"
              value={payload.kpi.summaryReportCount}
              hint="요약리포트를 내려받을 수 있는 설문입니다."
              help="검토용 요약 리포트 다운로드가 가능한 진단 결과입니다."
              active={form.view === "reportReady"}
              onClick={() => applyView("reportReady")}
            />
            <KpiCard
              label="상세리포트 가능"
              value={payload.kpi.detailReportCount}
              hint="상세리포트를 내려받을 수 있는 설문입니다."
              help="문항·고지 항목이 포함된 상세 리포트 다운로드가 가능한 진단 결과입니다."
              active={form.view === "reportReady"}
              onClick={() => applyView("reportReady")}
            />
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-xl border border-teal-200 bg-teal-50/40">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                우선 증빙 생성 대상{" "}
                {(payload.kpi.priorityEvidenceCount || payload.priorityEvidence?.length || 0).toLocaleString("ko-KR")}건
              </h2>
              <p className="mt-1 text-[11px] text-slate-600">
                우선순위 A · 치명적/높음 · 공공부문 확인 필요 · 개선안내 후보 ·
                증빙 부족 · 미검토 또는 공문발송 검토. 한 번에 5건 이하만
                비동기 캡처 큐에 등록합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={
                  enqueueingEvidence ||
                  (payload.priorityEvidence || []).length === 0
                }
                onClick={() => setConfirmEvidence(true)}
              >
                상위 5건 증빙 생성
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => applyView("priorityEvidence")}
              >
                목록 보기
              </button>
            </div>
          </div>
          {confirmEvidence ? (
            <div className="border-t border-teal-200 bg-white px-4 py-3 text-sm text-slate-800">
              <p>
                상위 5건의 증빙 캡처를 비동기 큐에 등록합니다. 캡처 작업은 시간이
                걸릴 수 있으며, 수동 진단과 분리되어 처리됩니다. 계속하시겠습니까?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={enqueueingEvidence}
                  onClick={() => void enqueuePriorityEvidence()}
                >
                  {enqueueingEvidence ? "등록 중…" : "계속"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  onClick={() => setConfirmEvidence(false)}
                >
                  취소
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <details className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-900">
            자동진단 처리 상태 (접기/펼치기)
          </summary>
          <p className="mt-1 text-xs text-slate-500">
            대기 {payload.queue.scanPending.toLocaleString("ko-KR")} · 진행{" "}
            {payload.queue.scanRunning.toLocaleString("ko-KR")} · 완료{" "}
            {payload.kpi.totalScans.toLocaleString("ko-KR")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["자동진단 대기", payload.queue.scanPending, "아직 자동진단 차례를 기다리는 작업입니다."],
              ["자동진단 진행 중", payload.queue.scanRunning, "지금 설문을 읽고 있는 작업입니다."],
              ["자동진단 완료", payload.kpi.outcomeBuckets.normalDiagnosis, "문항을 읽어 결과를 낸 건수입니다."],
              ["종료로 제외", payload.kpi.excludedFromReporting.surveyClosed, "응답 기간이 끝나 검토 목록에서 뺀 건수입니다."],
              ["접근제한 제외", payload.kpi.excludedFromReporting.accessRestricted, "로그인이 필요해 열지 못한 건수입니다."],
              ["실패", payload.queue.scanFailed, "자동진단이 오류로 끝나 다시 확인이 필요합니다."],
              ["타임아웃", payload.kpi.excludedFromReporting.systemFailure, "시간이 초과되어 결과를 내지 못한 작업입니다."],
              ["제한 진단", payload.queue.scanLimited, "화면은 열렸지만 문항을 충분히 읽지 못한 건수입니다."],
            ].map(([label, value, hint]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[12px] font-semibold text-slate-800">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{Number(value).toLocaleString("ko-KR")}건</p>
                <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
        </details>

        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-slate-900">공개 사례 상태</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="공개 사례 등록"
              value={payload.kpi.unpublishedCaseCount}
              hint="아직 공개 사례로 올리지 않은 설문입니다."
              help="공개 진단 사례로 등록하기 전 상태입니다. 개선안내 상태와는 다릅니다."
              active={form.view === "unpublished"}
              onClick={() => applyView("unpublished")}
            />
            <KpiCard
              label="공개 검토 중"
              value={payload.kpi.reviewingCaseCount}
              hint="공개 사례로 올리기 전 내용을 확인하고 있는 설문입니다."
              help="공개 사례 상태가 공개검토입니다."
              active={form.view === "reviewing"}
              onClick={() => applyView("reviewing")}
            />
            <KpiCard
              label="공개중"
              value={payload.kpi.publishedCaseCount}
              hint="지금 /cases에 올라 있는 공개 사례입니다."
              help="관리자가 승인한 개별 공개 사례입니다. 위반 확정은 아닙니다."
              active={form.view === "published"}
              onClick={() => applyView("published")}
            />
            <KpiCard
              label="공개중지"
              value={payload.kpi.pausedCaseCount}
              hint="올렸다가 공개 목록에서 내린 사례입니다."
              help="공개 사례 상태가 공개중지입니다. 다시 공개할 수 있습니다."
              active={form.view === "paused"}
              onClick={() => applyView("paused")}
            />
          </div>
        </section>

        {(payload.todayTasks || []).length > 0 ? (
          <section className="mb-5 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
            <div className="border-b border-amber-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">
                오늘 해야 할 일 · 오늘 우선 확인할 설문 {(payload.todayTasks || []).length.toLocaleString("ko-KR")}건
              </h2>
              <p className="mt-1 text-[11px] text-slate-600">
                미검토 A등급, 증빙 확보된 치명적, 공공부문 확인 필요, 공문발송 검토 대상을 먼저 보여줍니다.
              </p>
            </div>
            <div className="divide-y divide-amber-100 bg-white">
              {(payload.todayTasks || []).map((row, index) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <p className="min-w-0 flex-1 text-sm text-slate-800">
                    <span className="mr-2 font-semibold text-slate-500">{index + 1}.</span>
                    <span className="font-semibold">{row.outreachPriority}등급</span>
                    {" · "}
                    {publicPrivateKo(row.publicPrivateType) === "공공"
                      ? "공공기관"
                      : publicPrivateKo(row.publicPrivateType) === "민간"
                        ? "민간기업"
                        : publicPrivateKo(row.publicPrivateType)}
                    {row.issueBadges[0] ? ` · ${row.issueBadges[0]}` : ""}
                    {" · "}
                    {row.evidenceStatus}
                  </p>
                  <AdminCaseRowActions
                    row={row}
                    onReview={() => setOpenId(row.id)}
                    onPublish={() => setPublishId(row.id)}
                    onChanged={() => void apply(form)}
                    onMessage={setToast}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}
        </>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">적용 필터:</span>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
          {appliedAdminRangeLabel({
            range: (form.range as "today" | "7d" | "30d" | "all" | "custom") || "7d",
            from: form.from || null,
            to: form.to || null,
          })}
        </span>
        {form.view !== "all" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
            빠른 보기 {form.view}
          </span>
        ) : null}
        {form.priority !== "all" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
            우선순위 {form.priority}
          </span>
        ) : null}
        {form.outreachStatus !== "all" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
            {outreachUiStatusKo(form.outreachStatus)}
          </span>
        ) : null}
        {form.hasEvidence === "true" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
            증거 확보
          </span>
        ) : null}
        {form.hasEvidence === "false" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
            증거 부족
          </span>
        ) : null}
        {form.q ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
            검색: {form.q}
          </span>
        ) : null}
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          필터 초기화
        </button>
      </div>

      <p className="mb-2 text-[11px] font-semibold text-slate-500">
        필터 그룹: 업무 상태 · 위험도 · 증빙 · 주체 · 문제 유형
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["미검토", form.outreachStatus === "unreviewed", { outreachStatus: form.outreachStatus === "unreviewed" ? "all" : "unreviewed" }],
            ["검토중", form.outreachStatus === "in_review", { outreachStatus: form.outreachStatus === "in_review" ? "all" : "in_review" }],
            ["개선안내 후보", form.outreachOnly === "true" || form.view === "outreach", { outreachOnly: form.outreachOnly === "true" ? "all" : "true" }],
            ["발송대상", form.outreachStatus === "send", { outreachStatus: form.outreachStatus === "send" ? "all" : "send" }],
            ["완료", form.outreachStatus === "done", { outreachStatus: form.outreachStatus === "done" ? "all" : "done" }],
            ["치명적", form.risk === "critical", { risk: form.risk === "critical" ? "all" : "critical" }],
            ["높음", form.risk === "high", { risk: form.risk === "high" ? "all" : "high" }],
            ["중간", form.risk === "medium", { risk: form.risk === "medium" ? "all" : "medium" }],
            ["낮음", form.risk === "low", { risk: form.risk === "low" ? "all" : "low" }],
            ["증거 확보", form.hasEvidence === "true", { hasEvidence: form.hasEvidence === "true" ? "all" : "true" }],
            ["증거 부족", form.hasEvidence === "false", { hasEvidence: form.hasEvidence === "false" ? "all" : "false" }],
            ["공공기관", form.publicPrivate === "public", { publicPrivate: form.publicPrivate === "public" ? "all" : "public" }],
            ["민간기업", form.publicPrivate === "private", { publicPrivate: form.publicPrivate === "private" ? "all" : "private" }],
            ["학교/교육기관", form.subjectType === "school_local", { subjectType: form.subjectType === "school_local" ? "all" : "school_local" }],
            ["의료기관", form.subjectType === "medical", { subjectType: form.subjectType === "medical" ? "all" : "medical" }],
            ["개인정보 포함", form.hasPersonalInfo === "true", { hasPersonalInfo: form.hasPersonalInfo === "true" ? "all" : "true" }],
            ["민감정보 포함", form.hasSensitiveInfo === "true", { hasSensitiveInfo: form.hasSensitiveInfo === "true" ? "all" : "true" }],
            ["고지 미흡", form.noticeGap === "true", { noticeGap: form.noticeGap === "true" ? "all" : "true" }],
            ["신고검토", form.reportReview === "true", { reportReview: form.reportReview === "true" ? "all" : "true" }],
            ["공문발송 검토", form.outreachStatus === "send", { outreachStatus: form.outreachStatus === "send" ? "all" : "send" }],
            ["공개중", form.view === "published" || form.publicCaseStatus === "published", { view: form.view === "published" ? "all" : "published" }],
            ["공개중지", form.view === "paused" || form.publicCaseStatus === "paused", { view: form.view === "paused" ? "all" : "paused" }],
            ["공개검토", form.view === "reviewing" || form.publicCaseStatus === "reviewing", { view: form.view === "reviewing" ? "all" : "reviewing" }],
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
              ["critical", "치명적"],
              ["high", "높음 이상"],
              ["medium", "중간"],
              ["low", "낮음"],
              ["limited", "제한 진단"],
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
          {
            key: "publicCaseStatus",
            label: "공개 사례 상태",
            options: [
              ["all", "전체"],
              ["published", "공개중"],
              ["paused", "공개중지"],
              ["reviewing", "공개검토"],
              ["private", "미등록"],
              ["archived", "보관"],
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
                if (field.key === "outreachStatus" || field.key === "priority" || field.key === "risk" || field.key === "hasEvidence" || field.key === "publicPrivate" || field.key === "publicCaseStatus") {
                  if (
                    field.key === "publicCaseStatus" &&
                    (value === "published" || value === "paused" || value === "reviewing") &&
                    next.range !== "all" &&
                    next.range !== "custom"
                  ) {
                    next.range = "all";
                    next.from = "";
                    next.to = "";
                  }
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

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[68rem] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[6.2rem]" />
            <col className="w-[2.6rem]" />
            <col className="w-[3.6rem]" />
            <col className="w-[11%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[11%]" />
            <col className="w-[5.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[12.5rem]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="px-2 py-2">진단일</th>
              <th className="px-1 py-2 text-center">우선순위</th>
              <th className="px-1 py-2">위험도</th>
              <th className="px-2 py-2">기관/기업</th>
              <th className="px-2 py-2">설문 제목</th>
              <th className="px-2 py-2">문제 요약</th>
              <th className="px-2 py-2">수집 정보</th>
              <th className="px-2 py-2">증빙</th>
              <th className="px-2 py-2">상태</th>
              <th className="px-2 py-2 text-right">조치</th>
            </tr>
          </thead>
          <tbody>
            {(payload?.cases || []).map((row: AdminCaseListItem) => {
              const dataBrief = formatDataCollectionBrief({
                personalCount: row.personalInfoQuestionCount,
                sensitiveCount: row.sensitiveQuestionCount,
                categoryLabels: row.categoryLabels,
                hasPersonalInfo: row.hasPersonalInfo,
                hasSensitiveInfo: row.hasSensitiveInfo,
              });
              const orgKind =
                subjectTypeKo(row.subjectType) ||
                (publicPrivateKo(row.publicPrivateType) === "공공"
                  ? "공공기관"
                  : publicPrivateKo(row.publicPrivateType) === "민간"
                    ? "민간기업"
                    : publicPrivateKo(row.publicPrivateType));
              return (
              <tr
                key={row.id}
                className={`cursor-pointer border-b border-slate-100 hover:bg-teal-50/60 ${
                  openId === row.id
                    ? "bg-teal-50"
                    : row.publicCaseStatus === "published"
                      ? "bg-teal-50/40"
                      : row.publicCaseStatus === "paused"
                        ? "bg-amber-50/50"
                        : ""
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
                    title={row.overallRiskLevel}
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
                    {orgKind}
                  </span>
                </td>
                <td
                  className="overflow-hidden px-2 py-2 text-slate-800"
                  title={row.surveyTitle || undefined}
                >
                  <span className="block truncate">{row.surveyTitle || "—"}</span>
                </td>
                <td className="overflow-hidden px-2 py-2">
                  {row.issueBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.issueBadges.slice(0, 3).map((badge) => (
                        <span
                          key={badge}
                          className="inline-block max-w-full truncate rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="overflow-hidden px-2 py-2 text-[11px] text-slate-700">
                  <div className="truncate font-medium">{dataBrief.headline}</div>
                  {dataBrief.items ? (
                    <div className="truncate text-[10px] text-slate-500">{dataBrief.items}</div>
                  ) : null}
                  {dataBrief.hasSensitive ? (
                    <div className="mt-0.5 text-[10px] font-semibold text-rose-700">민감정보 포함</div>
                  ) : null}
                </td>
                <td className="overflow-hidden px-2 py-2 text-[11px] text-slate-700">
                  {row.evidenceStatus}
                </td>
                <td className="overflow-hidden px-2 py-2 text-[10px] leading-4 text-slate-600">
                  <div title={`검토 ${reviewStatusKo(row.reviewStatus)}`}>
                    {reviewStatusKo(row.reviewStatus)}
                  </div>
                  <div title={`개선안내 상태 ${outreachUiStatusKo(row.outreachUiStatus)}`}>
                    {outreachUiStatusKo(row.outreachUiStatus)}
                  </div>
                  {row.publicCaseStatus !== "private" ? (
                    <div
                      className={`mt-0.5 inline-block max-w-full truncate rounded border px-1 py-0.5 text-[10px] font-semibold ${publicCaseStatusBadgeClass(row.publicCaseStatus)}`}
                      title={`공개 사례 ${publicCaseStatusKo(row.publicCaseStatus)}`}
                    >
                      공개 사례 {publicCaseStatusKo(row.publicCaseStatus)}
                    </div>
                  ) : null}
                </td>
                <td className="overflow-hidden px-1 py-2">
                  <AdminCaseRowActions
                    row={row}
                    onReview={() => setOpenId(row.id)}
                    onPublish={() => setPublishId(row.id)}
                    onChanged={() => void apply(form)}
                    onMessage={setToast}
                  />
                </td>
              </tr>
              );
            })}
            {payload && payload.cases.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  조건에 맞는 케이스가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <AdminCaseDrawer
        caseId={openId}
        onClose={() => setOpenId(null)}
        onPublicCaseChanged={() => void apply(form)}
      />
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
