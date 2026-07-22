import { Wrench } from "lucide-react";
import { FixPriorityCard } from "@/components/report/FixPriorityCard";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { AudienceReport } from "@/lib/reporting/reportMessages";

interface OperatorFixDashboardProps {
  audienceReport: AudienceReport;
}

export function OperatorFixDashboard({
  audienceReport,
}: OperatorFixDashboardProps) {
  if (audienceReport.isLimited) {
    return (
      <section className="report-summary-card p-5 md:p-6">
        <SectionHeader title="운영자 보완사항" />
        <p className="text-sm leading-relaxed text-muted md:text-[15px]">
          {audienceReport.operatorSummary}
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader
        icon={Wrench}
        title="운영자가 먼저 고칠 3가지"
        description={audienceReport.operatorSummary}
      />

      <div className="report-callout-card-strong mb-5 overflow-hidden p-5 md:p-6">
        {audienceReport.operatorTopFixes.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted md:text-[15px]">
            문항을 충분히 확인하지 못해 우선 개선사항을 최소화했습니다.
          </p>
        ) : (
          <ol className="space-y-3">
            {audienceReport.operatorTopFixes.map((fix, index) => (
              <li
                key={`${fix.category}_${fix.title}`}
                className="flex gap-4 rounded-2xl border border-white/90 bg-white/90 p-4 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b5bdb] to-[#1e3a8a] text-base font-bold text-white shadow-[0_6px_16px_rgba(30,58,138,0.24)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-base text-foreground md:text-lg">
                    <span className="font-bold">{fix.title}</span>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted md:text-[15px]">
                    {fix.action}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <FixPriorityCard
        title="상세 보완사항"
        fixes={[
          ...audienceReport.requiredFixes,
          ...audienceReport.recommendedFixes,
        ]}
        emptyText="추가 보완 항목이 없습니다."
        initiallyVisible={0}
        variant="recommended"
      />
    </section>
  );
}
