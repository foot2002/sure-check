import type { ReactNode } from "react";
import type {
  PublicDashboardOrgTypeRow,
  PublicDashboardPayload,
  PublicDashboardPlatformRow,
  PublicDashboardIssueRow,
  PublicDecisionStatRow,
  PublicDataCategoryStatRow,
  PublicNoticeComplianceRow,
  PublicPrivacyIndex,
  PublicQuestionStats,
  PublicSectorToolStats,
  PublicDiagnosisQualityStats,
  PublicKeyFindingCard,
  PublicDashboardInsights,
} from "@/lib/report/buildPublicDashboard";
import { PressShareSummaryBox } from "@/components/report/PressShareSummaryBox";

function formatScore(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toFixed(1);
}

function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function noticeTone(rate: number | null): {
  bar: string;
  badge: string;
  badgeText: string;
} {
  if (rate == null) {
    return {
      bar: "bg-slate-400",
      badge: "bg-slate-100 text-slate-600",
      badgeText: "해당 없음",
    };
  }
  if (rate <= 0) {
    return {
      bar: "bg-rose-600",
      badge: "bg-rose-100 text-rose-900",
      badgeText: "매우 미흡",
    };
  }
  if (rate < 50) {
    return {
      bar: "bg-orange-500",
      badge: "bg-orange-100 text-orange-900",
      badgeText: "미흡",
    };
  }
  if (rate < 80) {
    return {
      bar: "bg-amber-500",
      badge: "bg-amber-100 text-amber-950",
      badgeText: "개선 필요",
    };
  }
  return {
    bar: "bg-emerald-600",
    badge: "bg-emerald-100 text-emerald-900",
    badgeText: "상대적으로 양호",
  };
}

function decisionTone(decisionKey: string): string {
  switch (decisionKey) {
    case "SAFE_RESPOND":
      return "bg-emerald-600";
    case "PII_CAUTION":
      return "bg-slate-500";
    case "NOTICE_CHECK":
    case "SECURITY_CHECK":
      return "bg-amber-500";
    case "STOP_RESPONSE":
      return "bg-orange-600";
    case "JUDGMENT_UNKNOWN":
      return "bg-slate-400";
    default:
      return "bg-slate-500";
  }
}

function issueTone(rate: number): string {
  if (rate >= 70) return "bg-orange-600";
  if (rate >= 40) return "bg-amber-500";
  return "bg-slate-500";
}

