"use client";

import { useMemo, useState } from "react";
import { WeeklyTrendChart } from "@/components/weekly/WeeklyCharts";
import {
  WEEKLY_PRIVACY_GRADE_BANDS,
  WEEKLY_PRIVACY_INDEX_FORMULA,
  formatScore1,
  monthlyPrivacyIndexSeries,
  weeklyPrivacyGrade,
  weeklyPrivacyIndexSeries,
  type PrivacyIndexTrendRow,
} from "@/lib/weekly/privacyIndex";

type Period = "weekly" | "monthly";

function gradeClass(grade: string | null): string {
  if (grade === "양호") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (grade === "보통") return "border-sky-200 bg-sky-50 text-sky-800";
  if (grade === "주의") return "border-amber-200 bg-amber-50 text-amber-900";
  if (grade === "위험") return "border-orange-200 bg-orange-50 text-orange-900";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function PrivacyIndexGuide() {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 md:px-5">
        <h3 className="text-sm font-bold text-slate-900">
          {WEEKLY_PRIVACY_INDEX_FORMULA.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {WEEKLY_PRIVACY_INDEX_FORMULA.intro}
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
          {WEEKLY_PRIVACY_INDEX_FORMULA.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 md:px-5">
        <h3 className="text-sm font-bold text-slate-900">점수대별 의미</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          등급은 자동진단 기반 참고 구간입니다.
        </p>
        <ul className="mt-3 space-y-2.5">
          {WEEKLY_PRIVACY_GRADE_BANDS.map((band) => (
            <li key={band.grade} className="flex gap-3">
              <span
                className={`mt-0.5 inline-flex h-fit shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gradeClass(band.grade)}`}
              >
                {band.grade} {band.range}
              </span>
              <p className="text-sm leading-relaxed text-slate-600">{band.meaning}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PrivacyIndexTrendPanel({
  rows,
  showFormula = true,
  currentWeekId,
}: {
  rows: PrivacyIndexTrendRow[];
  showFormula?: boolean;
  currentWeekId?: string;
}) {
  const [period, setPeriod] = useState<Period>("weekly");
  const weeklyPoints = useMemo(() => weeklyPrivacyIndexSeries(rows), [rows]);
  const monthlyPoints = useMemo(() => monthlyPrivacyIndexSeries(rows), [rows]);
  const points = period === "weekly" ? weeklyPoints : monthlyPoints;
  const latest = [...points].reverse().find((point) => point.value != null) || null;
  const currentWeekly = currentWeekId
    ? weeklyPoints.find((point) => point.id === currentWeekId)
    : null;
  const currentMonthly =
    currentWeekId && currentWeekly
      ? monthlyPoints.find((point) => currentWeekId.startsWith(point.id))
      : null;
  const featured =
    period === "weekly" ? currentWeekly || latest : currentMonthly || latest;
  const featuredLabel =
    period === "weekly"
      ? currentWeekly
        ? "이 주간"
        : "최근 주간"
      : currentMonthly
        ? "이 월간"
        : "최근 월간";
  const grade = weeklyPrivacyGrade(featured?.value ?? null);

  return (
    <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-[0_8px_30px_rgba(15,118,110,0.06)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            핵심 지표 · 자동진단 기반 참고 지표
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">
            개인정보 보호 수준지수 추세
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            공개 설문 화면 기준 자동진단 결과를 주간·월간으로 요약한 참고
            지표입니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {featured?.value != null ? (
            <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-right">
              <p className="text-[11px] text-teal-800">{featuredLabel}</p>
              <p className="text-lg font-bold tabular-nums text-teal-950">
                {formatScore1(featured.value)}
                {grade ? ` · ${grade}` : ""}
              </p>
            </div>
          ) : null}
          <div
            className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label="추세 기간 선택"
          >
            {(
              [
                ["weekly", "주간"],
                ["monthly", "월간"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriod(id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  period === id
                    ? "bg-teal-800 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-2 py-2 md:px-3 md:py-3">
        <WeeklyTrendChart
          key={period}
          title=""
          points={points}
          valueSuffix="점"
          variant="hero"
          showGradeBands
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {period === "weekly"
          ? "주간 선택 시 주차 시작일(월요일) 기준 주차별 지수를 표시합니다."
          : "월간 선택 시 해당 월에 시작하는 주차를 분석 건수로 가중 평균합니다."}
      </p>
      {showFormula ? <PrivacyIndexGuide /> : null}
    </section>
  );
}
