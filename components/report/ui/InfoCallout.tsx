import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";

interface InfoCalloutProps {
  title: string;
  children: React.ReactNode;
  variant?: "info" | "warning" | "trust";
  icon?: LucideIcon;
}

const variantStyles = {
  info: {
    box: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    title: "text-[#172554]",
    body: "text-[#475569]",
    icon: Info,
    tone: "blue" as const,
  },
  warning: {
    box: "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white",
    title: "text-[#92400e]",
    body: "text-[#a16207]",
    icon: AlertTriangle,
    tone: "amber" as const,
  },
  trust: {
    box: "border-[#c7d7f5] bg-gradient-to-br from-[#f8fbff] to-white",
    title: "text-[#172554]",
    body: "text-[#475569]",
    icon: ShieldCheck,
    tone: "navy" as const,
  },
};

export function InfoCallout({
  title,
  children,
  variant = "info",
  icon,
}: InfoCalloutProps) {
  const styles = variantStyles[variant];
  const Icon = icon ?? styles.icon;

  return (
    <div className={`rounded-2xl border p-4 shadow-sm md:p-5 ${styles.box}`}>
      <div className="flex gap-4">
        <ReportIconBadge icon={Icon} tone={styles.tone} size="md" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm md:text-[15px] ${styles.title}`}>
            <span className="font-bold">{title}</span>
          </p>
          <div className={`mt-1.5 text-sm leading-relaxed md:text-[15px] ${styles.body}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
