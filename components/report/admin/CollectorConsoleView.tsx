"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CollectorSummary,
  SurveyLinkListItem,
  SurveySourceRow,
} from "@/lib/collector/types";
import {
  collectorDiagnosisLabelKo,
  collectorFreshnessLabelKo,
  collectorLaneLabelKo,
  collectorPlatformLabel,
  collectorSourceChannelKo,
  collectorStatusLabelKo,
  collectorTriageLabelKo,
} from "@/lib/collector/collectorDashboardLabels";
import { classifyCollectorRunSummary } from "@/lib/collector/runKindLabel";

type Filters = {
  platform: string;
  status: string;
  firstDiscoveredFrom: string;
  firstDiscoveredTo: string;
  searchQuery: string;
  novelty: string;
  sourceType: string;
  holdReason: string;
  quickView: string;
  triageQueue: string;
  diagnosisStatus: string;
  q: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
  } catch {
    return value;
  }
}

function platformLabel(platform: string): string {
  return collectorPlatformLabel(platform);
}

function statusLabel(status: string): string {
  return collectorStatusLabelKo(status);
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "closed") return "border-slate-200 bg-slate-100 text-slate-700";
  if (s === "restricted" || s === "limited")
    return "border-amber-200 bg-amber-50 text-amber-800";
  if (s === "stale" || s === "ignored")
    return "border-slate-200 bg-slate-100 text-slate-600";
  if (s === "unreachable" || s === "invalid")
    return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function formatCount(value: number | undefined | null): string {
  return Number(value || 0).toLocaleString("ko-KR");
}

function StatCard({
  label,
  value,
  hint,
  className = "border-slate-200 bg-white",
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-[12px] font-semibold leading-4 text-slate-800">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{hint}</p>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-xl border p-3 text-left ${className} hover:border-teal-400`}
      >
        {inner}
      </button>
    );
  }
  return <div className={`rounded-xl border p-3 ${className}`}>{inner}</div>;
}

