import type { VisualRiskLevel } from "@/lib/reporting/reportMessages";
import { RISK_LEVEL_STYLES } from "@/components/report/ui/riskStyles";

interface RiskLevelBadgeProps {
  level: VisualRiskLevel;
  label?: string;
  size?: "sm" | "md";
}

export function RiskLevelBadge({
  level,
  label,
  size = "sm",
}: RiskLevelBadgeProps) {
  const styles = RISK_LEVEL_STYLES[level];
  const sizeClass =
    size === "md"
      ? "px-2.5 py-1 text-xs font-semibold"
      : "px-2 py-0.5 text-[11px] font-semibold";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full ${sizeClass} ${styles.badge}`}
    >
      {label ?? styles.label}
    </span>
  );
}
