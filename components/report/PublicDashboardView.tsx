import type { ReactNode } from "react";
import type {
  PublicDashboardOrgTypeRow,
  PublicDashboardPayload,
  PublicDashboardPlatformRow,
  PublicDashboardIssueRow,
  PublicDashboardTrendRow,
  PublicDecisionStatRow,
  PublicDataCategoryStatRow,
  PublicNoticeComplianceRow,
  PublicPrivacyIndex,
  PublicQuestionStats,
  PublicSectorToolStats,
  PublicDiagnosisQualityStats,
} from "@/lib/report/buildPublicDashboard";

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

function RateBar({
  label,
  rate,
  meta,
}: {
  label: string;
  rate: number;
  meta?: string;
}) {
  const width = Math.max(0, Math.min(100, rate));
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-right text-sm tabular-nums text-slate-600">
          {formatRate(rate)}
          {meta ? (
            <span className="ml-2 block text-xs text-slate-400 sm:ml-2 sm:inline">
              {meta}
            </span>
          ) : null}
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-700"
          style={{ width: `${width}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function TrendBars({ trends }: { trends: PublicDashboardTrendRow[] }) {
  const maxTrendCount = Math.max(1, ...trends.map((t) => t.surveyCount));
  return (
    <div className="flex h-40 items-end gap-1.5 md:gap-2">
      {trends.map((row) => {
        const height = Math.max(
          6,
          Math.round((row.surveyCount / maxTrendCount) * 100),
        );
        return (
          <div
            key={row.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${row.date}: ${row.surveyCount}건`}
          >
            <span className="text-[10px] tabular-nums text-slate-500">
              {row.surveyCount}
            </span>
            <div
              className="w-full rounded-t-md bg-teal-700/90"
              style={{ height: `${height}%` }}
            />
            <span className="truncate text-[10px] text-slate-400">
              {row.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
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
    return <p className="text-sm text-slate-500">해당 기간 응답 판단 집계가 없습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.decisionKey}>
          <RateBar
            label={row.label}
            rate={row.rate}
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
    <ul className="space-y-3">
      {rows
        .filter((r) => r.applicableCount > 0)
        .map((row) => (
          <li key={row.itemKey}>
            <RateBar
              label={row.label}
              rate={row.complianceRate ?? 0}
              meta={`충족 ${row.compliantCount.toLocaleString("ko-KR")} · 미흡/확인 필요 ${row.gapCount.toLocaleString("ko-KR")}`}
            />
          </li>
        ))}
    </ul>
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
          hint="개선 권고·확인 필요 신호"
        />
        <KpiCard
          label="CSAP·클라우드 보안 확인 필요"
          value={`${stats.csapOrCloudReviewCount.toLocaleString("ko-KR")}건`}
          hint="위험 신호가 아닌 확인 필요 집계"
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
            meta={`발견 ${issue.findingCount.toLocaleString("ko-KR")} · 영향 설문 ${issue.affectedSurveyCount.toLocaleString("ko-KR")} · 전체 대비 ${formatRate(issue.rateOfAllScans)}`}
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
            <RateBar label="개인정보 포함" rate={row.personalInfoRate} />
            <RateBar label="민감정보 포함" rate={row.sensitiveInfoRate} />
            <RateBar label="고위험정보 포함" rate={row.highRiskInfoRate} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiagnosisQualityGrid({ stats }: { stats: PublicDiagnosisQualityStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
      <KpiCard
        label="전체 경로 캡처 완료"
        value={`${stats.fullPathCaptureCount.toLocaleString("ko-KR")}건`}
      />
      <KpiCard
        label="평균 캡처 페이지 수"
        value={formatScore(stats.avgCapturedPageCount)}
      />
    </div>
  );
}

export function PublicDashboardView({ data }: { data: PublicDashboardPayload }) {
  if (!data.hasData) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-base font-semibold text-slate-900">
          아직 공개 통계를 산출하기 위한 진단 데이터가 충분하지 않습니다.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          설문 진단이 누적되면 이곳에 기간별 개인정보 수집 실태가 표시됩니다.
        </p>
      </div>
    );
  }

  const trendAvg = (key: keyof PublicDashboardTrendRow) => {
    if (data.trends.length === 0) return 0;
    const sum = data.trends.reduce((s, t) => s + Number(t[key] || 0), 0);
    return sum / data.trends.length;
  };

  return (
    <div className="space-y-8">
      {data.isEarlyData ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          현재 통계는 초기 누적 데이터 기준입니다. 진단 데이터가 쌓일수록 더
          안정적인 추세를 확인할 수 있습니다.
        </div>
      ) : null}

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
            label="고위험정보 포함 비율"
            value={formatRate(data.summary.highRiskInfoRate)}
            hint={`${data.summary.highRiskInfoCount.toLocaleString("ko-KR")}건`}
          />
          <KpiCard
            label="주의 필요 설문 비율"
            value={formatRate(data.summary.highOrCriticalRate)}
            hint={`${data.summary.highOrCriticalCount.toLocaleString("ko-KR")}건`}
          />
          <KpiCard
            label="평균 개인정보 보호 점수"
            value={formatScore(data.summary.avgOverallScore)}
            hint="자동진단 점수 평균"
          />
        </div>
      </section>

      <Section
        title="온라인 수집 개인정보 수준지수"
        description="자동진단 점수 평균을 바탕으로 한 참고 지표입니다."
      >
        <PrivacyIndexCard index={data.privacyIndex} />
      </Section>

      <Section
        title="응답 판단 분포"
        description="일반인이 이해하기 쉬운 응답 행동 판단의 집계입니다. 개별 설문명은 표시하지 않습니다."
      >
        <DecisionList rows={data.decisionStats} />
      </Section>

      {data.trends.length > 0 ? (
        <Section title="기간별 추세">
          <div className="space-y-5">
            <TrendBars trends={data.trends} />
            <div className="grid gap-4 md:grid-cols-3">
              <RateBar
                label="평균 개인정보 포함 비율"
                rate={trendAvg("personalInfoRate")}
              />
              <RateBar
                label="평균 민감정보 포함 비율"
                rate={trendAvg("sensitiveInfoRate")}
              />
              <RateBar
                label="평균 고위험정보 포함 비율"
                rate={trendAvg("highRiskInfoRate")}
              />
            </div>
          </div>
        </Section>
      ) : null}

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

      <Section
        title="개인정보 처리 고지 항목 충족률"
        description="자동진단 기준의 고지 충족 여부이며, 위반 확정이 아닙니다. not_applicable은 분모에서 제외합니다."
      >
        <NoticeComplianceList rows={data.noticeComplianceStats} />
      </Section>

      <Section title="플랫폼별 통계">
        <PlatformTable rows={data.platformStats} />
      </Section>

      <Section
        title="공공부문 외부 설문도구 사용 확인 필요"
        description="개별 기관명은 공개하지 않으며, 플랫폼·기관유형 집계와 확인 필요 신호만 표시합니다."
      >
        <PublicSectorBlock stats={data.publicSectorToolStats} />
      </Section>

      <Section
        title="자주 발견되는 미흡·확인 필요 항목"
        description="유사 항목은 공개용 라벨로 통합했습니다. 막대는 전체 진단 대비 영향 설문 비율입니다."
      >
        <IssueList issues={data.issueStats} />
      </Section>

      <Section
        title="기관·기업 유형별 통계"
        description="개별 기관·기업명은 표시하지 않으며, 유형 기준으로만 집계합니다."
      >
        <OrgTypeGrid rows={data.organizationTypeStats} />
      </Section>

      <Section
        title="진단 신뢰도 및 한계"
        description="증빙 파일 경로·ZIP·signed URL은 공개하지 않으며, 집계 수치만 표시합니다."
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
