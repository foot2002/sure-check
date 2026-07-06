import { Database, FileWarning, Route, ShieldCheck } from "lucide-react";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import { RiskLevelBadge } from "@/components/report/ui/RiskLevelBadge";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import { RISK_LEVEL_STYLES } from "@/components/report/ui/riskStyles";
import type { RiskDimension } from "@/lib/reporting/reportMessages";

interface RiskDimensionBarsProps {
  dimensions: RiskDimension[];
}

const icons = {
  data: Database,
  tool: Route,
  notice: FileWarning,
  management: ShieldCheck,
};

const iconTones = {
  data: "blue" as const,
  tool: "indigo" as const,
  notice: "amber" as const,
  management: "navy" as const,
};

export function RiskDimensionBars({ dimensions }: RiskDimensionBarsProps) {
  return (
    <section>
      <SectionHeader
        step={2}
        title="4가지 핵심 리스크 요약"
        description="수집정보, 도구·처리경로, 고지·동의, 관리·운영 관점에서 위험 수준을 한눈에 확인합니다."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {dimensions.map((dimension) => {
          const Icon = icons[dimension.id];
          const styles = RISK_LEVEL_STYLES[dimension.level];

          return (
            <article key={dimension.id} className="report-summary-card p-5 md:p-6">
              <div className="mb-4 flex items-start gap-4">
                <ReportIconBadge icon={Icon} tone={iconTones[dimension.id]} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base text-foreground md:text-lg">
                      <span className="font-bold">{dimension.title}</span>
                    </h3>
                    <RiskLevelBadge level={dimension.level} label={dimension.label} size="md" />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted md:text-[15px]">
                    {dimension.description}
                  </p>
                </div>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#e8edf6]">
                <div
                  className={`h-full rounded-full transition-all ${styles.bar}`}
                  style={{ width: `${Math.max(10, dimension.score)}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
