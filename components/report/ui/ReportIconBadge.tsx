import type { LucideIcon } from "lucide-react";

type IconTone = "navy" | "blue" | "indigo" | "sky" | "slate" | "amber" | "rose";

interface ReportIconBadgeProps {
  icon: LucideIcon;
  tone?: IconTone;
  size?: "md" | "lg" | "xl";
}

const toneStyles: Record<IconTone, string> = {
  navy: "bg-gradient-to-br from-[#3b5bdb] to-[#1e3a8a] shadow-[0_8px_20px_rgba(30,58,138,0.28)]",
  blue: "bg-gradient-to-br from-[#4f8df7] to-[#2563eb] shadow-[0_8px_20px_rgba(37,99,235,0.24)]",
  indigo: "bg-gradient-to-br from-[#6366f1] to-[#4338ca] shadow-[0_8px_20px_rgba(67,56,202,0.24)]",
  sky: "bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_8px_20px_rgba(2,132,199,0.22)]",
  slate: "bg-gradient-to-br from-[#64748b] to-[#334155] shadow-[0_8px_20px_rgba(51,65,85,0.2)]",
  amber: "bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-[0_8px_20px_rgba(217,119,6,0.22)]",
  rose: "bg-gradient-to-br from-[#f43f5e] to-[#be123c] shadow-[0_8px_20px_rgba(190,18,60,0.22)]",
};

const sizeStyles = {
  md: { wrap: "h-12 w-12", icon: 22 },
  lg: { wrap: "h-14 w-14", icon: 26 },
  xl: { wrap: "h-16 w-16", icon: 30 },
};

export function ReportIconBadge({
  icon: Icon,
  tone = "navy",
  size = "lg",
}: ReportIconBadgeProps) {
  const s = sizeStyles[size];

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full text-white ${toneStyles[tone]} ${s.wrap}`}
    >
      <Icon size={s.icon} strokeWidth={2} />
    </span>
  );
}
