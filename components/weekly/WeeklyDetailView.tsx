import Link from "next/link";
import { WeeklyBarList } from "@/components/weekly/WeeklyCharts";
import { PrivacyIndexTrendPanel } from "@/components/weekly/PrivacyIndexTrendPanel";
import { WeeklyPressCopy } from "@/components/weekly/WeeklyPressCopy";
import {
  WeeklyGroupCards,
  WeeklyGroupInsightCards,
  WeeklyKeyFindings,
  WeeklyKeyNumberStrip,
  WeeklyPressBox,
  WeeklyPublicSectorBlock,
  WeeklyRiskCaseCard,
  WeeklySampleBadge,
  WeeklyTopDisclaimer,
} from "@/components/weekly/WeeklyEditorial";
import {
  WEEKLY_CHECKLIST,
  WEEKLY_DISCLAIMER,
  WEEKLY_PLATFORM_CAVEAT,
  WEEKLY_RESPONDENT_TIPS,
  buildKeyFindings,
  formatWeeklyCount,
} from "@/lib/weekly/copy";
import { formatScore1, fourWeekWeightedPrivacyAverage, roundScore1 } from "@/lib/weekly/privacyIndex";
import {
  groupInsightCards,
  hydrateOrgRows,
  hydratePlatformRows,
} from "@/lib/weekly/present";
import type { WeeklyListCard, WeeklyReportSnapshot } from "@/lib/weekly/types";
import { isCompletedReportWeek } from "@/lib/weekly/week";
import { enrichAnonymousCase } from "@/lib/weekly/anonymousCases";

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
  const fourWeekAvgScore = fourWeekWeightedPrivacyAverage(
    [...trendRows]
      .sort((a, b) => a.weekId.localeCompare(b.weekId))
      .filter((row) => row.weekId <= snapshot.weekId)
      .map((row) => ({
        avgScore: row.avgScore,
        analyzableCount: row.analyzableCount,
      })),
  );
  const findings = buildKeyFindings({
    analyzable: m.analyzableCount,
    personalInfoCount: m.personalInfoCount,
    attentionNeededCount: m.attentionNeededCount,
    publicPersonalInfoCount: snapshot.publicSector.publicPersonalInfoSurveyCount,
    publicExternalToolCount: m.publicExternalToolCount,
    sensitiveCount: m.sensitiveInfoCount,
    highRiskCount: m.highRiskInfoCount,
  });
  const platforms = hydratePlatformRows(snapshot.platformStats);
  const orgs = hydrateOrgRows(snapshot.organizationStats);
  const cases = snapshot.anonymousCases.map(enrichAnonymousCase);
  const evidenceSurveyCount =
    m.evidenceSurveyCount || snapshot.quality.evidenceSurveyCount || 0;
  const evidenceImageCount =
    m.evidenceImageCount ||
    snapshot.quality.evidenceImageCount ||
    m.evidenceCaptureCount;
  const topPlatform = [...platforms].sort((a, b) => b.surveyCount - a.surveyCount)[0];
  const cautionPlatform = [...platforms]
    .filter((row) => row.surveyCount >= 5)
    .sort((a, b) => b.attentionNeededRate - a.attentionNeededRate)[0];

  return (
    <div className="space-y-8">
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

      <WeeklyTopDisclaimer />
      <WeeklyKeyNumberStrip
        analyzable={m.analyzableCount}
        personalInfoCount={m.personalInfoCount}
        attentionNeededCount={m.attentionNeededCount}
        publicExternalToolCount={m.publicExternalToolCount}
      />
      <WeeklyKeyFindings findings={findings} />
      <WeeklyPressBox
        title={snapshot.summary.headline}
        bullets={[...snapshot.summary.bullets]}
        text={snapshot.pressSummary}
      />

      <section className={`rounded-2xl border px-5 py-5 md:px-6 ${gradeClass(m.grade)}`}>
        <p className="text-xs font-semibold">이번 주 온라인 수집 개인정보 보호 수준지수</p>
        <p className="mt-2 text-3xl font-bold">
          {formatScore1(m.avgScore)}
          {m.grade ? ` · ${m.grade}` : ""}
        </p>
        <p className="mt-2 text-sm">
          {deltaText(snapshot.summary.scoreDelta)} · 4주 평균{" "}
          {formatScore1(fourWeekAvgScore ?? snapshot.summary.fourWeekAvgScore)}
        </p>
      </section>

      <PrivacyIndexTrendPanel
        rows={trendRows}
        currentWeekId={snapshot.weekId}
        showFormula
      />

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
            [
              "증빙 확보 설문",
              fmt(evidenceSurveyCount, "건"),
              "캡처 또는 ZIP 증빙자료가 확보된 설문 수입니다.",
            ],
          ].map(([title, value, hint]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{title}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
            </article>
          ))}
        </div>
      </section>

      <WeeklyPublicSectorBlock stats={snapshot.publicSector} />

      {snapshot.issueTop5.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-900">자주 발견된 미흡·확인 필요 항목 TOP 5</h2>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <WeeklyBarList
              items={snapshot.issueTop5.map((row) => ({
                label: row.label,
                value: row.affectedSurveyCount,
                meta: `${row.affectedSurveyCount}건 · ${row.rateOfAllScans}%`,
                hint: row.description,
              }))}
            />
          </div>
        </section>
      ) : null}

      {cases.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold text-slate-900">대표 개인정보 위험 사례</h2>
          <p className="mt-2 text-sm text-slate-600">
            실제 기관명, 설문 제목, URL, 캡처, 문항 원문은 공개하지 않습니다.
          </p>
          <div className="mt-4 space-y-4">
            {cases.map((item) => (
              <WeeklyRiskCaseCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-bold text-slate-900">플랫폼별 분석</h2>
        <p className="mt-2 text-sm text-slate-600">{WEEKLY_PLATFORM_CAVEAT}</p>
        <div className="mt-4">
          <WeeklyGroupInsightCards cards={groupInsightCards(platforms)} />
        </div>
        {topPlatform || cautionPlatform ? (
          <p className="mt-3 text-sm text-slate-600">
            {topPlatform
              ? `이번 주 가장 많이 확인된 플랫폼: ${topPlatform.label} ${formatWeeklyCount(topPlatform.surveyCount)}건`
              : ""}
            {cautionPlatform
              ? ` · 주의 필요 비율이 높은 플랫폼: ${cautionPlatform.label} ${cautionPlatform.attentionNeededRate}%`
              : ""}
          </p>
        ) : null}
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
              {platforms.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {row.label}
                      <WeeklySampleBadge count={row.surveyCount} />
                    </span>
                  </td>
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
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <WeeklyBarList
            items={platforms.map((row) => ({
              label: row.label,
              value: row.surveyCount,
              meta: `${row.surveyCount}건`,
            }))}
            emphasizeLast={false}
          />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">기관유형별 분석</h2>
        <div className="mt-4">
          <WeeklyGroupInsightCards cards={groupInsightCards(orgs)} />
        </div>
        <WeeklyGroupCards
          rows={orgs}
          emphasize={["공공기관", "학교/교육기관"]}
        />
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <WeeklyBarList
            items={orgs.map((row) => ({
              label: row.label,
              value: row.surveyCount,
              meta: `${row.surveyCount}건`,
            }))}
          />
        </div>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-slate-900">{WEEKLY_RESPONDENT_TIPS.title}</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-800">
          {WEEKLY_RESPONDENT_TIPS.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-slate-900">기관·기업 개선 체크리스트</h2>
        <p className="mt-2 text-sm text-slate-600">
          개인정보를 수집하는 설문 운영자는 아래 항목을 확인해야 합니다.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-800">
          {WEEKLY_CHECKLIST.map((item) => (
            <li key={item}>□ {item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">정책적 인사이트</h2>
        <div className="mt-4 space-y-3">
          {snapshot.insights.map((item) => (
            <blockquote
              key={item.order}
              className="rounded-2xl border-l-4 border-teal-700 bg-teal-50/60 px-5 py-4 text-sm leading-relaxed text-slate-800"
            >
              {item.text}
            </blockquote>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">보도·공유용 전체 요약</h2>
        <div className="mt-4">
          <WeeklyPressCopy text={snapshot.pressSummary} />
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-relaxed text-amber-950">
        <h2 className="text-base font-bold">진단 신뢰도 및 한계</h2>
        <p className="mt-3">
          분석 완료 {fmt(snapshot.quality.completedDiagnosisCount, "건")} · 분석 제외{" "}
          {fmt(snapshot.quality.closedExcludedCount, "건")}
          {snapshot.quality.limitedQuestionAnalysisCount > 0
            ? ` · 문항 분석 제한 ${fmt(snapshot.quality.limitedQuestionAnalysisCount, "건")}`
            : ""}{" "}
          · 증빙 확보 설문 {fmt(evidenceSurveyCount, "건")} · 증빙 캡처 이미지{" "}
          {fmt(evidenceImageCount, "개")}
        </p>
        <p className="mt-2 text-xs text-amber-900">
          증빙 캡처 이미지 {fmt(evidenceImageCount, "개")}는 분석 설문 중 일부에서 저장된
          화면 캡처 수입니다. 설문 건수와 다른 단위입니다.
        </p>
        <p className="mt-3">{WEEKLY_DISCLAIMER}</p>
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
