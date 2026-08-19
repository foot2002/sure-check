"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CollectorSummary,
  SurveyLinkListItem,
  SurveySourceRow,
} from "@/lib/collector/types";
import { classifyCollectorRunSummary } from "@/lib/collector/runKindLabel";

type Filters = {
  platform: string;
  status: string;
  firstDiscoveredFrom: string;
  firstDiscoveredTo: string;
  searchQuery: string;
  novelty: string;
  sourceType: string;
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
  if (platform === "google_forms") return "Google Forms";
  if (platform === "naver_form") return "Naver Form";
  if (platform === "moaform") return "Moaform";
  return platform;
}

function statusLabel(status: string): string {
  if (status === "active") return "ACTIVE";
  if (status === "discovered") return "DISCOVERED";
  if (status === "closed") return "CLOSED";
  if (status === "restricted") return "RESTRICTED";
  if (status === "limited") return "LIMITED";
  if (status === "completed") return "COMPLETED";
  if (status === "unreachable") return "UNREACHABLE";
  if (status === "invalid") return "INVALID";
  if (status === "stale") return "STALE";
  if (status === "ignored") return "IGNORED";
  return status.toUpperCase();
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "active") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
  if (s === "closed") return "border-slate-500/40 bg-slate-500/20 text-slate-200";
  if (s === "restricted" || s === "limited")
    return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  if (s === "stale" || s === "ignored")
    return "border-slate-500/40 bg-slate-700/40 text-slate-200";
  if (s === "unreachable" || s === "invalid")
    return "border-rose-500/40 bg-rose-500/15 text-rose-100";
  return "border-slate-600 bg-slate-800 text-slate-200";
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
  const [form, setForm] = useState(filters);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
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
          <p className="text-xs font-semibold tracking-wide text-teal-300">
            Admin Collector
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            공개 설문 링크 수집함
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            네이버 검색으로 발견한 구글폼·네이버폼·모아폼 URL을 저장·조회합니다.
            진단 파이프라인과는 연결되어 있지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/report/admin"
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            진단 리포트
          </Link>
          <button
            type="button"
            onClick={runCollection}
            disabled={running || Boolean(configError)}
            className="rounded-lg border border-teal-500/50 bg-teal-500/15 px-3 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "수집 중…" : "수집 실행"}
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            로그아웃
          </button>
        </div>
      </header>

      {configError ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {configError}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {runMessage ? (
        <div className="mb-4 rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
          {runMessage}
        </div>
      ) : null}

      {summary?.todayFunnel ? (
        <section className="mb-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              오늘 자동화 퍼널 (KST)
            </h2>
            <p className="text-[11px] text-slate-500">
              단계별 모수가 다릅니다. 검색결과 ≠ 신규URL ≠ 검증 ≠ 진단 결과로
              해석하세요.
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["검색결과", summary.todayFunnel.searchResults],
                ["신규 URL", summary.todayFunnel.newUrls],
                ["검증(후보)", summary.todayFunnel.validations],
                ["active 전환", summary.todayFunnel.activeTransitions],
                ["A급 추정", summary.todayFunnel.newAPriorityApprox],
                ["discovered 잔여", summary.todayFunnel.discoveredBacklog],
                ["진단 backlog", summary.todayFunnel.diagnosisBacklog],
                ["진단 시도", summary.todayFunnel.diagnosisAttempted],
                ["정상 진단", summary.todayFunnel.normalDiagnosis],
                ["종료(오늘)", summary.todayFunnel.closedToday],
                ["접근제한(오늘)", summary.todayFunnel.restrictedToday],
                ["추출제한", summary.todayFunnel.extractionLimitedToday],
                ["시스템실패", summary.todayFunnel.systemFailureToday],
                ["진단 잔여", summary.todayFunnel.diagnosisRemaining],
              ] as const
            ).map(([label, value], index, arr) => (
              <div
                key={label}
                className="flex shrink-0 items-center gap-2"
              >
                <div className="min-w-[5.5rem] rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-slate-400">
                    {label}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
                    {value.toLocaleString("ko-KR")}
                  </p>
                </div>
                {index < arr.length - 1 ? (
                  <span className="text-slate-600" aria-hidden>
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {summary?.qualityKpis ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">운영 품질</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {(
              [
                [
                  "시스템 실패율",
                  `${(summary.qualityKpis.systemFailureRateToday * 100).toFixed(1)}%`,
                  "종료·접근제한 제외",
                ],
                [
                  "Stuck 수집",
                  summary.qualityKpis.stuckCollectionRuns.toLocaleString("ko-KR"),
                  "running >30분",
                ],
                [
                  "Stuck 스캔",
                  summary.qualityKpis.stuckScanJobs.toLocaleString("ko-KR"),
                  "queued/running >30분",
                ],
                [
                  "추출 제한",
                  summary.qualityKpis.extractionLimitedToday.toLocaleString(
                    "ko-KR",
                  ),
                  "실패와 분리",
                ],
                [
                  "discovered 잔여",
                  summary.qualityKpis.discoveredBacklog.toLocaleString("ko-KR"),
                  "미검증 backlog",
                ],
                [
                  "진단 backlog",
                  summary.qualityKpis.diagnosisBacklog.toLocaleString("ko-KR"),
                  "최근 active 표본",
                ],
                [
                  "진단 잔여 용량",
                  `${summary.qualityKpis.dailyDiagnosisRemaining.toLocaleString("ko-KR")} / ${summary.qualityKpis.dailyDiagnosisCapacity.toLocaleString("ko-KR")}`,
                  "일일 한도",
                ],
              ] as const
            ).map(([label, value, hint]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-700 bg-slate-900/70 p-3"
              >
                <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-white">
                  {value}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {summary ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[
            ["원시 발견 후보", summary.opsFunnel?.rawDiscovered ?? summary.monitoring?.totalDiscovered ?? summary.totalLinksAll],
            ["수집 후보", summary.opsFunnel?.collectCandidate ?? summary.monitoring?.unverified ?? 0],
            ["수집 확정", summary.opsFunnel?.collectConfirmed ?? summary.monitoring?.validActive ?? summary.byStatus?.active ?? 0],
            ["미검증", summary.monitoring?.unverified ?? summary.verification.unverifiedDiscovered],
            ["종료(closed)", summary.monitoring?.closed ?? summary.byStatus?.closed ?? 0],
            ["과거 제외(stale)", summary.monitoring?.stale ?? summary.byStatus?.stale ?? 0],
            ["접근 제한", summary.monitoring?.restricted ?? summary.byStatus?.restricted ?? 0],
            ["개인연구 제외", summary.opsFunnel?.screenedPersonal ?? summary.byStatus?.ignored ?? 0],
            [
              "자동진단 대상",
              summary.opsFunnel?.collectConfirmed ??
                summary.monitoring?.diagnosisEligibleActive ??
                summary.byStatus?.active ??
                0,
            ],
            [
              "자동진단 누락",
              summary.opsFunnel?.diagnosisMissing ?? 0,
            ],
            [
              "개선안내 후보",
              summary.opsFunnel?.improvementCandidateCount ?? 0,
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-700 bg-slate-900/70 p-3"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                {typeof value === "number"
                  ? value.toLocaleString("ko-KR")
                  : value}
              </p>
            </div>
          ))}
        </section>
      ) : null}
      {summary ? (
        <p className="mb-4 text-[11px] text-slate-500">
          수집건수는 수집 확정(collect_confirmed) 기준입니다. 원시 발견·수집 후보는 자동진단하지 않습니다.
          종료·과거·비공개·개인연구 링크는 수집 확정에서 제외됩니다.
          unreachable {summary.monitoring?.unreachable ?? 0} · invalid{" "}
          {summary.monitoring?.invalid ?? 0} · 오늘 신규 {summary.todayNew}
        </p>
      ) : null}

      {summary?.opsFunnel?.missingWarning ? (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          수집 확정 URL 중 자동진단 누락 {summary.opsFunnel.diagnosisMissing.toLocaleString("ko-KR")}건이
          있습니다 (최근 활성 표본 {summary.opsFunnel.sampleSize.toLocaleString("ko-KR")}건 기준).
          운영상 실패로 보고 다음 웨이브에서 이월 처리하세요. 하루 한도{" "}
          {summary.opsFunnel.dailyLimit} / 배치 {summary.opsFunnel.batchSize} / 이월{" "}
          {summary.opsFunnel.maxBacklogDays}일.
        </div>
      ) : null}

      {summary?.opsFunnel ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "수집 확정률",
              `${(summary.opsFunnel.collectConfirmedRate * 100).toFixed(1)}%`,
            ],
            [
              "자동진단 완료율",
              `${(summary.opsFunnel.diagnosisCoverageRate * 100).toFixed(1)}%`,
            ],
            [
              "자동진단 누락률",
              `${(summary.opsFunnel.diagnosisMissingRate * 100).toFixed(1)}%`,
            ],
            [
              "제외율",
              `${(summary.opsFunnel.screenedRate * 100).toFixed(1)}%`,
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-700 bg-slate-900/50 p-3"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                {label}
              </p>
              <p className="mt-1 text-xl font-bold text-white">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {summary?.diagnosis ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [
                "대기",
                summary.diagnosis.queued,
                "border-sky-800/50 text-sky-100",
              ],
              [
                "진행",
                summary.diagnosis.running,
                "border-sky-800/50 text-sky-100",
              ],
              [
                "완료",
                summary.diagnosis.completed,
                "border-emerald-800/50 text-emerald-100",
              ],
              [
                "제한 진단",
                summary.diagnosis.limited,
                "border-amber-800/50 text-amber-100",
              ],
              [
                "실패",
                summary.diagnosis.failed,
                "border-rose-800/50 text-rose-100",
              ],
            ].map(([label, value, tone]) => (
              <div
                key={String(label)}
                className={`rounded-xl border bg-slate-900/50 p-3 ${String(tone).split(" ")[0]}`}
              >
                <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                  {label}
                </p>
                <p
                  className={`mt-1 text-xl font-bold ${String(tone).split(" ").slice(1).join(" ")}`}
                >
                  {Number(value).toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
          </section>
          {summary.diagnosis.today ? (
            <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                [
                  `오늘 시도(${summary.diagnosis.today.kstDate})`,
                  summary.diagnosis.today.attempted,
                  "border-violet-800/50 text-violet-100",
                ],
                [
                  "오늘 완료",
                  summary.diagnosis.today.completed,
                  "border-emerald-800/50 text-emerald-100",
                ],
                [
                  "오늘 제한",
                  summary.diagnosis.today.limited,
                  "border-amber-800/50 text-amber-100",
                ],
                [
                  "오늘 실패",
                  summary.diagnosis.today.failed,
                  "border-rose-800/50 text-rose-100",
                ],
                [
                  "오늘 남은 용량",
                  summary.diagnosis.today.remaining,
                  "border-cyan-800/50 text-cyan-100",
                ],
              ].map(([label, value, tone]) => (
                <div
                  key={String(label)}
                  className={`rounded-xl border bg-slate-900/50 p-3 ${String(tone).split(" ")[0]}`}
                >
                  <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                    {label}
                  </p>
                  <p
                    className={`mt-1 text-xl font-bold ${String(tone).split(" ").slice(1).join(" ")}`}
                  >
                    {Number(value).toLocaleString("ko-KR")}
                    {String(label).includes("남은")
                      ? ` / ${summary.diagnosis?.today?.dailyMax ?? summary.opsFunnel?.dailyLimit ?? 300}`
                      : ""}
                  </p>
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      {summary ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "실제 설문 확인율",
              `${(summary.verification.confirmedSurveyRate * 100).toFixed(1)}%`,
            ],
            [
              "invalid 비율",
              `${(summary.verification.invalidRate * 100).toFixed(1)}%`,
            ],
            [
              "플랫폼 합(전체)",
              `${summary.byPlatformAll.google_forms + summary.byPlatformAll.naver_form + summary.byPlatformAll.moaform}`,
            ],
            ["ignored", summary.verification.ignored],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-700 bg-slate-900/50 p-3"
            >
              <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                {label}
              </p>
              <p className="mt-1 text-xl font-bold text-white">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {summary ? (
        <p className="mb-4 text-[11px] text-slate-500">
          {summary.verification.accuracySampleNote} 플랫폼 카드(Google/Naver/Moa)
          기본값은 invalid·ignored 제외 집계이며, 위 「플랫폼 합(전체)」은 전체
          상태 기준입니다.
        </p>
      ) : null}

      {summary?.lastRun ? (
        <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
          <p>
            <span className="text-slate-400">마지막 수집:</span>{" "}
            {formatDate(summary.lastRun.started_at)} ·{" "}
            <span className="font-semibold text-teal-200">
              {summary.lastRun.trigger}
            </span>{" "}
            · 상태{" "}
            <span className="font-semibold text-teal-200">
              {summary.lastRun.status}
            </span>
            {" · "}
            <span className="font-semibold text-sky-200">
              {classifyCollectorRunSummary(summary.lastRun.error_summary).labelKo}
            </span>{" "}
            · API {summary.lastRunApiCalls} · 결과{" "}
            {summary.lastRun.results_count} · 후보{" "}
            {summary.lastRun.candidate_links_count} · 신규{" "}
            {summary.lastRun.new_surveys_count} / 재발견{" "}
            {summary.lastRun.duplicate_surveys_count} / 오류{" "}
            {summary.lastRun.error_count}
          </p>
          <p className="mt-2 text-xs text-slate-400">
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
            <p className="mt-2 text-xs text-amber-200/90">
              이 실행에는 검색어별 상세 통계(collection_query_stats)가 없습니다.
              migration 006 적용 이전 실행이거나 통계 저장에 실패했을 수 있습니다.
              새로 「수집 실행」하면 검색어 성과가 표시됩니다.
            </p>
          ) : null}
          {summary.lastRun.error_summary ? (
            <p className="mt-2 whitespace-pre-wrap text-xs text-rose-200/90">
              {classifyCollectorRunSummary(summary.lastRun.error_summary).kind ===
              "revalidate"
                ? "최근 재검증 요약"
                : "최근 실행 요약"}
              : {summary.lastRun.error_summary.slice(0, 600)}
            </p>
          ) : null}
        </section>
      ) : null}

      {summary && summary.lastRunHasQueryStats ? (
        <details className="mb-6 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            검색어별 성과 상세 (접기/펼치기)
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-teal-200">
                효율 상위 검색어
              </p>
              <ul className="space-y-2 text-xs text-slate-300">
                {summary.topQueries.map((q) => (
                  <li
                    key={`top-${q.searchQuery}`}
                    className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2"
                  >
                    <p className="font-medium text-white">{q.searchQuery}</p>
                    <p className="mt-1 text-slate-400">
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
              <p className="mb-2 text-xs font-semibold tracking-wide text-amber-200">
                효율 하위 / 중단 검토
              </p>
              <ul className="space-y-2 text-xs text-slate-300">
                {summary.bottomQueries.map((q) => (
                  <li
                    key={`bot-${q.searchQuery}`}
                    className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2"
                  >
                    <p className="font-medium text-white">{q.searchQuery}</p>
                    <p className="mt-1 text-slate-400">
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
            <table className="min-w-full text-left text-[11px] text-slate-300">
              <thead className="border-b border-slate-700 text-slate-400">
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
                    <td className="max-w-[14rem] truncate px-2 py-1.5 text-white">
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

      {summary?.improvementCandidates && summary.improvementCandidates.length > 0 ? (
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60">
          <div className="border-b border-slate-700 px-4 py-3">
            <p className="text-sm font-semibold text-white">개선안내 후보</p>
            <p className="mt-1 text-[11px] text-slate-400">
              위반 확정이 아닙니다. 위반 소지·개선 필요·확인 필요로만 표시하며 외부 발송은 하지 않습니다.
            </p>
          </div>
          <div className="divide-y divide-slate-800">
            {summary.improvementCandidates.map((row) => (
              <div key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded border border-teal-600/40 px-1.5 py-0.5 font-semibold text-teal-200">
                    {row.wording}
                  </span>
                  <span className="text-slate-400">우선 {row.priority}</span>
                  <span className="text-slate-400">
                    {row.publicPrivateType || "구분 없음"}
                  </span>
                  <span className="text-slate-400">{row.platform || "—"}</span>
                  {row.hasEvidence ? (
                    <span className="text-emerald-300">증빙 있음</span>
                  ) : (
                    <span className="text-slate-500">증빙 없음</span>
                  )}
                  <span className="text-slate-400">
                    검토 {row.reviewStatus || "—"}
                  </span>
                  {row.score != null ? (
                    <span className="text-slate-300">점수 {row.score}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-white">
                  {row.operatorName || "(기관명 없음)"} · {row.surveyTitle || "(제목 없음)"}
                </p>
                <p className="mt-1 break-all text-[11px] text-slate-400">
                  {row.surveyUrl || "—"}
                </p>
                <p className="mt-1 text-[11px] text-amber-100/90">
                  {[
                    row.hasPersonalInfo ? "개인정보" : null,
                    row.hasSensitiveInfo ? "민감정보" : null,
                    row.hasHighRiskInfo ? "고위험정보" : null,
                    row.riskLevel ? `위험도 ${row.riskLevel}` : null,
                    ...row.gapLabels,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <form
        onSubmit={applyFilters}
        className="mb-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 md:grid-cols-3 lg:grid-cols-4"
      >
        <label className="text-xs text-slate-400">
          플랫폼
          <select
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="google_forms">Google Forms</option>
            <option value="naver_form">Naver Form</option>
            <option value="moaform">Moaform</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          상태
          <select
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
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
        <label className="text-xs text-slate-400">
          최초 발견 시작일
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.firstDiscoveredFrom}
            onChange={(e) =>
              setForm({ ...form, firstDiscoveredFrom: e.target.value })
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          최초 발견 종료일
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.firstDiscoveredTo}
            onChange={(e) =>
              setForm({ ...form, firstDiscoveredTo: e.target.value })
            }
          />
        </label>
        <label className="text-xs text-slate-400">
          검색어(수집 질의)
          <input
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.searchQuery}
            onChange={(e) => setForm({ ...form, searchQuery: e.target.value })}
            placeholder="예: 만족도 조사"
          />
        </label>
        <label className="text-xs text-slate-400">
          신규/기존
          <select
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.novelty}
            onChange={(e) => setForm({ ...form, novelty: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="new">신규(발견 1회)</option>
            <option value="existing">기존(재발견)</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          출처 유형
          <select
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.sourceType}
            onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="web">웹문서</option>
            <option value="blog">블로그</option>
            <option value="cafe">카페</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          검증 큐 (A/B/C)
          <select
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.triageQueue || "all"}
            onChange={(e) => setForm({ ...form, triageQueue: e.target.value })}
          >
            <option value="all">전체</option>
            <option value="A_PRIORITY">A_PRIORITY</option>
            <option value="B_PRIORITY">B_PRIORITY</option>
            <option value="C_ARCHIVE">C_ARCHIVE</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          자동진단
          <select
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
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
        <label className="text-xs text-slate-400 md:col-span-2">
          제목/URL 검색
          <input
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-white"
            value={form.q}
            onChange={(e) => setForm({ ...form, q: e.target.value })}
            placeholder="키워드"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-500/20"
          >
            필터 적용
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60">
        <div className="border-b border-slate-700 px-4 py-3 text-sm font-semibold text-white">
          수집 설문 목록 ({items.length.toLocaleString("ko-KR")})
        </div>
        <div className="divide-y divide-slate-800">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              조건에 맞는 수집 설문이 없습니다.
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[11px] font-semibold text-slate-200">
                        {platformLabel(item.platform)}
                      </span>
                      {item.collect_lane ? (
                        <span className="rounded border border-sky-700/50 px-1.5 py-0.5 text-[11px] text-sky-200">
                          {item.collect_lane}
                        </span>
                      ) : null}
                      {item.auto_diagnosis_target ? (
                        <span className="rounded border border-teal-700/50 px-1.5 py-0.5 text-[11px] text-teal-200">
                          자동진단 대상
                        </span>
                      ) : null}
                      {item.triage_queue ? (
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                            item.triage_queue === "A_PRIORITY"
                              ? "border-emerald-500/50 text-emerald-200"
                              : item.triage_queue === "B_PRIORITY"
                                ? "border-amber-500/50 text-amber-200"
                                : "border-slate-500/50 text-slate-400"
                          }`}
                        >
                          {item.triage_queue}
                        </span>
                      ) : null}
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${
                          item.diagnosis_status === "completed"
                            ? "border-emerald-700/50 text-emerald-200"
                            : item.diagnosis_status === "limited"
                              ? "border-amber-700/50 text-amber-200"
                              : item.diagnosis_status === "failed" ||
                                  item.diagnosis_status === "failed_retryable" ||
                                  item.diagnosis_status === "failed_final"
                                ? "border-rose-700/50 text-rose-200"
                                : "border-sky-700/50 text-sky-200"
                        }`}
                      >
                        진단{" "}
                        {item.diagnosis_status === "completed"
                          ? "완료"
                          : item.diagnosis_status === "queued"
                            ? "대기"
                            : item.diagnosis_status === "running"
                              ? "중"
                              : item.diagnosis_status === "limited"
                                ? "제한"
                                : item.diagnosis_status === "failed" ||
                                    item.diagnosis_status ===
                                      "failed_retryable" ||
                                    item.diagnosis_status === "failed_final"
                                  ? "실패"
                                  : "미진단"}
                      </span>
                      {item.diagnosis_status === "completed" &&
                      (item.diagnosis_score != null || item.diagnosis_grade) ? (
                        <span className="text-[11px] text-slate-300">
                          점수 {item.diagnosis_score ?? "—"} /{" "}
                          {item.diagnosis_grade ?? "—"}
                        </span>
                      ) : null}
                      {item.diagnosis_status === "limited" ? (
                        <span className="text-[11px] text-amber-200/90">
                          제한 진단
                          {item.diagnosis_extractor
                            ? ` · ${item.diagnosis_extractor}`
                            : ""}
                        </span>
                      ) : null}
                      {item.diagnosis_job_id ? (
                        <Link
                          href={`/report/${item.diagnosis_job_id}`}
                          className="text-[11px] font-semibold text-teal-300 underline-offset-2 hover:underline"
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
                    <p className="mt-1 text-sm font-semibold text-white">
                      {item.title || "(제목 없음)"}
                    </p>
                    {item.freshness?.freshness_reason ||
                    item.status === "closed" ||
                    item.status === "stale" ||
                    item.status === "restricted" ? (
                      <p className="mt-1 text-[11px] text-amber-200/90">
                        제외 사유:{" "}
                        {item.freshness?.freshness_reason ||
                          (item.status === "closed"
                            ? "응답 종료 문구 감지"
                            : item.status === "restricted"
                              ? "접근 권한 필요"
                              : item.status === "stale"
                                ? "과거 설문으로 판단되어 진단 제외"
                                : "")}
                      </p>
                    ) : null}
                    <a
                      href={item.canonical_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-teal-300 hover:underline"
                    >
                      {item.canonical_url}
                    </a>
                    <p className="mt-1 text-[11px] text-slate-500">
                      최초 {formatDate(item.first_discovered_at)} · 최근{" "}
                      {formatDate(item.last_discovered_at)}
                    </p>
                    {item.sample_source_url ? (
                      <a
                        href={item.sample_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-[11px] text-slate-400 hover:text-teal-200 hover:underline"
                      >
                        원문: {item.sample_source_title || item.sample_source_url}
                      </a>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSources(item.id)}
                    className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    {expandedId === item.id ? "출처 닫기" : "출처 보기"}
                  </button>
                </div>
                {expandedId === item.id ? (
                  <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                    {sourcesLoading === item.id ? (
                      <p className="text-xs text-slate-400">불러오는 중…</p>
                    ) : (sourcesById[item.id] || []).length === 0 ? (
                      <p className="text-xs text-slate-400">출처가 없습니다.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(sourcesById[item.id] || []).map((source) => (
                          <li key={source.id} className="text-xs text-slate-300">
                            <span className="mr-2 rounded border border-slate-700 px-1 text-[10px] text-slate-400">
                              {source.source_type}
                            </span>
                            <a
                              href={source.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-300 hover:underline"
                            >
                              {source.source_title || source.source_url}
                            </a>
                            {source.search_query ? (
                              <span className="ml-2 text-slate-500">
                                · {source.search_query}
                              </span>
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
