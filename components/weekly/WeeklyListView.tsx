"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PrivacyIndexTrendPanel } from "@/components/weekly/PrivacyIndexTrendPanel";
import { formatScore1 } from "@/lib/weekly/privacyIndex";
import type { WeeklyAnonymousCase, WeeklyListCard } from "@/lib/weekly/types";

const FILTERS = [
  { id: "all", label: "전체" },
  { id: "recent4", label: "최근 4주" },
  { id: "public", label: "공공부문 이슈" },
  { id: "school", label: "학교·교육기관 이슈" },
  { id: "notice", label: "개인정보 고지 미흡" },
  { id: "tool", label: "외부도구 확인 필요" },
] as const;

const SORTS = [
  { id: "recent", label: "최신순" },
  { id: "score", label: "개인정보 보호 수준지수 낮은순" },
  { id: "attention", label: "주의 필요 비율 높은순" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type SortId = (typeof SORTS)[number]["id"];

function gradeClass(grade: string | null): string {
  if (grade === "양호") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (grade === "보통") return "border-sky-200 bg-sky-50 text-sky-800";
  if (grade === "주의") return "border-amber-200 bg-amber-50 text-amber-900";
  if (grade === "위험") return "border-orange-200 bg-orange-50 text-orange-900";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function WeeklyListView({
  cards,
  cases,
}: {
  cards: WeeklyListCard[];
  cases: WeeklyAnonymousCase[];
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("recent");
  const latest = cards[0] || null;

  const filtered = useMemo(() => {
    let rows = [...cards];
    if (filter === "recent4") rows = rows.slice(0, 4);
    if (filter === "public") {
      rows = rows.filter((row) => row.hasPublicIssue);
    }
    if (filter === "school") {
      rows = rows.filter((row) => row.hasSchoolIssue);
    }
    if (filter === "notice") {
      rows = rows.filter((row) => row.hasNoticeGap);
    }
    if (filter === "tool") {
      rows = rows.filter((row) => row.publicExternalToolCount > 0);
    }
    if (sort === "score") {
      rows.sort((a, b) => (a.avgScore ?? 999) - (b.avgScore ?? 999));
    } else if (sort === "attention") {
      rows.sort((a, b) => b.attentionNeededRate - a.attentionNeededRate);
    } else {
      rows.sort((a, b) => b.weekId.localeCompare(a.weekId));
    }
    return rows;
  }, [cards, filter, sort]);

  return (
    <div className="space-y-10">
      {cards.length > 0 ? (
        <PrivacyIndexTrendPanel
          rows={cards.map((card) => ({
            weekId: card.weekId,
            shortRange: card.shortRange,
            avgScore: card.avgScore,
            analyzableCount: card.analyzableCount,
          }))}
        />
      ) : null}

      {latest ? (
        <section className="overflow-hidden rounded-2xl border border-teal-100 bg-white">
          <div className="bg-teal-800 px-5 py-3 text-sm font-semibold text-white md:px-8">
            최신 주간 리포트
          </div>
          <div className="grid gap-6 px-5 py-6 md:grid-cols-[1.4fr_1fr] md:px-8 md:py-8">
            <div>
              <p className="text-xs font-semibold tracking-wide text-teal-800">
                {latest.weekLabel}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                {latest.headline}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                분석 완료 {latest.analyzableCount.toLocaleString("ko-KR")}건 · 개인정보 포함{" "}
                {latest.personalInfoCount.toLocaleString("ko-KR")}건 (
                {latest.personalInfoRate}%) · 주의 필요{" "}
                {latest.attentionNeededCount.toLocaleString("ko-KR")}건 (
                {latest.attentionNeededRate}%) · 개인정보 보호 수준지수{" "}
                {formatScore1(latest.avgScore)}
                {latest.grade ? ` · ${latest.grade}` : ""} · 공공부문 외부도구 확인
                필요 {latest.publicExternalToolCount.toLocaleString("ko-KR")}건
              </p>
              <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-slate-600">
                {latest.bullets.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Link
                href={`/weekly/${latest.weekId}`}
                className="mt-5 inline-flex rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
              >
                이번 주 리포트 보기
              </Link>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["분석 완료", `${latest.analyzableCount.toLocaleString("ko-KR")}건`],
                [
                  "개인정보 포함",
                  `${latest.personalInfoCount.toLocaleString("ko-KR")}건 / ${latest.personalInfoRate}%`,
                ],
                [
                  "주의 필요",
                  `${latest.attentionNeededCount.toLocaleString("ko-KR")}건 / ${latest.attentionNeededRate}%`,
                ],
                ["보호 수준지수", formatScore1(latest.avgScore)],
                [
                  "공공부문 확인 필요",
                  `${latest.publicExternalToolCount.toLocaleString("ko-KR")}건`,
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600">
          아직 공개된 주간 리포트가 없습니다.
        </p>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">주간 리포트 목록</h2>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                filter === item.id
                  ? "border-teal-800 bg-teal-800 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((card) => (
            <article
              key={card.weekId}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-teal-800">{card.weekLabel}</p>
                {card.isPartial ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">
                    부분 주간
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 text-base font-bold leading-snug text-slate-900">
                {card.headline}
              </h3>
              <p className="mt-3 text-sm text-slate-600">
                개인정보 보호 수준지수 {formatScore1(card.avgScore)}
                {card.grade ? ` · ${card.grade}` : ""}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                분석 완료 {card.analyzableCount.toLocaleString("ko-KR")}건 · 개인정보
                포함 {card.personalInfoCount.toLocaleString("ko-KR")}건 (
                {card.personalInfoRate}%) · 주의 필요{" "}
                {card.attentionNeededCount.toLocaleString("ko-KR")}건 (
                {card.attentionNeededRate}%) · 공공부문 확인 필요{" "}
                {card.publicExternalToolCount.toLocaleString("ko-KR")}건
              </p>
              <span
                className={`mt-3 inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${gradeClass(card.grade)}`}
              >
                {card.grade || "지수 없음"}
              </span>
              <Link
                href={`/weekly/${card.weekId}`}
                className="mt-4 text-sm font-semibold text-teal-800 hover:underline"
              >
                상세 리포트 보기
              </Link>
            </article>
          ))}
        </div>
      </section>

      {cases.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-900">대표 개인정보 위험 사례</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            개별 기관명, 설문 제목, URL, 캡처는 공개하지 않습니다. 반복되는 위험
            유형을 익명화해 보여줍니다.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {cases.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  주로 수집되는 정보: {item.collectedInfo.join(", ")}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  자주 확인되는 문제: {item.noticeGaps.join(", ")}
                </p>
                <p className="mt-2 text-sm text-slate-700">{item.respondentRisk}</p>
                <p className="mt-1 text-sm text-slate-700">{item.operatorFix}</p>
                <p className="mt-3 text-xs font-semibold text-teal-800">
                  최근 주간 유사 신호 {item.similarCount}건
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-teal-100 bg-white p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">운영자 개선 체크리스트 요약</h2>
        <p className="mt-2 text-sm text-slate-600">
          수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처를 설문 첫
          화면에 안내하는 것이 기본입니다.
        </p>
        <Link
          href="/report"
          className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-teal-300 hover:bg-teal-50"
        >
          수집실태 리포트 바로가기
        </Link>
      </section>
    </div>
  );
}
