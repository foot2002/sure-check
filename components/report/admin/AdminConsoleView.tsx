"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AdminCaseListPayload } from "@/lib/report/adminCases";

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
  q: string;
};

function riskBadge(level: string) {
  const map: Record<string, string> = {
    critical: "bg-rose-500/20 text-rose-200 border-rose-500/40",
    high: "bg-orange-500/20 text-orange-200 border-orange-500/40",
    limited: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    medium: "bg-amber-500/20 text-amber-100 border-amber-500/40",
    low: "bg-emerald-500/20 text-emerald-100 border-emerald-500/40",
    unknown: "bg-slate-600/30 text-slate-300 border-slate-500/30",
  };
  return map[level] || map.unknown;
}

function statusBadgeClass() {
  return "rounded border px-1.5 py-0.5 text-[11px] font-semibold";
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
  const [form, setForm] = useState(filters);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (!value || value === "all") continue;
      if (key === "range" && value === "7d") continue;
      params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/report/admin?${qs}` : "/report/admin");
  }

  async function logout() {
    await fetch("/api/report/admin/logout", { method: "POST" });
    router.replace("/report/admin/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-300">
            Admin Console
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">
            SURE Check 관리자 리포트
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            자동진단 결과를 검토하고, 증거자료와 공개 여부를 관리합니다. 위반을
            확정하지 않으며 ‘위반 소지 / 미흡 / 확인 필요’로 해석합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/report/admin/collector"
            className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-100 hover:bg-teal-500/20"
          >
            수집함
          </Link>
          <Link
            href="/report"
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            공개 /report
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            로그아웃
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {data ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            ["전체 진단 건수", data.kpi.totalScans],
            ["검토 대기 건수", data.kpi.reviewPendingCount],
            ["고위험/신고 검토", data.kpi.highOrReportReviewCount],
            ["공공부문 확인 필요", data.kpi.publicSectorReviewCount],
            ["증빙 캡처 확보", data.kpi.evidenceCaptureCount],
            ["공개 후보 건수", data.kpi.publicationCandidateCount],
            [
              "제한 합계(참고)",
              data.kpi.limitedAnalysisCount,
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
                {Number(value).toLocaleString("ko-KR")}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {data?.kpi?.outcomeBuckets ? (
        <section className="mb-6">
          <p className="mb-2 text-xs text-slate-400">
            진단 결과 구분 — 응답 종료·접근 제한은 문항 추출 실패로 보지 않습니다.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["정상 진단", data.kpi.outcomeBuckets.normalDiagnosis, "text-emerald-100"],
              ["응답 종료", data.kpi.outcomeBuckets.surveyClosed, "text-slate-100"],
              [
                "접근 제한/로그인",
                data.kpi.outcomeBuckets.accessRestricted,
                "text-amber-100",
              ],
              [
                "문항 추출 제한",
                data.kpi.outcomeBuckets.extractionLimited,
                "text-orange-100",
              ],
              ["시스템 실패", data.kpi.outcomeBuckets.systemFailure, "text-rose-100"],
            ].map(([label, value, tone]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-700 bg-slate-900/70 p-3"
              >
                <p className="text-[11px] font-semibold tracking-wide text-slate-400">
                  {label}
                </p>
                <p className={`mt-1 text-2xl font-bold ${String(tone)}`}>
                  {Number(value).toLocaleString("ko-KR")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data?.queue ? (
        <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold text-white">작업 큐 상태</h2>
          <p className="mt-1 text-xs text-slate-400">
            대기/실행 중인 진단·캡처 작업 요약입니다.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["대기 중 진단", data.queue.scanPending],
              ["실행 중 진단", data.queue.scanRunning],
              ["실패 진단", data.queue.scanFailed],
              ["제한 진단", data.queue.scanLimited],
              ["대기 중 캡처", data.queue.capturePending],
              ["실행 중 캡처", data.queue.captureRunning],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-3 py-2"
              >
                <p className="text-[11px] text-slate-400">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-teal-200">
                  {Number(value).toLocaleString("ko-KR")}
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
        {[
          {
            key: "range",
            label: "기간",
            options: [
              ["today", "오늘"],
              ["7d", "최근 7일"],
              ["30d", "최근 30일"],
              ["all", "전체"],
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
            key: "reviewStatus",
            label: "검토상태",
            options: [
              ["all", "전체"],
              ["none", "none"],
              ["pending", "pending"],
              ["in_review", "in_review"],
              ["resolved", "resolved"],
              ["dismissed", "dismissed"],
            ],
          },
          {
            key: "publicationStatus",
            label: "공개상태",
            options: [
              ["all", "전체"],
              ["private", "private"],
              ["aggregate_only", "aggregate_only"],
              ["public_anonymized", "public_anonymized"],
              ["public_named", "public_named"],
              ["archived", "archived"],
            ],
          },
          {
            key: "platform",
            label: "플랫폼",
            options: [
              ["all", "전체"],
              ["google_forms", "Google Forms"],
              ["naver_form", "Naver Form"],
              ["moaform", "Moaform"],
              ["generic", "Generic"],
              ["wiseon_csap", "WiseON"],
              ["unknown", "Unknown"],
            ],
          },
          {
            key: "publicPrivate",
            label: "공공/민간",
            options: [
              ["all", "전체"],
              ["public", "public"],
              ["private", "private"],
              ["mixed", "mixed"],
              ["unknown", "unknown"],
            ],
          },
          {
            key: "hasPersonalInfo",
            label: "개인정보",
            options: [
              ["all", "전체"],
              ["true", "포함"],
              ["false", "미포함"],
            ],
          },
          {
            key: "hasSensitiveInfo",
            label: "민감정보",
            options: [
              ["all", "전체"],
              ["true", "포함"],
              ["false", "미포함"],
            ],
          },
          {
            key: "hasHighRiskInfo",
            label: "고위험정보",
            options: [
              ["all", "전체"],
              ["true", "포함"],
              ["false", "미포함"],
            ],
          },
          {
            key: "hasEvidence",
            label: "증거",
            options: [
              ["all", "전체"],
              ["true", "있음"],
              ["false", "없음"],
            ],
          },
          {
            key: "limitedOnly",
            label: "제한 진단(종료·접근·추출·시스템)",
            options: [
              ["all", "전체"],
              ["true", "제한만"],
            ],
          },
        ].map((field) => (
          <label key={field.key} className="text-xs text-slate-400">
            {field.label}
            <select
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-100"
              value={form[field.key as keyof Filters]}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
            >
              {field.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-xs text-slate-400 md:col-span-2">
          검색어
          <input
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={form.q}
            onChange={(e) => setForm((prev) => ({ ...prev, q: e.target.value }))}
            placeholder="기관명 / 제목 / URL / 판단"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-500"
          >
            필터 적용
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/50">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              {[
                "진단일",
                "위험도",
                "점수",
                "응답 판단",
                "플랫폼",
                "기관/기업명",
                "유형",
                "설문 제목",
                "개인/민감/고위험",
                "공공",
                "증거",
                "검토",
                "공개",
                "상세",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.cases || []).map((row) => (
              <tr key={row.id} className="border-b border-slate-800/80">
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {row.observedDateKst}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${riskBadge(row.overallRiskLevel)}`}
                  >
                    {row.overallRiskLevel}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-slate-200">
                  {row.score == null ? "—" : row.score.toFixed(1)}
                </td>
                <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-200">
                  {row.userDecisionLabel || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {row.platform}
                </td>
                <td className="max-w-[9rem] truncate px-3 py-2.5 text-slate-200">
                  {row.operatorName || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
                  {row.subjectType || "—"}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2.5 text-slate-200">
                  {row.surveyTitle || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {row.hasPersonalInfo ? "P" : "-"}/
                  {row.hasSensitiveInfo ? "S" : "-"}/
                  {row.hasHighRiskInfo ? "H" : "-"}
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {row.publicPrivateType}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-slate-200">
                  {row.evidenceCount}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`${statusBadgeClass()} border-slate-600 text-slate-200`}>
                    {row.reviewStatus}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`${statusBadgeClass()} border-slate-600 text-slate-200`}>
                    {row.publicationStatus}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/report/admin/cases/${row.id}`}
                    className="rounded bg-teal-700/80 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-600"
                  >
                    상세보기
                  </Link>
                </td>
              </tr>
            ))}
            {data && data.cases.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-slate-400">
                  조건에 맞는 케이스가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
