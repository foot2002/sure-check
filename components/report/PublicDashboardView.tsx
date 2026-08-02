import type {
  PublicDashboardOrgTypeRow,
  PublicDashboardPayload,
  PublicDashboardPlatformRow,
  PublicDashboardIssueRow,
  PublicDashboardTrendRow,
} from "@/lib/report/buildPublicDashboard";

function formatScore(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toFixed(1);
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
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
  count,
}: {
  label: string;
  rate: number;
  count?: number;
}) {
  const width = Math.max(0, Math.min(100, rate));
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-sm tabular-nums text-slate-600">
          {formatRate(rate)}
          {typeof count === "number" ? (
            <span className="ml-2 text-xs text-slate-400">{count}건</span>
          ) : null}
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-700"
          style={{ width: `${width}%` }}
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

function IssueList({
  issues,
  totalScans,
}: {
  issues: PublicDashboardIssueRow[];
  totalScans: number;
}) {
  if (issues.length === 0) {
    return <p className="text-sm text-slate-500">해당 기간 이슈 집계가 없습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {issues.map((issue) => (
        <li key={`${issue.findingType}-${issue.severity}-${issue.checkDomain}`}>
          <RateBar
            label={issue.label}
            rate={
              totalScans > 0
                ? Math.min(100, (issue.findingCount / totalScans) * 100)
                : 0
            }
            count={issue.findingCount}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">기간별 추세</h2>
        {data.trends.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">표시할 일자별 데이터가 없습니다.</p>
        ) : (
          <div className="mt-5 space-y-5">
            <TrendBars trends={data.trends} />
            <div className="grid gap-4 md:grid-cols-3">
              <RateBar label="평균 개인정보 포함 비율" rate={trendAvg("personalInfoRate")} />
              <RateBar label="평균 민감정보 포함 비율" rate={trendAvg("sensitiveInfoRate")} />
              <RateBar label="평균 고위험정보 포함 비율" rate={trendAvg("highRiskInfoRate")} />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">플랫폼별 통계</h2>
        <div className="mt-4">
          <PlatformTable rows={data.platformStats} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">
          자주 발견되는 미흡·확인 필요 항목
        </h2>
        <p className="mt-2 mb-4 text-sm text-slate-600">
          자동진단에서 반복적으로 확인된 항목입니다. 위반 확정이 아닙니다.
        </p>
        <IssueList issues={data.issueStats} totalScans={data.summary.totalScans} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">기관·기업 유형별 통계</h2>
        <p className="mt-2 mb-4 text-sm text-slate-600">
          개별 기관·기업명은 표시하지 않으며, 유형 기준으로만 집계합니다.
        </p>
        <OrgTypeGrid rows={data.organizationTypeStats} />
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        공개 범위: {data.disclosurePolicy.mode} · 생성 시각{" "}
        {new Date(data.generatedAt).toLocaleString("ko-KR")}
      </p>
    </div>
  );
}
