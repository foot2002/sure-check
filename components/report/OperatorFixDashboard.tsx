import { Wrench } from "lucide-react";
import { FixPriorityCard } from "@/components/report/FixPriorityCard";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { AudienceReport, OperatorFix } from "@/lib/reporting/reportMessages";

interface OperatorFixDashboardProps {
  audienceReport: AudienceReport;
}

function byCategory(fixes: OperatorFix[], categories: OperatorFix["category"][]) {
  return fixes.filter((fix) => categories.includes(fix.category));
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

  const allFixes = [
    ...audienceReport.requiredFixes,
    ...audienceReport.recommendedFixes,
  ];
  const toolFixes = byCategory(allFixes, ["outsourcing", "overseas_transfer"]);
  const publicFixes = byCategory(allFixes, ["public_sector"]);
  const employeeFixes = byCategory(allFixes, ["employee_survey", "anonymity"]);
  const designFixes = byCategory(allFixes, [
    "event_reward",
    "marketing",
    "sensitive_data",
  ]);

  return (
    <section>
      <SectionHeader
        step={5}
        icon={Wrench}
        title="운영자 우선 개선사항"
        description={audienceReport.operatorSummary}
      />

      <div className="report-callout-card-strong mb-5 overflow-hidden p-5 md:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg text-foreground md:text-xl">
            <span className="font-bold">운영자가 먼저 고칠 3가지</span>
          </h3>
          <span className="report-step-badge">우선순위</span>
        </div>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <FixPriorityCard
          title="고지문 개선"
          fixes={audienceReport.requiredFixes}
          emptyText="즉시 보완해야 할 필수 항목은 크게 보이지 않습니다."
          initiallyVisible={0}
          variant="required"
        />
        <FixPriorityCard
          title="권장 보완"
          fixes={audienceReport.recommendedFixes}
          emptyText="권장 보완 항목이 없습니다."
          initiallyVisible={0}
          variant="recommended"
        />
        <FixPriorityCard
          title="도구·위탁 개선"
          fixes={toolFixes}
          emptyText="도구·위탁 관련 별도 보완 항목이 없습니다."
          initiallyVisible={0}
        />
        <FixPriorityCard
          title="문항 개선"
          fixes={designFixes}
          emptyText="설문 설계 관련 별도 보완 항목이 없습니다."
          initiallyVisible={0}
        />
        <FixPriorityCard
          title="공공기관 보완"
          fixes={publicFixes}
          emptyText="공공기관 맥락 보완 항목이 없습니다."
          initiallyVisible={0}
        />
        <FixPriorityCard
          title="직원/조직진단 보완"
          fixes={employeeFixes}
          emptyText="직원/조직진단 맥락 보완 항목이 없습니다."
          initiallyVisible={0}
        />
      </div>
    </section>
  );
}
