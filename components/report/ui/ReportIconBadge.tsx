import type { LucideIcon } from "lucide-react";

type IconTone = "navy" | "blue" | "indigo" | "sky" | "slate" | "amber" | "rose";

interface ReportIconBadgeProps {
  icon: LucideIcon;
  tone?: IconTone;
  size?: "md" | "lg" | "xl";
}

const toneStyles: Record<IconTone, string> = {
  navy: "border-slate-200 bg-slate-50 text-blue-900",
  blue: "border-slate-200 bg-slate-50 text-blue-800",
  indigo: "border-slate-200 bg-slate-50 text-slate-700",
  sky: "border-slate-200 bg-slate-50 text-sky-800",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

const sizeStyles = {
  md: { wrap: "h-8 w-8", icon: 16 },
  lg: { wrap: "h-9 w-9", icon: 18 },
  xl: { wrap: "h-10 w-10", icon: 20 },
};

export function ReportIconBadge({
  icon: Icon,
  tone = "navy",
  size = "md",
}: ReportIconBadgeProps) {
  const s = sizeStyles[size];

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md border ${toneStyles[tone]} ${s.wrap}`}
    >
      <Icon size={s.icon} strokeWidth={2} />
    </span>
  );
}
