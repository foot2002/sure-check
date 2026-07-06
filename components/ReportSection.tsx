import type { ReactNode } from "react";
import { AlertTriangle, FileText, Info } from "lucide-react";

interface ReportSectionProps {
  title: string;
  children: ReactNode;
  variant?: "default" | "warning" | "info";
}

const variantStyles = {
  default: "border-border-subtle bg-surface",
  warning: "border-[#f0ddb0]/60 bg-[#fffcf5]",
  info: "border-[#b8d4e8]/60 bg-[#f7fafc]",
};

const sectionIcons: Record<string, ReactNode> = {
  default: <FileText size={16} strokeWidth={2.25} />,
  warning: <AlertTriangle size={16} strokeWidth={2.25} />,
  info: <Info size={16} strokeWidth={2.25} />,
};

export function ReportSection({
  title,
  children,
  variant = "default",
}: ReportSectionProps) {
  return (
    <section
      className={`rounded-xl border p-4 md:p-5 ${variantStyles[variant]}`}
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground md:text-[15px]">
        <span className="text-muted">{sectionIcons[variant]}</span>
        {title}
      </h3>
      <div className="text-sm leading-relaxed text-muted md:text-[15px]">
        {children}
      </div>
    </section>
  );
}

interface ReportListSectionProps {
  title: string;
  items: string[];
  variant?: "default" | "warning" | "info";
}

export function ReportListSection({
  title,
  items,
  variant = "default",
}: ReportListSectionProps) {
  return (
    <ReportSection title={title} variant={variant}>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/50" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
