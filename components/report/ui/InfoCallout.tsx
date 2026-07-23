import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";

interface InfoCalloutProps {
  title: string;
  children: React.ReactNode;
  variant?: "info" | "warning" | "trust";
  icon?: LucideIcon;
}

const variantStyles = {
  info: {
    shell: "border-slate-200 bg-white",
    title: "text-slate-900",
    body: "text-slate-600",
    iconWrap: "border-slate-200 bg-slate-50 text-blue-800",
    icon: Info,
  },
  warning: {
    shell: "border-amber-200 bg-amber-50/80",
    title: "text-slate-900",
    body: "text-slate-600",
    iconWrap: "border-amber-200 bg-white text-amber-800",
    icon: AlertTriangle,
  },
  trust: {
    shell: "border-slate-200 bg-white",
    title: "text-slate-900",
    body: "text-slate-600",
    iconWrap: "border-slate-200 bg-slate-50 text-teal-800",
    icon: ShieldCheck,
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
    <div className={`rounded-xl border p-4 md:p-5 ${styles.shell}`}>
      <div className="flex gap-3.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${styles.iconWrap}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
          <div className={`mt-1 text-sm leading-relaxed ${styles.body}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
