import type { ReactNode } from "react";

interface PillTagProps {
  children: ReactNode;
  tone?: "neutral" | "safe" | "caution" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

const toneStyles = {
  neutral: "border-border-subtle bg-surface text-muted",
  safe: "border-[#b8e0cc] bg-[#edf7f1] text-[#1a6b45]",
  caution: "border-[#f0ddb0] bg-[#fef6e8] text-[#9a6b12]",
  warning: "border-[#f5cdb0] bg-[#fef0e8] text-[#b84a18]",
  danger: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]",
};

const sizeStyles = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

export function PillTag({
  children,
  tone = "neutral",
  size = "sm",
}: PillTagProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${toneStyles[tone]} ${sizeStyles[size]}`}
    >
      {children}
    </span>
  );
}
