"use client";

import { GRADE_LABELS, getGradeColor, getLimitedColor, LIMITED_LABEL } from "@/lib/utils/grade";
import type { RiskGrade } from "@/lib/types/scan";

interface GradeBadgeProps {
  grade?: RiskGrade;
  limited?: boolean;
  size?: "sm" | "md" | "lg";
}

export function GradeBadge({ grade, limited = false, size = "md" }: GradeBadgeProps) {
  const colors = limited || !grade ? getLimitedColor() : getGradeColor(grade);
  const label = limited || !grade ? LIMITED_LABEL : GRADE_LABELS[grade];
  const sizeClasses = {
    sm: "gap-1.5 px-2 py-0.5 text-[11px]",
    md: "gap-1.5 px-2.5 py-1 text-xs",
    lg: "gap-2 px-3 py-1 text-sm",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses[size]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {label}
    </span>
  );
}
