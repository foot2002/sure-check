import { GradeBadge } from "@/components/GradeBadge";
import { ScoreGauge } from "@/components/ScoreGauge";
import {
  EXTRACTION_LIMITED_GUIDANCE,
  isExtractionLimitedReport,
} from "@/lib/scan/limitedReport";
import { GRADE_DESCRIPTIONS, LIMITED_DESCRIPTION } from "@/lib/utils/grade";
import type { ScanReport } from "@/lib/types/scan";

interface RiskSummaryCardProps {
  report: ScanReport;
}

export function RiskSummaryCard({ report }: RiskSummaryCardProps) {
  const limited = isExtractionLimitedReport(report);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold text-foreground">종합 진단 결과</h2>
            <GradeBadge grade={report.grade} limited={limited} size="md" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {limited
              ? LIMITED_DESCRIPTION
              : report.grade
                ? GRADE_DESCRIPTIONS[report.grade]
                : LIMITED_DESCRIPTION}
          </p>
          {limited && (
            <dl className="grid max-w-sm grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="font-medium text-muted">상태</dt>
              <dd className="text-foreground">진단 제한</dd>
              <dt className="font-medium text-muted">점수</dt>
              <dd className="text-foreground">산정 불가</dd>
            </dl>
          )}
        </div>
        <ScoreGauge score={report.score} unavailable={limited} />
      </div>

      <div className="border-t border-border-subtle bg-background px-5 py-4 md:px-6">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          핵심 요약
        </h3>
        <p className="text-[14px] leading-relaxed text-foreground">{report.summary}</p>
        {limited && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {EXTRACTION_LIMITED_GUIDANCE}
          </p>
        )}
        <p className="mt-3 break-all text-[11px] text-muted/70">{report.formUrl}</p>
      </div>
    </div>
  );
}