function RateBar({
  label,
  rate,
  meta,
  barClassName = "bg-slate-500",
  badge,
}: {
  label: string;
  rate: number;
  meta?: string;
  barClassName?: string;
  badge?: { className: string; text: string };
}) {
  const width = Math.max(0, Math.min(100, rate));
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          {badge ? (
            <span
              className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
            >
              {badge.text}
            </span>
          ) : null}
        </div>
        <p className="shrink-0 text-right text-sm tabular-nums text-slate-600">
          {formatRate(rate)}
          {meta ? (
            <span className="mt-0.5 block text-xs text-slate-400">{meta}</span>
          ) : null}
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${width}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function OneLineConclusion({ insights }: { insights: PublicDashboardInsights }) {
  return (
    <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-5 md:p-6">
      <p className="text-xs font-semibold tracking-wide text-teal-800">
        이번 기간 한 줄 결론
      </p>
      <p className="mt-2 text-base font-semibold leading-relaxed text-slate-900 md:text-lg">
        {insights.oneLineConclusion}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        자동진단 기반 참고 해석이며, 개별 설문의 위반 여부를 확정하지 않습니다.
        주의 필요 = 응답 거부·신고 검토 + 안내 없으면 입력 금지 + 공식 확인 후
        응답.
      </p>
    </section>
  );
}

function KeySignals({ insights }: { insights: PublicDashboardInsights }) {
  return (
    <Section title="한눈에 보는 이번 기간 핵심 신호">
      <ol className="space-y-4">
        {insights.keySignals.map((signal) => (
          <li key={signal.order} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
              {signal.order}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {signal.headline}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {signal.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function KeyFindings({ cards }: { cards: PublicKeyFindingCard[] }) {
  return (
    <Section title="이번 기간 핵심 발견">
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.id}
            className={`rounded-xl border p-4 ${
              card.available
                ? "border-slate-200 bg-slate-50/80"
                : "border-dashed border-slate-200 bg-white"
            }`}
          >
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              {card.title}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {card.headline}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {card.detail}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function PrivacyIndexCard({ index }: { index: PublicPrivacyIndex }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/80 to-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            현재 진단 데이터 기준 평균 점수
          </p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
            {formatScore(index.avgScore)}
            <span className="ml-1 text-lg font-semibold text-slate-500">점</span>
          </p>
        </div>
        <div className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-right">
          <p className="text-xs text-slate-500">등급/해석</p>
          <p className="text-lg font-bold text-teal-900">
            {index.grade || "산출 불가"}
          </p>
          <p className="text-xs text-slate-500">{index.interpretation}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{index.disclaimer}</p>
    </div>
  );
}

function DecisionList({ rows }: { rows: PublicDecisionStatRow[] }) {
  if (rows.every((r) => r.count === 0)) {
    return <p className="text-sm text-slate-500">해당 기간 응답 권고 집계가 없습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.decisionKey}>
          <RateBar
            label={row.label}
            rate={row.rate}
            barClassName={decisionTone(row.decisionKey)}
            meta={`${row.count.toLocaleString("ko-KR")}건`}
          />
        </li>
      ))}
    </ul>
  );
}

function QuestionStatsGrid({ stats }: { stats: PublicQuestionStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        label="전체 분석 문항 수"
        value={`${stats.totalQuestions.toLocaleString("ko-KR")}개`}
      />
      <KpiCard
        label="개인정보 문항 수"
        value={`${stats.personalInfoQuestions.toLocaleString("ko-KR")}개`}
      />
      <KpiCard
        label="민감정보 문항 수"
        value={`${stats.sensitiveQuestions.toLocaleString("ko-KR")}개`}
      />
      <KpiCard
        label="고위험정보 문항 수"
        value={`${stats.highRiskQuestions.toLocaleString("ko-KR")}개`}
      />
      <KpiCard
        label="개인정보 문항 비율"
        value={formatRate(stats.personalInfoQuestionRate)}
      />
    </div>
  );
}

function DataCategoryList({ rows }: { rows: PublicDataCategoryStatRow[] }) {
  if (rows.every((r) => r.count === 0)) {
    return (
      <p className="text-sm text-slate-500">
        해당 기간 개인정보 유형 집계가 없습니다.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((row) => (
          <li key={row.categoryKey}>
            <RateBar
              label={row.label}
              rate={row.rate}
              barClassName="bg-slate-600"
              meta={`${row.count.toLocaleString("ko-KR")}건`}
            />
          </li>
        ))}
    </ul>
  );
}

function NoticeComplianceList({ rows }: { rows: PublicNoticeComplianceRow[] }) {
  if (rows.every((r) => r.applicableCount === 0)) {
    return (
      <p className="text-sm text-slate-500">해당 기간 고지 항목 집계가 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-4">
      {rows
        .filter((r) => r.applicableCount > 0)
        .map((row) => {
          const tone = noticeTone(row.complianceRate);
          return (
            <li key={row.itemKey}>
              <RateBar
                label={row.label}
                rate={row.complianceRate ?? 0}
                barClassName={tone.bar}
                badge={{ className: tone.badge, text: tone.badgeText }}
                meta={`충족 ${row.compliantCount.toLocaleString("ko-KR")} · 미흡/확인 필요 ${row.gapCount.toLocaleString("ko-KR")}`}
              />
            </li>
          );
        })}
    </ul>
  );
}

function PlatformTable({ rows }: { rows: PublicDashboardPlatformRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-3 font-semibold">플랫폼</th>
            <th className="py-2 pr-3 font-semibold">진단 건수</th>
            <th className="py-2 pr-3 font-semibold">개인정보</th>
            <th className="py-2 pr-3 font-semibold">민감정보</th>
            <th className="py-2 pr-3 font-semibold">고위험정보</th>
            <th className="py-2 font-semibold">평균 점수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.platform} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-3 font-medium text-slate-900">{row.platform}</td>
              <td className="py-2.5 pr-3 tabular-nums text-slate-700">
                {row.surveyCount.toLocaleString("ko-KR")}
              </td>
              <td className="py-2.5 pr-3 tabular-nums text-slate-700">
                {formatRate(row.personalInfoRate)}
              </td>
              <td className="py-2.5 pr-3 tabular-nums text-slate-700">
                {formatRate(row.sensitiveInfoRate)}
              </td>
              <td className="py-2.5 pr-3 tabular-nums text-slate-700">
                {formatRate(row.highRiskInfoRate)}
              </td>
              <td className="py-2.5 tabular-nums text-slate-700">
                {formatScore(row.avgOverallScore)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublicSectorBlock({ stats }: { stats: PublicSectorToolStats }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="공공부문 개인정보 수집 설문 수"
          value={`${stats.publicPersonalInfoSurveyCount.toLocaleString("ko-KR")}건`}
        />
        <KpiCard
          label="외부 설문도구 사용 확인 필요"
          value={`${stats.externalToolReviewCount.toLocaleString("ko-KR")}건`}
          hint="확인 필요 신호"
        />
        <KpiCard
          label="CSAP·클라우드 보안 확인 필요"
          value={`${stats.csapOrCloudReviewCount.toLocaleString("ko-KR")}건`}
          hint="위반 확정이 아닌 검토·확인 필요 집계"
        />
      </div>
      {stats.byPlatform.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">플랫폼별</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {stats.byPlatform.map((row) => (
              <li
                key={row.platform}
                className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-800">{row.platform}</span>
                <span className="tabular-nums text-slate-600">
                  {row.surveyCount.toLocaleString("ko-KR")}건
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {stats.byOrgType.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">기관 유형별</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {stats.byOrgType.map((row) => (
              <li
                key={row.typeLabel}
                className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-800">{row.typeLabel}</span>
                <span className="tabular-nums text-slate-600">
                  {row.surveyCount.toLocaleString("ko-KR")}건
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function IssueList({ issues }: { issues: PublicDashboardIssueRow[] }) {
  if (issues.length === 0) {
    return <p className="text-sm text-slate-500">해당 기간 이슈 집계가 없습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {issues.map((issue) => (
        <li key={issue.label}>
          <RateBar
            label={issue.label}
            rate={issue.rateOfAllScans}
            barClassName={issueTone(issue.rateOfAllScans)}
            meta={`영향 설문 ${issue.affectedSurveyCount.toLocaleString("ko-KR")}건 · 전체 진단 대비 ${formatRate(issue.rateOfAllScans)} · 발견 신호 ${issue.findingCount.toLocaleString("ko-KR")}건`}
          />
        </li>
      ))}
    </ul>
  );
}

function OrgTypeGrid({ rows }: { rows: PublicDashboardOrgTypeRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">유형별 집계가 없습니다.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.typeLabel}
          className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold text-slate-900">{row.typeLabel}</p>
            <p className="text-sm tabular-nums text-slate-600">
              {row.surveyCount.toLocaleString("ko-KR")}건
            </p>
          </div>
          <div className="mt-3 space-y-2.5">
            <RateBar
              label="개인정보 포함"
              rate={row.personalInfoRate}
              barClassName="bg-slate-600"
            />
            <RateBar
              label="민감정보 포함"
              rate={row.sensitiveInfoRate}
              barClassName="bg-amber-500"
            />
            <RateBar
              label="고위험정보 포함"
              rate={row.highRiskInfoRate}
              barClassName="bg-orange-600"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiagnosisQualityGrid({ stats }: { stats: PublicDiagnosisQualityStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <KpiCard
        label="진단 완료 건수"
        value={`${stats.completedDiagnosisCount.toLocaleString("ko-KR")}건`}
      />
      <KpiCard
        label="문항 분석 제한 건수"
        value={`${stats.limitedQuestionAnalysisCount.toLocaleString("ko-KR")}건`}
      />
      <KpiCard
        label="증빙 캡처 확보 건수"
        value={`${stats.evidenceCaptureCount.toLocaleString("ko-KR")}건`}
      />
    </div>
  );
}

function RespondentGuide() {
  return (
    <Section
      title="설문 응답 전 확인하세요"
      description="개인정보를 입력하기 전 아래 항목이 안내되어 있는지 먼저 확인하세요."
    >
      <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-slate-700">
        <li>이름·연락처·이메일을 쓰기 전에 수집 목적을 확인하세요.</li>
        <li>보유기간과 파기 기준이 없으면 개인정보 입력을 피하세요.</li>
        <li>
          공공기관 설문인데 외부 설문도구를 쓰는 경우 공식 안내 여부를
          확인하세요.
        </li>
        <li>
          건강·질병·민원·피해 경험 등 민감한 내용은 특히 신중하게 응답하세요.
        </li>
      </ol>
    </Section>
  );
}

function OperatorGuide() {
  return (
    <Section
      title="설문 운영자가 보완해야 할 기본 항목"
      description="개인정보를 수집하는 설문 운영자는 아래 항목을 함께 안내하는 것이 좋습니다."
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {[
          "수집 목적",
          "수집 항목",
          "보유기간",
          "파기 기준",
          "동의 거부권 및 불이익",
          "담당자 연락처",
          "외부도구·위탁 처리 여부",
          "국외이전 여부",
          "공공부문 클라우드 보안 확인",
        ].map((item) => (
          <li
            key={item}
            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function PublicDashboardView({ data }: { data: PublicDashboardPayload }) {
  if (!data.hasData) {
    return (
      <div className="space-y-8">
        <OneLineConclusion insights={data.insights} />
        <KeySignals insights={data.insights} />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-base font-semibold text-slate-900">
            아직 공개 통계를 산출하기 위한 진단 데이터가 충분하지 않습니다.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            설문 진단이 누적되면 이곳에 기간별 개인정보 수집 실태가 표시됩니다.
          </p>
        </div>
        <RespondentGuide />
        <OperatorGuide />
        <PressShareSummaryBox summary={data.insights.pressShareSummary} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {data.isEarlyData ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          현재 통계는 초기 누적 데이터 기준입니다. 진단 데이터가 쌓일수록 더
          안정적인 추세를 확인할 수 있습니다.
        </div>
      ) : null}

      <OneLineConclusion insights={data.insights} />
      <KeySignals insights={data.insights} />

      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">
          핵심 지표
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="전체 진단 설문 수"
            value={`${data.summary.totalScans.toLocaleString("ko-KR")}건`}
            hint={`${data.from} ~ ${data.to}`}
          />
          <KpiCard
            label="개인정보 포함 비율"
            value={formatRate(data.summary.personalInfoRate)}
            hint={`${data.summary.personalInfoCount.toLocaleString("ko-KR")}건`}
          />
          <KpiCard
            label="민감정보 포함 비율"
            value={formatRate(data.summary.sensitiveInfoRate)}
            hint={`${data.summary.sensitiveInfoCount.toLocaleString("ko-KR")}건`}
          />
          <KpiCard
            label="주의 필요 설문 비율"
            value={formatRate(data.summary.attentionNeededRate)}
            hint={`${data.summary.attentionNeededCount.toLocaleString("ko-KR")}건 · 거부·신고/안내확인/공식확인`}
          />
          <KpiCard
            label="문항 분석 불가"
            value={formatRate(data.summary.judgmentUnknownRate)}
            hint={`${data.summary.judgmentUnknownCount.toLocaleString("ko-KR")}건 · 주의 필요와 별도`}
          />
          <KpiCard
            label="평균 개인정보 보호 점수"
            value={formatScore(data.summary.avgOverallScore)}
            hint="자동진단 점수 평균"
          />
        </div>
      </section>

      <KeyFindings cards={data.insights.keyFindings} />

      <Section
        title="온라인 수집 개인정보 수준지수"
        description="자동진단 점수 평균을 바탕으로 한 참고 지표입니다."
      >
        <PrivacyIndexCard index={data.privacyIndex} />
      </Section>

      <Section
        title="시민 관점 응답 권고"
        description="개별 설문명은 공개하지 않고, 응답자가 어떤 태도로 접근하면 좋을지 자동진단 결과를 집계해 보여줍니다."
      >
        <DecisionList rows={data.decisionStats} />
      </Section>

      <RespondentGuide />
      <OperatorGuide />

      <Section
        title="문항 기준 개인정보 수집 현황"
        description="문항 원문은 공개하지 않으며, 집계 수치만 표시합니다."
      >
        <QuestionStatsGrid stats={data.questionStats} />
      </Section>

      <Section
        title="자주 수집되는 개인정보 유형"
        description="category 기준 집계입니다. 문항 원문은 공개하지 않습니다."
      >
        <DataCategoryList rows={data.dataCategoryStats} />
      </Section>

      <Section title="개인정보 처리 고지 항목 충족률">
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
          개인정보를 수집하는 설문은 수집 목적, 수집 항목, 보유기간, 파기 기준,
          동의 거부권, 담당자 연락처 등을 함께 안내해야 합니다. 아래 수치는
          자동진단 기준으로 각 고지 항목이 얼마나 충족되었는지를 보여주는 참고
          지표입니다. 미흡/확인 필요로 해석하며, 위반을 확정하지 않습니다.
        </p>
        <NoticeComplianceList rows={data.noticeComplianceStats} />
      </Section>

      <Section
        title="공공기관 설문, 외부도구 사용 괜찮을까?"
        description="공공부문이 개인정보를 수집하면서 외부 설문도구를 사용할 경우, 도구의 보안성, 위탁 처리, 공공부문 클라우드 보안 기준 확인이 필요합니다. 이 통계는 개별 기관명을 공개하지 않고 확인 필요 신호만 집계합니다."
      >
        <PublicSectorBlock stats={data.publicSectorToolStats} />
      </Section>

      <Section title="플랫폼별 통계">
        <p className="mb-4 text-sm leading-relaxed text-slate-600">
          {data.insights.platformInsight}
        </p>
        <PlatformTable rows={data.platformStats} />
      </Section>

      <Section
        title="자주 발견되는 미흡·확인 필요 항목"
        description="구체 항목을 우선 표시합니다. ‘기타 확인 필요’는 구체 항목이 없을 때만 표시합니다. 막대 색은 확인 필요 강도(중립~주의)를 나타냅니다."
      >
        <IssueList issues={data.issueStats} />
      </Section>

      <Section
        title="기관·기업 유형별 통계"
        description="개별 기관·기업명은 표시하지 않으며, 유형 기준으로만 집계합니다."
      >
        <OrgTypeGrid rows={data.organizationTypeStats} />
      </Section>

      <PressShareSummaryBox summary={data.insights.pressShareSummary} />

      <Section
        title="진단 신뢰도 및 한계"
        description="자동진단은 설문 페이지 접근 가능 여부와 플랫폼 구조에 따라 일부 제한될 수 있습니다. 아래 수치는 공개 통계의 해석 범위를 이해하기 위한 참고 정보입니다."
      >
        <DiagnosisQualityGrid stats={data.diagnosisQualityStats} />
      </Section>

      <p className="text-xs leading-relaxed text-slate-500">
        공개 범위: {data.disclosurePolicy.mode} · 생성 시각{" "}
        {new Date(data.generatedAt).toLocaleString("ko-KR")}
      </p>
    </div>
  );
}