export function CollectorConsoleView({
  summary,
  items,
  error,
  filters,
  configError,
}: {
  summary: CollectorSummary | null;
  items: SurveyLinkListItem[];
  error: string | null;
  filters: Filters;
  configError: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...filters,
    holdReason: filters.holdReason || "all",
    quickView: filters.quickView || "all",
  });
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [confirmDiagnose, setConfirmDiagnose] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sourcesById, setSourcesById] = useState<
    Record<string, SurveySourceRow[]>
  >({});
  const [sourcesLoading, setSourcesLoading] = useState<string | null>(null);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (!value || value === "all") continue;
      params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/report/admin/collector?${qs}` : "/report/admin/collector");
  }

  function applyQuick(patch: Partial<Filters>) {
    const next = { ...form, ...patch };
    setForm(next);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") continue;
      params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/report/admin/collector?${qs}` : "/report/admin/collector");
  }

  function resetFilters() {
    applyQuick({
      platform: "all",
      status: "default",
      firstDiscoveredFrom: "",
      firstDiscoveredTo: "",
      searchQuery: "",
      novelty: "all",
      sourceType: "all",
      holdReason: "all",
      quickView: "all",
      triageQueue: "all",
      diagnosisStatus: "all",
      q: "",
    });
  }

  async function logout() {
    await fetch("/api/report/admin/logout", { method: "POST" });
    router.replace("/report/admin/login");
    router.refresh();
  }

  async function runCollection() {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/report/admin/collector/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stats?: {
          newSurveysCount: number;
          duplicateSurveysCount: number;
          errorCount: number;
          queriesCount: number;
        };
      };
      if (!res.ok || !data.ok) {
        setRunMessage(data.error || "수집 실행에 실패했습니다.");
        return;
      }
      setRunMessage(
        `수집 완료 — 질의 ${data.stats?.queriesCount ?? 0}건, 신규 ${data.stats?.newSurveysCount ?? 0}건, 중복 ${data.stats?.duplicateSurveysCount ?? 0}건, 오류 ${data.stats?.errorCount ?? 0}건`,
      );
      router.refresh();
    } catch {
      setRunMessage("네트워크 오류로 수집을 시작하지 못했습니다.");
    } finally {
      setRunning(false);
    }
  }

  async function runOfficialSite(limit: number) {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/report/admin/collector/official-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; crawled?: number };
      if (!res.ok || !data.ok) {
        setRunMessage(data.error || "공식 사이트 수집에 실패했습니다.");
        return;
      }
      setRunMessage(`공식 사이트 수집 완료 — 탐색 기관 ${data.crawled ?? limit}곳`);
      router.refresh();
    } catch {
      setRunMessage("공식 사이트 수집을 시작하지 못했습니다.");
    } finally {
      setRunning(false);
    }
  }

  async function runDiagnose() {
    setDispatching(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/report/admin/collector/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        counts?: { queued?: number };
      };
      if (!res.ok || !data.ok) {
        setRunMessage(data.error || "자동진단 등록에 실패했습니다.");
        return;
      }
      setRunMessage(
        `자동진단 큐에 ${data.counts?.queued ?? 0}건을 등록했습니다. worker가 순차 처리합니다.`,
      );
      router.refresh();
    } catch {
      setRunMessage("자동진단 등록을 시작하지 못했습니다.");
    } finally {
      setDispatching(false);
      setConfirmDiagnose(false);
    }
  }

  async function toggleSources(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (sourcesById[id]) return;
    setSourcesLoading(id);
    try {
      const res = await fetch(
        `/api/report/admin/collector/surveys/${id}/sources`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        sources?: SurveySourceRow[];
      };
      if (res.ok && data.ok) {
        setSourcesById((prev) => ({ ...prev, [id]: data.sources || [] }));
      }
    } finally {
      setSourcesLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            수집함
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
            공개 설문 링크 수집함
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            수집이 잘 되고 있는지, 최근 설문을 찾았는지, 자동진단 큐로 넘겼는지
            보는 운영 화면입니다. 개선안내 검토는{" "}
            <Link href="/report/admin" className="font-semibold text-teal-800 underline">
              관리자 리포트
            </Link>
            에서 합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/report/admin"
            className="rounded-lg border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            관리자 메인
          </Link>
          <button
            type="button"
            onClick={runCollection}
            disabled={running || Boolean(configError)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "수집 중…" : "수집 실행"}
          </button>
          <button
            type="button"
            onClick={() => void runOfficialSite(1)}
            disabled={running || Boolean(configError)}
            className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            다음 기관 수집
          </button>
          <button
            type="button"
            onClick={() => void runOfficialSite(8)}
            disabled={running || Boolean(configError)}
            className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            공식 사이트 수집 실행
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

      {configError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {configError}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {runMessage ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          {runMessage}
        </div>
      ) : null}

      {confirmDiagnose ? (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          <p>
            자동진단 큐에 다음 20건을 등록합니다. 실제 진단은 worker가 순차
            처리합니다. 계속하시겠습니까?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white"
              disabled={dispatching}
              onClick={() => void runDiagnose()}
            >
              {dispatching ? "등록 중…" : "계속"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => setConfirmDiagnose(false)}
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {summary ? (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">오늘 수집·진단 흐름</h2>
          <p className="mt-1 text-xs text-slate-500">오늘 기준입니다. 개선안내 후보는 현재 후보 규모입니다.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="검색·공식사이트 탐색"
              value={`${formatCount(summary.todayFunnel?.searchResults)} · ${formatCount(summary.officialSite?.crawledToday)}`}
              hint="네이버 검색 결과와 오늘 탐색한 공식 사이트 기관 수입니다."
            />
            <StatCard
              label="설문 URL 저장"
              value={formatCount((summary.todayFunnel?.newUrls || 0) + (summary.officialSite?.surveysFoundToday || 0))}
              hint="오늘 저장된 설문 링크입니다."
              onClick={() => applyQuick({ novelty: "new", status: "all" })}
            />
            <StatCard
              label="실제 설문 확인"
              value={formatCount(summary.todayFunnel?.validations)}
              hint="URL을 열어 실제 설문인지 확인한 건수입니다."
            />
            <StatCard
              label="최근 60일 진단대상"
              value={formatCount(summary.officialSite?.todayRecentEligible)}
              hint="오늘 공식 사이트 최근 60일 적격"
              onClick={() => applyQuick({ holdReason: "eligible", sourceType: "official_site", status: "all" })}
            />
            <StatCard
              label="자동진단 완료"
              value={formatCount(summary.diagnosis?.today?.completed ?? summary.todayFunnel?.normalDiagnosis)}
              hint="오늘 문항을 읽어 결과를 낸 설문입니다."
              onClick={() => applyQuick({ diagnosisStatus: "completed", status: "all" })}
            />
            <StatCard
              label="개선안내 후보"
              value={formatCount(summary.opsFunnel?.improvementCandidateCount)}
              hint="현재 개선 안내가 필요해 보이는 설문입니다. 오늘만의 숫자가 아닙니다."
              onClick={() => router.push("/report/admin?outreachOnly=true")}
            />
          </div>
        </section>
      ) : null}

      {summary ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
            <h2 className="text-base font-bold text-slate-900">
              네이버 검색으로 찾은 설문
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              네이버 검색(API)에서 구글폼·네이버폼·모아폼 주소를 찾아 모읍니다.
              검색 결과 수와 실제 설문 수는 다릅니다.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StatCard
                label="네이버 검색 후보"
                value={formatCount(summary.todayFunnel?.searchResults)}
                hint="검색 결과에서 찾은 후보입니다. 설문이 아닐 수도 있습니다."
                className="border-sky-200 bg-white"
              />
              <StatCard
                label="새로 저장한 설문 링크"
                value={formatCount(summary.todayFunnel?.newUrls)}
                hint="오늘 처음 수집함에 들어온 설문 링크입니다."
                className="border-sky-200 bg-white"
                onClick={() => applyQuick({ novelty: "new", sourceType: "naver", status: "all" })}
              />
              <StatCard
                label="실제 설문으로 확인"
                value={formatCount(summary.todayFunnel?.validations)}
                hint="URL을 열어 실제 설문인지 확인한 건수입니다."
                className="border-sky-200 bg-white"
              />
              <StatCard
                label="현재 응답 가능"
                value={formatCount(summary.todayFunnel?.activeTransitions)}
                hint="지금 열려 있고 응답 가능한 설문입니다."
                className="border-sky-200 bg-white"
                onClick={() => applyQuick({ status: "active", sourceType: "naver" })}
              />
              <StatCard
                label="아직 설문 여부 미확인"
                value={formatCount(
                  summary.todayFunnel?.discoveredBacklog ??
                    summary.qualityKpis?.discoveredBacklog,
                )}
                hint="아직 설문 여부를 확인하지 못한 후보입니다."
                className="border-sky-200 bg-white"
                onClick={() => applyQuick({ status: "discovered" })}
              />
              <StatCard
                label="누적 설문 확정"
                value={formatCount(
                  summary.opsFunnel?.collectConfirmed ??
                    summary.monitoring?.validActive ??
                    summary.byStatus?.active,
                )}
                hint="검색으로 모아 설문이라고 확정한 전체 건수입니다."
                className="border-sky-200 bg-white"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
            <h2 className="text-base font-bold text-slate-900">
              공공기관 공식 사이트 수집
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              공공기관 공식 사이트에 직접 접속해 공지사항·참여·신청·설문 페이지에서
              설문 링크를 찾습니다. 네이버 검색과 별도로 동작합니다.
            </p>
            {summary.officialSite ? (
              <>
                <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900">오늘 공식 사이트 수집</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="오늘 탐색한 기관"
                    value={formatCount(summary.officialSite.crawledToday)}
                    hint="오늘 공식 사이트 탐색 기관"
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="오늘 발견한 설문"
                    value={formatCount(summary.officialSite.surveysFoundToday)}
                    hint="오늘 공식 사이트에서 발견한 설문 링크입니다."
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ sourceType: "official_site", status: "all" })}
                  />
                  <StatCard
                    label="오늘 공식 사이트 최근 60일 적격"
                    value={formatCount(summary.officialSite.todayRecentEligible)}
                    hint="공식 사이트에서 발견했고, 게시일·모집기간·마감일 기준으로 최근 설문이라고 판단된 건입니다."
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ sourceType: "official_site", holdReason: "eligible", status: "all" })}
                  />
                  <StatCard
                    label="오늘 과거 연도 제외"
                    value={formatCount(summary.officialSite.todayOldYearExcluded)}
                    hint="오래된 연도라 제외"
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ holdReason: "old_year", sourceType: "official_site", status: "all" })}
                  />
                  <StatCard
                    label="오늘 공식 사이트 날짜 불명 보류"
                    value={formatCount(summary.officialSite.todayDateUnknownHold)}
                    hint="날짜 불명으로 보류"
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ holdReason: "date_unknown", sourceType: "official_site", status: "all" })}
                  />
                  <StatCard
                    label="오늘 접근제한 제외"
                    value={formatCount(
                      summary.officialSite.todayRestrictedExcluded,
                    )}
                    hint="로그인 필요로 제외"
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ holdReason: "restricted", sourceType: "official_site", status: "all" })}
                  />
                  <StatCard
                    label="오늘 자동진단 큐 등록"
                    value={formatCount(summary.officialSite.todayDiagnosisQueued)}
                    hint="오늘 공식 사이트 자동진단 큐 등록"
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="seed 오매핑 의심"
                    value={formatCount(summary.officialSite.needsReviewCount)}
                    hint="기관명과 도메인이 맞지 않아 공식 사이트 여부 확인이 필요한 기관입니다."
                    className="border-amber-200 bg-amber-50"
                  />
                </div>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">
                  전체 누적 통계
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="전체 공공기관 seed 수"
                    value={formatCount(summary.officialSite.institutionCount)}
                    hint="전체 공식 사이트 대상 기관"
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="전체 공식 사이트 발견 설문"
                    value={formatCount(summary.officialSite.totalSurveysFound)}
                    hint="지금까지 공식 사이트에서 발견한 설문입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="전체 공식 사이트 적격 설문"
                    value={formatCount(summary.officialSite.totalRecentEligible)}
                    hint="전체 최근 60일 적격 설문"
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="전체 과거 연도 제외"
                    value={formatCount(summary.officialSite.totalOldYearExcluded)}
                    hint="오래된 연도라 제외한 누적"
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ holdReason: "old_year", status: "all" })}
                  />
                  <StatCard
                    label="전체 날짜 불명 보류"
                    value={formatCount(summary.officialSite.totalDateUnknownHold)}
                    hint="날짜를 몰라 보류한 누적"
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ holdReason: "date_unknown", status: "all" })}
                  />
                  <StatCard
                    label="전체 접근제한 제외"
                    value={formatCount(summary.officialSite.totalRestrictedExcluded)}
                    hint="로그인 필요로 제외한 누적"
                    className="border-teal-200 bg-white"
                    onClick={() => applyQuick({ holdReason: "restricted", status: "all" })}
                  />
                </div>
                {(summary.officialSite.totalDateUnknownHold || 0) >= 50 ? (
                  <p className="mt-3 text-xs text-amber-800">
                    날짜를 확인하지 못해 자동진단에서 보류된 설문이 많습니다. 출처
                    페이지의 게시일·모집기간 추출 상태를 확인하세요.
                  </p>
                ) : null}
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">
                  공식 사이트 수집 품질
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="오늘 탐색 페이지 수"
                    value={formatCount(summary.officialSite.todayPagesFetched)}
                    hint="오늘 공식 사이트에서 연 페이지 수입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="기관당 평균 페이지 수"
                    value={(summary.officialSite.avgPagesPerOrg || 0).toFixed(1)}
                    hint="오늘 탐색 기관당 평균 페이지입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="설문 발견 기관 수"
                    value={formatCount(summary.officialSite.todayOrgsWithSurveys)}
                    hint="오늘 설문을 하나라도 찾은 기관 수입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="설문 발견률"
                    value={`${(((summary.officialSite.surveyDiscoveryRate || 0) * 100).toFixed(0))}%`}
                    hint="오늘 탐색 기관 중 설문을 찾은 비율입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="날짜 추출 성공률"
                    value={`${(((summary.officialSite.dateExtractSuccessRate || 0) * 100).toFixed(0))}%`}
                    hint="공식 사이트 설문에서 날짜를 잡은 비율입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="source_page_url 저장률"
                    value={`${(((summary.officialSite.sourcePageUrlSaveRate || 0) * 100).toFixed(0))}%`}
                    hint="설문 링크가 발견된 실제 게시글/페이지 URL이 저장된 비율입니다."
                    className="border-teal-200 bg-white"
                  />
                  <StatCard
                    label="실패 기관 수"
                    value={formatCount(summary.officialSite.failedOrgCount)}
                    hint="최근 수집이 실패한 기관입니다."
                    className="border-teal-200 bg-white"
                  />
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                공공기관 수집 숫자를 아직 불러오지 못했습니다.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {summary?.todayFunnel || summary?.diagnosis?.today ? (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">오늘 자동진단 처리</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            모아 둔 설문을 오늘 얼마나 열어봤고, 그 결과가 어떤지 보여줍니다.
            하루 동안 진단할 수 있는 횟수에는 한도가 있습니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <StatCard
              label="오늘 진단해 본 설문"
              value={formatCount(
                summary?.diagnosis?.today?.attempted ??
                  summary?.todayFunnel?.diagnosisAttempted,
              )}
              hint="오늘 자동진단을 시도한 횟수입니다."
            />
            <StatCard
              label="정상적으로 진단된 설문"
              value={formatCount(
                summary?.diagnosis?.today?.completed ??
                  summary?.todayFunnel?.normalDiagnosis,
              )}
              hint="문항을 읽어 결과를 낸 설문입니다."
            />
            <StatCard
              label="이미 끝나 있어서 제외"
              value={formatCount(
                summary?.diagnosis?.today?.skippedClosed ??
                  summary?.todayFunnel?.closedToday,
              )}
              hint="응답 기간이 지난 설문입니다."
              onClick={() => applyQuick({ holdReason: "closed", status: "all" })}
            />
            <StatCard
              label="로그인이 필요해 제외"
              value={formatCount(
                summary?.diagnosis?.today?.skippedRestricted ??
                  summary?.todayFunnel?.restrictedToday,
              )}
              hint="권한이 있어야 열 수 있는 설문입니다."
              onClick={() => applyQuick({ holdReason: "restricted", status: "all" })}
            />
            <StatCard
              label="내용을 읽지 못해 제외"
              value={formatCount(
                summary?.diagnosis?.today?.limited ??
                  summary?.todayFunnel?.extractionLimitedToday,
              )}
              hint="화면은 열렸지만 문항을 충분히 읽지 못했습니다."
              onClick={() => applyQuick({ diagnosisStatus: "limited", status: "all" })}
            />
            <StatCard
              label="아직 진단하지 못한 설문"
              value={formatCount(
                summary?.todayFunnel?.diagnosisBacklog ??
                  summary?.qualityKpis?.diagnosisBacklog,
              )}
              hint="응답 가능한데 자동진단이 아직 안 된 설문입니다."
              onClick={() => applyQuick({ diagnosisStatus: "undiagnosed", holdReason: "eligible", status: "all" })}
            />
            <StatCard
              label="오늘 남은 자동진단 한도"
              value={`${formatCount(
                summary?.diagnosis?.today?.remaining ??
                  summary?.todayFunnel?.diagnosisRemaining ??
                  summary?.qualityKpis?.dailyDiagnosisRemaining,
              )} / ${formatCount(
                summary?.diagnosis?.today?.dailyMax ??
                  summary?.qualityKpis?.dailyDiagnosisCapacity ??
                  summary?.opsFunnel?.dailyLimit ??
                  300,
              )}`}
              hint="오늘 더 진단할 수 있는 횟수입니다."
            />
            <StatCard
              label="개선안내 후보"
              value={formatCount(summary?.opsFunnel?.improvementCandidateCount)}
              hint="위법 확정이 아닙니다. 확인·개선이 필요해 보이는 건수입니다."
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => applyQuick({ diagnosisStatus: "undiagnosed", holdReason: "eligible", status: "all" })}
            >
              목록 보기
            </button>
            <button
              type="button"
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              disabled={dispatching}
              onClick={() => setConfirmDiagnose(true)}
            >
              다음 20건 진단
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => applyQuick({ holdReason: "closed", status: "all" })}
            >
              제외 목록 보기
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => applyQuick({ holdReason: "restricted", status: "all" })}
            >
              접근제한 목록 보기
            </button>
            <Link
              href="/report/admin?outreachOnly=true"
              className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              관리자 리포트에서 보기
            </Link>
          </div>
        </section>
      ) : null}

      {summary?.opsFunnel?.missingWarning ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          설문으로 확정됐는데 아직 자동진단이 안 된 건이{" "}
          {formatCount(summary.opsFunnel.diagnosisMissing)}건 있습니다. 다음
          자동진단 때 이어서 처리합니다.
        </div>
      ) : null}

      {summary?.qualityKpis ? (
        <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            시스템이 잘 돌고 있는지
          </summary>
          <p className="mt-2 text-sm text-slate-600">
            평소에는 닫아 두셔도 됩니다. 숫자가 갑자기 커지면 작업이 멈춘
            것입니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="오늘 시스템 오류 비율"
              value={`${(summary.qualityKpis.systemFailureRateToday * 100).toFixed(1)}%`}
              hint="설문이 끝나거나 로그인이 필요한 경우는 오류가 아닙니다."
            />
            <StatCard
              label="오래 멈춘 수집"
              value={formatCount(summary.qualityKpis.stuckCollectionRuns)}
              hint="30분 넘게 끝나지 않은 수집 작업입니다."
            />
            <StatCard
              label="오래 멈춘 진단"
              value={formatCount(summary.qualityKpis.stuckScanJobs)}
              hint="30분 넘게 끝나지 않은 진단 작업입니다."
            />
            <StatCard
              label="지금까지 모은 주소"
              value={formatCount(
                summary.opsFunnel?.rawDiscovered ??
                  summary.monitoring?.totalDiscovered ??
                  summary.totalLinksAll,
              )}
              hint="검색·공식 사이트에서 들어온 주소 전체입니다. 설문이 아닌 것도 포함됩니다."
            />
            <StatCard
              label="응답이 끝난 설문"
              value={formatCount(
                summary.monitoring?.closed ?? summary.byStatus?.closed,
              )}
            />
            <StatCard
              label="오래된 설문"
              value={formatCount(
                summary.monitoring?.stale ?? summary.byStatus?.stale,
              )}
            />
            <StatCard
              label="설문으로 확정된 비율"
              value={`${((summary.opsFunnel?.collectConfirmedRate ?? 0) * 100).toFixed(1)}%`}
            />
            <StatCard
              label="자동진단이 끝난 비율"
              value={`${((summary.opsFunnel?.diagnosisCoverageRate ?? 0) * 100).toFixed(1)}%`}
            />
          </div>
        </details>
      ) : null}

      {summary?.lastRun ? (
        <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <summary className="cursor-pointer font-semibold text-slate-900">
            최근 수집 실행 상세
          </summary>
          <p className="mt-3">
            <span className="text-slate-500">마지막 수집:</span>{" "}
            {formatDate(summary.lastRun.started_at)} ·{" "}
            <span className="font-semibold text-teal-800">
              {summary.lastRun.trigger}
            </span>{" "}
            · 상태{" "}
            <span className="font-semibold text-teal-800">
              {summary.lastRun.status}
            </span>
            {" · "}
            <span className="font-semibold text-sky-800">
              {classifyCollectorRunSummary(summary.lastRun.error_summary).labelKo}
            </span>{" "}
            · API {summary.lastRunApiCalls} · 결과{" "}
            {summary.lastRun.results_count} · 후보{" "}
            {summary.lastRun.candidate_links_count} · 신규{" "}
            {summary.lastRun.new_surveys_count} / 재발견{" "}
            {summary.lastRun.duplicate_surveys_count} / 오류{" "}
            {summary.lastRun.error_count}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            후보 전환율{" "}
            {(summary.lastRunCandidateConversionRate * 100).toFixed(1)}% · 신규
            전환율 {(summary.lastRunNewSurveyConversionRate * 100).toFixed(1)}%
            · Google {summary.byPlatformAll.google_forms} / Naver{" "}
            {summary.byPlatformAll.naver_form} / Moa{" "}
            {summary.byPlatformAll.moaform} · active{" "}
            {summary.byStatus?.active ?? 0} / closed{" "}
            {summary.byStatus?.closed ?? 0} / restricted{" "}
            {summary.byStatus?.restricted ?? 0} / invalid{" "}
            {summary.byStatus?.invalid ?? 0} / discovered{" "}
            {summary.byStatus?.discovered ?? 0} / unreachable{" "}
            {summary.byStatus?.unreachable ?? 0}
          </p>
          {!summary.lastRunHasQueryStats ? (
            <p className="mt-2 text-xs text-amber-800">
              이 실행에는 검색어별 상세 통계(collection_query_stats)가 없습니다.
              migration 006 적용 이전 실행이거나 통계 저장에 실패했을 수 있습니다.
              새로 「수집 실행」하면 검색어 성과가 표시됩니다.
            </p>
          ) : null}
          {summary.lastRun.error_summary ? (
            <p className="mt-2 whitespace-pre-wrap text-xs text-rose-800">
              {classifyCollectorRunSummary(summary.lastRun.error_summary).kind ===
              "revalidate"
                ? "최근 재검증 요약"
                : "최근 실행 요약"}
              : {summary.lastRun.error_summary.slice(0, 600)}
            </p>
          ) : null}
        </details>
      ) : null}

      {summary && summary.lastRunHasQueryStats ? (
        <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            검색어별 성과 상세
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-teal-800">
                효율 상위 검색어
              </p>
              <ul className="space-y-2 text-xs text-slate-700">
                {summary.topQueries.map((q) => (
                  <li
                    key={`top-${q.searchQuery}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="font-medium text-slate-900">{q.searchQuery}</p>
                    <p className="mt-1 text-slate-500">
                      후보 전환 {(q.candidateConversionRate * 100).toFixed(1)}% ·
                      신규 {q.newSurveyCount} · 실제설문 {q.validSurveyCount} ·
                      판정{" "}
                      {q.tier === "keep"
                        ? "유지"
                        : q.tier === "improve"
                          ? "보완"
                          : "중단 검토"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-amber-800">
                효율 하위 / 중단 검토
              </p>
              <ul className="space-y-2 text-xs text-slate-700">
                {summary.bottomQueries.map((q) => (
                  <li
                    key={`bot-${q.searchQuery}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="font-medium text-slate-900">{q.searchQuery}</p>
                    <p className="mt-1 text-slate-500">
                      결과 {q.resultsCount} · 후보 {q.candidateCount} · 신규{" "}
                      {q.newSurveyCount} · unreachable {q.unreachableCount} ·
                      판정{" "}
                      {q.tier === "keep"
                        ? "유지"
                        : q.tier === "improve"
                          ? "보완"
                          : "중단 검토"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[11px] text-slate-700">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">검색어</th>
                  <th className="px-2 py-2 font-semibold">결과</th>
                  <th className="px-2 py-2 font-semibold">후보</th>
                  <th className="px-2 py-2 font-semibold">신규</th>
                  <th className="px-2 py-2 font-semibold">후보전환</th>
                  <th className="px-2 py-2 font-semibold">신규전환</th>
                  <th className="px-2 py-2 font-semibold">invalid</th>
                  <th className="px-2 py-2 font-semibold">unreachable</th>
                  <th className="px-2 py-2 font-semibold">평가</th>
                </tr>
              </thead>
              <tbody>
                {summary.lastRunQueryPerformance.map((q) => (
                  <tr
                    key={q.searchQuery}
                    className="border-b border-slate-800/80"
                  >
                    <td className="max-w-[14rem] truncate px-2 py-1.5 text-slate-900">
                      {q.searchQuery}
                    </td>
                    <td className="px-2 py-1.5">{q.resultsCount}</td>
                    <td className="px-2 py-1.5">{q.candidateCount}</td>
                    <td className="px-2 py-1.5">{q.newSurveyCount}</td>
                    <td className="px-2 py-1.5">
                      {(q.candidateConversionRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 py-1.5">
                      {(q.newSurveyConversionRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 py-1.5">{q.invalidCount}</td>
                    <td className="px-2 py-1.5">{q.unreachableCount}</td>
                    <td className="px-2 py-1.5">
                      {q.tier === "keep"
                        ? "유지"
                        : q.tier === "improve"
                          ? "보완"
                          : "중단 검토"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            검색어는 자동 삭제되지 않습니다. 관리자가 유지·보완·중단을 판단하세요.
            unreachable은 미확인이며 실제 설문 확인 수에 포함하지 않습니다.
            discovered 잔여는 수집 인라인 검증 한도(48)로 남을 수 있으며, 별도
            backlog 재검증(권장 batch 40)으로 처리합니다.
          </p>
        </details>
      ) : null}

      <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900">
          최근 공식 사이트 수집 로그
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          오늘 탐색 기관 {formatCount(summary?.officialSite?.crawledToday)} · 발견
          설문 {formatCount(summary?.officialSite?.surveysFoundToday)} · 실패 기관{" "}
          {formatCount(summary?.officialSite?.failedOrgCount)}
        </p>
      </details>
      <details className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900">
          최근 자동진단 큐 등록 로그
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          오늘 시도 {formatCount(summary?.diagnosis?.today?.attempted)} · 완료{" "}
          {formatCount(summary?.diagnosis?.today?.completed)} · 남은 한도{" "}
          {formatCount(summary?.diagnosis?.today?.remaining)}
        </p>
      </details>

      {summary?.improvementCandidates && summary.improvementCandidates.length > 0 ? (
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                개선안내 후보 {formatCount(summary.opsFunnel?.improvementCandidateCount)}건
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                개인정보 수집 고지 미흡, 보유기간 미흡, 외부도구 안내 미흡 등으로
                개선 안내가 필요해 보이는 설문입니다.
              </p>
            </div>
            <Link
              href="/report/admin?outreachOnly=true"
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
            >
              관리자 리포트에서 보기
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {summary.improvementCandidates.slice(0, 5).map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                <div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-800">
                      우선순위 {row.priority <= 2 ? "A" : "B"}
                    </span>
                    <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-700">
                      {row.publicPrivateType === "public" ? "공공기관" : "민간기업"}
                    </span>
                    <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-700">
                      {row.hasEvidence ? "증거 확보" : "증거 부족"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {row.operatorName || "(기관명 없음)"} · {row.surveyTitle || "(제목 없음)"}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-800">
                    주요 문제: {(row.gapLabels || []).slice(0, 3).join(", ") || row.wording}
                  </p>
                </div>
                <Link
                  href={`/report/admin?q=${encodeURIComponent(row.surveyTitle || row.operatorName || "")}`}
                  className="rounded border border-teal-700 bg-teal-700 px-2 py-0.5 text-[11px] font-semibold text-white"
                >
                  검토
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {summary ? (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">보류·제외 사유 요약</h2>
          <p className="mt-1 text-xs text-slate-500">왜 자동진단하지 않았는지 먼저 확인합니다.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="날짜 불명 보류"
              value={formatCount(summary.officialSite?.totalDateUnknownHold)}
              hint="게시일·응답기간·마감일을 확인하지 못해 자동진단에서 제외된 설문입니다."
              onClick={() => applyQuick({ holdReason: "date_unknown", status: "all" })}
            />
            <StatCard
              label="과거 연도 제외"
              value={formatCount(summary.officialSite?.totalOldYearExcluded ?? summary.opsFunnel?.screenedStale)}
              hint="작년·이전 연도 신호로 진단에서 뺀 설문입니다."
              onClick={() => applyQuick({ holdReason: "old_year", status: "all" })}
            />
            <StatCard
              label="종료 설문 제외"
              value={formatCount(summary.opsFunnel?.screenedClosed ?? summary.byStatus?.closed)}
              hint="응답이 끝나 진단하지 않은 설문입니다."
              onClick={() => applyQuick({ holdReason: "closed", status: "all" })}
            />
            <StatCard
              label="로그인/접근제한 제외"
              value={formatCount(summary.opsFunnel?.screenedRestricted ?? summary.byStatus?.restricted)}
              hint="로그인이 필요해 열지 못한 설문입니다."
              onClick={() => applyQuick({ holdReason: "restricted", status: "all" })}
            />
            <StatCard
              label="개인연구 제외"
              value={formatCount(summary.opsFunnel?.screenedPersonal)}
              hint="개인·학술 연구로 보여 개선안내 대상에서 뺀 설문입니다."
              onClick={() => applyQuick({ holdReason: "personal", status: "all" })}
            />
            <StatCard
              label="URL 오류"
              value={formatCount((summary.byStatus?.invalid || 0) + (summary.byStatus?.unreachable || 0))}
              hint="주소가 잘못됐거나 열리지 않은 건입니다."
              onClick={() => applyQuick({ holdReason: "invalid", status: "all" })}
            />
          </div>
        </section>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">적용 필터:</span>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">
          {form.sourceType === "official_site"
            ? "공식 사이트 수집"
            : form.sourceType === "naver"
              ? "네이버 검색 수집"
              : form.sourceType !== "all"
                ? form.sourceType
                : "전체"}
        </span>
        {form.holdReason === "date_unknown" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">날짜 불명 보류</span>
        ) : null}
        {form.holdReason === "eligible" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">진단대상</span>
        ) : null}
        {form.diagnosisStatus === "completed" ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">진단완료</span>
        ) : null}
        {form.q ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-900">검색: {form.q}</span>
        ) : null}
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
        >
          초기화
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["진단대상", { holdReason: form.holdReason === "eligible" ? "all" : "eligible", status: "all" }],
            ["진단완료", { diagnosisStatus: form.diagnosisStatus === "completed" ? "all" : "completed", status: "all" }],
            ["날짜불명 보류", { holdReason: form.holdReason === "date_unknown" ? "all" : "date_unknown", status: "all" }],
            ["과거연도 제외", { holdReason: form.holdReason === "old_year" ? "all" : "old_year", status: "all" }],
            ["로그인 제외", { holdReason: form.holdReason === "restricted" ? "all" : "restricted", status: "all" }],
            ["개선안내 후보", { diagnosisStatus: "completed", status: "all" }],
            ["공식 사이트 수집", { sourceType: form.sourceType === "official_site" ? "all" : "official_site", status: "all" }],
            ["네이버 검색 수집", { sourceType: form.sourceType === "naver" ? "all" : "naver", status: "all" }],
          ] as Array<[string, Partial<Filters>]>
        ).map(([label, patch]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (label === "개선안내 후보") {
                router.push("/report/admin?outreachOnly=true");
                return;
              }
              applyQuick(patch);
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800"
          >
            {label}
          </button>
        ))}
      </div>

      <details className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          상세 필터 (접기/펼치기)
        </summary>
      <form
        onSubmit={applyFilters}
        className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3 lg:grid-cols-4"
      >
        <label className="text-xs text-slate-500">
          플랫폼
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="google_forms">Google Forms</option>
            <option value="naver_form">Naver Form</option>
            <option value="moaform">Moaform</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          상태
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.status || "default"}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="default">기본(응답가능·미확인)</option>
            <option value="all">전체</option>
            <option value="active">응답가능</option>
            <option value="discovered">미확인</option>
            <option value="closed">응답종료</option>
            <option value="stale">과거 설문</option>
            <option value="restricted">권한필요</option>
            <option value="unreachable">접속실패</option>
            <option value="invalid">비설문</option>
            <option value="ignored">제외</option>
            <option value="non_invalid">비설문 제외</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          최초 발견 시작일
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.firstDiscoveredFrom}
            onChange={(e) =>
              setForm({ ...form, firstDiscoveredFrom: e.target.value })
            }
          />
        </label>
        <label className="text-xs text-slate-500">
          최초 발견 종료일
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.firstDiscoveredTo}
            onChange={(e) =>
              setForm({ ...form, firstDiscoveredTo: e.target.value })
            }
          />
        </label>
        <label className="text-xs text-slate-500">
          검색어(수집 질의)
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.searchQuery}
            onChange={(e) => setForm({ ...form, searchQuery: e.target.value })}
            placeholder="예: 만족도 조사"
          />
        </label>
        <label className="text-xs text-slate-500">
          신규/기존
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.novelty}
            onChange={(e) => setForm({ ...form, novelty: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="new">신규(발견 1회)</option>
            <option value="existing">기존(재발견)</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          출처 유형
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.sourceType}
            onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="web">네이버 검색 · 웹문서</option>
            <option value="blog">네이버 검색 · 블로그</option>
            <option value="cafe">네이버 검색 · 카페</option>
            <option value="official_site">공공기관 공식 사이트</option>
            <option value="naver">네이버 검색 수집</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          검증 큐 (A/B/C)
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.triageQueue || "all"}
            onChange={(e) => setForm({ ...form, triageQueue: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="A_PRIORITY">우선순위 A</option>
            <option value="B_PRIORITY">우선순위 B</option>
            <option value="C_ARCHIVE">낮은 우선순위 보관</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          자동진단
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.diagnosisStatus || "all"}
            onChange={(e) =>
              setForm({ ...form, diagnosisStatus: e.target.value })
            }
          >
            <option value="all">전체</option>
            <option value="undiagnosed">미진단</option>
            <option value="queued">대기</option>
            <option value="running">진단중</option>
            <option value="completed">완료</option>
            <option value="limited">제한 진단</option>
            <option value="failed">실패</option>
          </select>
        </label>
        <label className="text-xs text-slate-500 md:col-span-2">
          제목/URL 검색
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
            value={form.q}
            onChange={(e) => setForm({ ...form, q: e.target.value })}
            placeholder="키워드"
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
      </form>
      </details>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          수집 설문 목록 ({items.length.toLocaleString("ko-KR")})
        </div>
        <div className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              조건에 맞는 수집 설문이 없습니다.
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800">
                        {platformLabel(item.platform)}
                      </span>
                      {item.collect_lane ? (
                        <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800">
                          {collectorLaneLabelKo(item.collect_lane) || collectorStatusLabelKo(item.status)}
                        </span>
                      ) : null}
                      {item.auto_diagnosis_target ? (
                        <span className="rounded border border-teal-200 px-1.5 py-0.5 text-[11px] text-teal-800">
                          진단 대상 후보
                        </span>
                      ) : null}
                      {item.triage_queue ? (
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                            item.triage_queue === "A_PRIORITY"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : item.triage_queue === "B_PRIORITY"
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {collectorTriageLabelKo(item.triage_queue)}
                        </span>
                      ) : null}
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${
                          item.diagnosis_status === "completed"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : item.diagnosis_status === "limited"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : item.diagnosis_status === "failed" ||
                                  item.diagnosis_status === "failed_retryable" ||
                                  item.diagnosis_status === "failed_final"
                                ? "border-rose-200 bg-rose-50 text-rose-800"
                                : "border-sky-200 bg-sky-50 text-sky-800"
                        }`}
                      >
                        {collectorDiagnosisLabelKo(item.diagnosis_status)}
                      </span>
                      {item.diagnosis_status === "completed" &&
                      (item.diagnosis_score != null || item.diagnosis_grade) ? (
                        <span className="text-[11px] text-slate-700">
                          점수 {item.diagnosis_score ?? "—"} /{" "}
                          {item.diagnosis_grade ?? "—"}
                        </span>
                      ) : null}
                      {item.diagnosis_status === "limited" ? (
                        <span className="text-[11px] text-amber-800">
                          내용을 읽지 못함
                        </span>
                      ) : null}
                      {item.diagnosis_job_id ? (
                        <Link
                          href={`/report/${item.diagnosis_job_id}`}
                          className="text-[11px] font-semibold text-teal-800 underline-offset-2 hover:underline"
                        >
                          리포트
                        </Link>
                      ) : null}
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(item.status)}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        발견 {item.discovery_count}회 · 출처{" "}
                        {item.source_count}건
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {item.title || "(제목 없음)"}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-800">
                      최근성 판단:{" "}
                      {collectorFreshnessLabelKo({
                        status: item.status,
                        lane: item.collect_lane,
                        reasonCode: item.freshness?.reason_code,
                        exclusionReason: item.freshness?.diagnosis_exclusion_reason,
                        eligibleRecent: item.freshness?.diagnosis_eligible_recent,
                        reasonText: item.freshness?.freshness_reason,
                      })}
                    </p>
                    <a
                      href={item.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-teal-800 hover:underline"
                    >
                      {item.canonical_url}
                    </a>
                    <p className="mt-1 text-[11px] text-slate-500">
                      발견: {formatDate(item.first_discovered_at)} · 최근{" "}
                      {item.discovery_count}건 · 출처{" "}
                      {collectorSourceChannelKo(
                        item.freshness?.discovery_channel || undefined,
                      )}
                    </p>
                    {item.sample_source_url ? (
                      <a
                        href={item.sample_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-[11px] text-slate-500 hover:text-teal-800 hover:underline"
                      >
                        원문: {item.sample_source_title || item.sample_source_url}
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <a
                      href={item.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      원본 열기
                    </a>
                    <button
                    type="button"
                    onClick={() => toggleSources(item.id)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {expandedId === item.id ? "출처 닫기" : "출처 보기"}
                  </button>
                    <button
                      type="button"
                      className="rounded-lg border border-teal-200 px-2.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                      onClick={() => setConfirmDiagnose(true)}
                    >
                      진단 큐 등록
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => toggleSources(item.id)}
                    >
                      상세 보기
                    </button>
                  </div>
                </div>
                {expandedId === item.id ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {sourcesLoading === item.id ? (
                      <p className="text-xs text-slate-500">불러오는 중…</p>
                    ) : (sourcesById[item.id] || []).length === 0 ? (
                      <p className="text-xs text-slate-500">출처가 없습니다.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(sourcesById[item.id] || []).map((source) => (
                          <li key={source.id} className="text-xs text-slate-700">
                            <span className="mr-2 rounded border border-slate-200 px-1 text-[10px] text-slate-500">
                              {source.source_type === "official_site"
                                ? "공식 사이트"
                                : "네이버 검색"}
                            </span>
                            <a
                              href={source.source_page_url || source.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-800 hover:underline"
                            >
                              {source.source_page_title ||
                                source.source_title ||
                                source.source_page_url ||
                                source.source_url}
                            </a>
                            {source.source_organization_name ? (
                              <span className="ml-2 text-slate-500">
                                · {source.source_organization_name}
                              </span>
                            ) : null}
                            {source.search_query ? (
                              <span className="ml-2 text-slate-500">
                                · {source.search_query}
                              </span>
                            ) : null}
                            {source.source_anchor_text ? (
                              <p className="mt-1 text-[11px] text-slate-500">
                                앵커: {source.source_anchor_text}
                              </p>
                            ) : null}
                            {source.source_context_excerpt ? (
                              <p className="mt-1 text-[11px] text-slate-500">
                                {source.source_context_excerpt}
                              </p>
                            ) : null}
                            {source.source_date_text ? (
                              <p className="mt-1 text-[11px] text-amber-800">
                                {source.source_date_text}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
