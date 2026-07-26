import { AlertCircle, Building2, Database, FileWarning, Route } from "lucide-react";
import { PillTag } from "@/components/report/ui/PillTag";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import { RiskLevelBadge } from "@/components/report/ui/RiskLevelBadge";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { KeyReason } from "@/lib/reporting/reportMessages";

interface KeyReasonsGridProps {
  reasons: KeyReason[];
}

const icons = {
  data: Database,
  tool: Route,
  notice: FileWarning,
  context: Building2,
  limited: AlertCircle,
  management: AlertCircle,
};

const iconTones = {
  data: "blue" as const,
  tool: "indigo" as const,
  notice: "amber" as const,
  context: "navy" as const,
  limited: "slate" as const,
  management: "sky" as const,
};

export function KeyReasonsGrid({ reasons }: KeyReasonsGridProps) {
  if (reasons.length === 0) return null;

  return (
    <section>
      <SectionHeader
        step={3}
        title="판단 핵심 근거"
        description="왜 이렇게 판단했는지 핵심 근거만 먼저 정리했습니다."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {reasons.slice(0, 4).map((reason) => {
          const Icon = icons[reason.category];

          return (
            <article key={reason.id} className="report-summary-card p-5 md:p-6">
              <div className="mb-4 flex items-start gap-4">
                <ReportIconBadge
                  icon={Icon}
                  tone={iconTones[reason.category]}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-base text-foreground md:text-lg">
                      <span className="font-bold">{reason.title}</span>
                    </h3>
                    <RiskLevelBadge level={reason.severity} />
                  </div>
                  <p className="text-sm leading-relaxed text-muted md:text-[15px]">
                    {reason.description}
                  </p>
                </div>
              </div>
              {reason.evidence.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                  {reason.evidence.slice(0, 2).map((item) => (
                    <PillTag key={item} tone="neutral" size="sm">
                      {item}
                    </PillTag>
                  ))}
                  {reason.extraCount > 0 && (
                    <PillTag tone="neutral" size="sm">
                      외 {reason.extraCount}건
                    </PillTag>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
