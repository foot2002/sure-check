import type { LucideIcon } from "lucide-react";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  step?: number;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  icon: Icon,
  step,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`mb-5 ${className}`}>
      <div className="flex items-start gap-3">
        {step != null && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700">
            {step}
          </span>
        )}
        {Icon && step == null && (
          <ReportIconBadge icon={Icon} tone="slate" size="md" />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            {step != null && (
              <span className="report-step-badge">{step}단계</span>
            )}
            <h2 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">
              {title}
            </h2>
          </div>
          {description && (
            <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-slate-600">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="report-card-divider mt-4" />
    </div>
  );
}
