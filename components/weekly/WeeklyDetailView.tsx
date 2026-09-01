import Link from "next/link";
import { WeeklyBarList, WeeklyTrendChart } from "@/components/weekly/WeeklyCharts";
import { PrivacyIndexTrendPanel } from "@/components/weekly/PrivacyIndexTrendPanel";
import { WeeklyPressCopy } from "@/components/weekly/WeeklyPressCopy";
import { formatScore1, roundScore1 } from "@/lib/weekly/privacyIndex";
import type { WeeklyListCard, WeeklyReportSnapshot } from "@/lib/weekly/types";
import { isCompletedReportWeek } from "@/lib/weekly/week";

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null) return "-";
  return `${n.toLocaleString("ko-KR")}${suffix}`;
}

function deltaText(delta: number | null): string {
  const rounded = roundScore1(delta);
  if (rounded == null) return "전주 대비 비교 불가";
  if (rounded === 0) return "전주 대비 변동 없음";
  return rounded > 0
    ? `전주 대비 +${rounded.toFixed(1)}점`
    : `전주 대비 ${rounded.toFixed(1)}점`;
}

function gradeClass(grade: string | null): string {
  if (grade === "양호") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (grade === "보통") return "border-sky-200 bg-sky-50 text-sky-900";
  if (grade === "주의") return "border-amber-200 bg-amber-50 text-amber-950";
  if (grade === "위험") return "border-orange-200 bg-orange-50 text-orange-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function WeeklyDetailView({
  snapshot,
  trendCards,
}: {
  snapshot: WeeklyReportSnapshot;
  trendCards?: WeeklyListCard[];
}) {
  const m = snapshot.metrics;
  const keepTrend = (weekId: string) =>
    weekId === snapshot.weekId || isCompletedReportWeek(weekId);
  const trendRows = (
    trendCards && trendCards.length > 0
      ? trendCards.map((card) => ({
          weekId: card.weekId,
          shortRange: card.shortRange,
          avgScore: card.avgScore,
          analyzableCount: card.analyzableCount,
        }))
      : snapshot.trends.map((row) => ({
          weekId: row.weekId,
          shortRange: row.shortRange,
          avgScore: row.avgScore,
          analyzableCount: row.analyzableCount,
        }))
  ).filter((row) => keepTrend(row.weekId));
  const trendShort = snapshot.trends
    .filter((row) => keepTrend(row.weekId))
    .map((row) => ({
      label: row.shortRange,
      pii: row.personalInfoRate,
      attention: row.attentionNeededRate,
    }));

  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-semibold tracking-wide text-teal-800">
          {snapshot.weekLabel}
          {snapshot.isPartial ? " · 부분 주간" : ""}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">
          {snapshot.summary.headline}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
          {snapshot.summary.oneLiner}
        </p>
      </header>

      <section className={`rounded-2xl border px-5 py-5 md:px-6 ${gradeClass(m.grade)}`}>
        <p className="text-xs font-semibold">이번 주 온라인 수집 개인정보 보호 수준지수</p>
        <p className="mt-2 text-3xl font-bold">
          {formatScore1(m.avgScore)}
          {m.grade ? ` · ${m.grade}` : ""}
        </p>
        <p className="mt-2 text-sm">
          {deltaText(snapshot.summary.scoreDelta)} · 4주 평균{" "}
          {formatScore1(snapshot.summary.fourWeekAvgScore)}
        </p>
        <p className="mt-3 text-xs leading-relaxed opacity-80">
          본 지수는 공개 설문 화면 기준 자동진단 결과를 바탕으로 산출한 참고
          지표이며, 개별 설문의 위법 여부를 확정하는 기준은 아닙니다.
        </p>
      </section>

      <PrivacyIndexTrendPanel rows={trendRows} currentWeekId={snapshot.weekId} />

      <section>
        <h2 className="text-xl font-bold text-slate-900">핵심 통계</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["분석 완료 설문 수", fmt(m.analyzableCount, "건"), "이번 주 분석 가능한 진단 완료 설문입니다."],
            ["개인정보 포함", `${fmt(m.personalInfoCount, "건")} / ${m.personalInfoRate}%`, "이름, 연락처, 이메일, 소속 등 개인정보 입력이 요구된 설문입니다."],
            ["민감정보 포함", `${fmt(m.sensitiveInfoCount, "건")} / ${m.sensitiveInfoRate}%`, "건강 등 민감정보로 볼 수 있는 문항이 확인된 설문입니다."],
            ["고위험정보 포함", `${fmt(m.highRiskInfoCount, "건")} / ${m.highRiskInfoRate}%`, "주민등록번호 등 고위험정보 신호가 확인된 설문입니다."],
            ["주의 필요", `${fmt(m.attentionNeededCount, "건")} / ${m.attentionNeededRate}%`, "응답자 관점에서 주의 또는 추가 확인이 필요한 설문입니다."],
            ["평균 개인정보 보호 점수", formatScore1(m.avgScore), "자동진단 점수 평균입니다."],
            ["공공부문 외부도구 확인 필요", fmt(m.publicExternalToolCount, "건"), "공공부문 설문이 외부 도구로 운영되어 확인이 필요한 건수입니다."],
            ["증빙 캡처 확보", fmt(m.evidenceCaptureCount, "건"), "운영 검토용 화면 캡처가 확보된 건수입니다. 원본은 공개하지 않습니다."],
          ].map(([title, value, hint]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{title}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">추세</h2>
        <p className="mt-1 text-sm text-slate-500">
          최근 {snapshot.trends.length}주 · 출처: 주간 리포트 스냅샷
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <WeeklyTrendChart
              title="개인정보 포함 비율"
              points={trendShort.map((row) => ({ label: row.label, value: row.pii }))}
              valueSuffix="%"
              variant="compact"
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <WeeklyTrendChart
              title="주의 필요 설문 비율"
              points={trendShort.map((row) => ({ label: row.label, value: row.attention }))}
              valueSuffix="%"
              variant="compact"
            />
          </div>
        </div>
      </section>

      {snapshot.issueTop5.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-900">자주 발견된 미흡·확인 필요 항목 TOP 5</h2>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <WeeklyBarList
              items={snapshot.issueTop5.map((row) => ({
                label: row.label,
                value: row.affectedSurveyCount,
                meta: `${row.affectedSurveyCount}건`,
              }))}
            />
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              {snapshot.issueTop5.map((row) => (
                <li key={row.label}>
                  <span className="font-semibold text-slate-800">{row.label}</span>
                  {" — "}
                  {row.description}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-slate-900">플랫폼별 분석</h2>
        <p className="mt-2 text-sm text-slate-600">
          플랫폼 자체의 위법성을 의미하는 것이 아니라, 해당 플랫폼으로 운영된
          공개 설문 화면에서 확인된 고지·안내 상태를 집계한 결과입니다.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">플랫폼</th>
                <th className="px-4 py-3">건수</th>
                <th className="px-4 py-3">개인정보</th>
                <th className="px-4 py-3">민감정보</th>
                <th className="px-4 py-3">고위험</th>
                <th className="px-4 py-3">주의 필요</th>
                <th className="px-4 py-3">평균 점수</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.platformStats.map((row) => (
                <tr key={row.platform} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{row.platform}</td>
                  <td className="px-4 py-3">{row.surveyCount}</td>
                  <td className="px-4 py-3">{row.personalInfoRate}%</td>
                  <td className="px-4 py-3">{row.sensitiveInfoRate}%</td>
                  <td className="px-4 py-3">{row.highRiskInfoRate}%</td>
                  <td className="px-4 py-3">{row.attentionNeededRate}%</td>
                  <td className="px-4 py-3">{formatScore1(row.avgOverallScore, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {snapshot.issueTop5[0] ? (
          <p className="mt-3 text-sm text-slate-600">
            이번 주 자주 확인된 미흡 항목: {snapshot.issueTop5[0].label} (
            {snapshot.issueTop5[0].affectedSurveyCount}건)
          </p>
        ) : null}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <WeeklyBarList
            items={snapshot.platformStats.map((row) => ({
              label: row.platform,
              value: row.surveyCount,
              meta: `${row.surveyCount}건`,
            }))}
            emphasizeLast={false}
          />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">기관유형별 분석</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {snapshot.organizationStats.map((row) => (
            <article
              key={row.typeLabel}
              className={`rounded-2xl border bg-white p-4 ${
                row.typeLabel === "공공기관" || row.typeLabel === "학교/교육기관"
                  ? "border-teal-200"
                  : "border-slate-200"
              }`}
            >
              <h3 className="font-bold text-slate-900">{row.typeLabel}</h3>
              <p className="mt-2 text-sm text-slate-600">
                {row.surveyCount}건 · 개인정보 {row.personalInfoRate}% · 주의 필요{" "}
                {row.attentionNeededRate}% · 평균 {formatScore1(row.avgOverallScore)}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <WeeklyBarList
            items={snapshot.organizationStats.map((row) => ({
              label: row.typeLabel,
              value: row.surveyCount,
              meta: `${row.surveyCount}건`,
            }))}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-teal-100 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-slate-900">공공부문 특별 분석</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          {snapshot.publicSector.narrative ||
            "이번 주 공공부문 분석 대상이 충분하지 않습니다."}
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>공공부문 개인정보 수집 설문 {snapshot.publicSector.publicPersonalInfoSurveyCount}건</div>
          <div>외부 설문도구 확인 필요 {snapshot.publicSector.externalToolReviewCount}건</div>
          <div>클라우드 보안 확인 필요 {snapshot.publicSector.csapOrCloudReviewCount}건</div>
          <div>수집 목적 안내 미흡 {snapshot.publicSector.purposeGapCount}건</div>
          <div>수집 항목 안내 미흡 {snapshot.publicSector.itemsGapCount}건</div>
          <div>보유기간 안내 미흡 {snapshot.publicSector.retentionGapCount}건</div>
          <div>파기 기준 안내 미흡 {snapshot.publicSector.destructionGapCount}건</div>
          <div>담당자 연락처 미흡 {snapshot.publicSector.contactGapCount}건</div>
        </dl>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">문항 기준 개인정보 수집 현황</h2>
        <p className="mt-2 text-sm text-slate-600">
          문항 원문은 공개하지 않으며, 카테고리 집계만 표시합니다.
        </p>
        <p className="mt-3 text-sm text-slate-700">
          전체 분석 문항 {fmt(snapshot.questionStats.totalQuestions)} · 개인정보 문항{" "}
          {fmt(snapshot.questionStats.personalInfoQuestions)} (
          {snapshot.questionStats.personalInfoQuestionRate}%) · 민감정보{" "}
          {fmt(snapshot.questionStats.sensitiveQuestions)} · 고위험{" "}
          {fmt(snapshot.questionStats.highRiskQuestions)}
        </p>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <WeeklyBarList
            items={snapshot.questionStats.frequentCategories.map((row) => ({
              label: row.label,
              value: row.count,
              meta: `${row.count}건`,
            }))}
          />
        </div>
      </section>

      {snapshot.anonymousCases.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-900">대표 개인정보 위험 사례</h2>
          <p className="mt-2 text-sm text-slate-600">
            실제 기관명, 설문 제목, URL, 캡처, 문항 원문은 공개하지 않습니다.
          </p>
          <div className="mt-4 space-y-4">
            {snapshot.anonymousCases.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {item.orgType} · {item.surveyPattern} · {item.tool}
                </p>
                <p className="mt-3 text-sm text-slate-700">
                  수집 정보: {item.collectedInfo.join(", ")}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  확인 필요 항목: {item.noticeGaps.join(", ")}
                </p>
                <p className="mt-2 text-sm text-slate-700">{item.respondentRisk}</p>
                <p className="mt-1 text-sm text-slate-700">{item.operatorFix}</p>
                <p className="mt-3 text-xs font-semibold text-teal-800">
                  이번 주 유사 신호 {item.similarCount}건
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-slate-900">정책적 인사이트</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700">
          {snapshot.insights.map((item) => (
            <li key={item.order}>{item.text}</li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-slate-900">기관·기업 개선 체크리스트</h2>
        <p className="mt-2 text-sm text-slate-600">
          개인정보를 수집하는 설문 운영자는 아래 항목을 확인해야 합니다.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-800">
          {snapshot.checklist.map((item) => (
            <li key={item}>□ {item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">보도·공유용 요약</h2>
        <div className="mt-4">
          <WeeklyPressCopy text={snapshot.pressSummary} />
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-relaxed text-amber-950">
        <h2 className="text-base font-bold">진단 신뢰도 및 한계</h2>
        <p className="mt-3">
          분석 완료 {snapshot.quality.completedDiagnosisCount}건 · 문항 분석 제한{" "}
          {snapshot.quality.limitedQuestionAnalysisCount}건 · 종료 설문 제외{" "}
          {snapshot.quality.closedExcludedCount}건 · 접근제한 제외{" "}
          {snapshot.quality.restrictedExcludedCount}건 · 증빙 캡처 확보{" "}
          {snapshot.quality.evidenceCaptureCount}건
        </p>
        <p className="mt-3">{snapshot.disclaimer}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/weekly"
          className="inline-flex rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
        >
          목록보기
        </Link>
        <Link
          href="/report"
          className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-teal-300 hover:bg-teal-50"
        >
          수집실태 리포트 보기
        </Link>
      </div>
    </div>
  );
}
