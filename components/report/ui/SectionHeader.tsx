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
    <div className={`mb-6 ${className}`}>
      <div className="flex items-start gap-4">
        {step != null && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b5bdb] to-[#1e3a8a] text-lg font-bold text-white shadow-[0_8px_20px_rgba(30,58,138,0.28)]">
            {step}
          </span>
        )}
        {Icon && step == null && (
          <ReportIconBadge icon={Icon} tone="blue" size="lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {step != null && <span className="report-step-badge">Step {step}</span>}
            <h2 className="text-lg tracking-tight text-foreground md:text-xl">
              {title}
            </h2>
          </div>
          {description && (
            <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted md:text-base">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="report-card-divider mt-5" />
    </div>
  );
}
