import type { VisualRiskLevel } from "@/lib/reporting/reportMessages";

export interface RiskLevelStyle {
  badge: string;
  bar: string;
  border: string;
  surface: string;
  text: string;
  label: string;
}

export const RISK_LEVEL_STYLES: Record<VisualRiskLevel, RiskLevelStyle> = {
  low: {
    badge: "bg-[#e8f5ee] text-[#1a6b45] ring-1 ring-[#b8e0cc]",
    bar: "bg-[#2d8a5e]",
    border: "border-l-[#2d8a5e]",
    surface: "bg-[#f4fbf7]",
    text: "text-[#1a6b45]",
    label: "낮음",
  },
  medium: {
    badge: "bg-[#fef6e8] text-[#9a6b12] ring-1 ring-[#f0ddb0]",
    bar: "bg-[#c4841a]",
    border: "border-l-[#c4841a]",
    surface: "bg-[#fffcf5]",
    text: "text-[#9a6b12]",
    label: "확인 필요",
  },
  high: {
    badge: "bg-[#fef0e8] text-[#b84a18] ring-1 ring-[#f5cdb0]",
    bar: "bg-[#d4622a]",
    border: "border-l-[#d4622a]",
    surface: "bg-[#fff9f5]",
    text: "text-[#b84a18]",
    label: "주의",
  },
  critical: {
    badge: "bg-[#fdf0f2] text-[#9e2a3e] ring-1 ring-[#f5c2cc]",
    bar: "bg-[#c73e54]",
    border: "border-l-[#c73e54]",
    surface: "bg-[#fff8f9]",
    text: "text-[#9e2a3e]",
    label: "높음",
  },
  limited: {
    badge: "bg-[#f3f4f6] text-[#4b5563] ring-1 ring-[#d1d5db]",
    bar: "bg-[#6b7280]",
    border: "border-l-[#6b7280]",
    surface: "bg-[#f9fafb]",
    text: "text-[#4b5563]",
    label: "제한",
  },
};

export const DIMENSION_ACCENTS = {
  data: { icon: "text-[#1e40af]", ring: "ring-[#bfdbfe]", bg: "bg-[#eff6ff]" },
  tool: { icon: "text-[#4338ca]", ring: "ring-[#c7d2fe]", bg: "bg-[#eef2ff]" },
  notice: { icon: "text-[#b45309]", ring: "ring-[#fcd9a8]", bg: "bg-[#fff7ed]" },
  management: { icon: "text-[#1e3a8a]", ring: "ring-[#bfdbfe]", bg: "bg-[#eff6ff]" },
  context: { icon: "text-[#1e40af]", ring: "ring-[#bfdbfe]", bg: "bg-[#eff6ff]" },
  limited: { icon: "text-[#64748b]", ring: "ring-[#cbd5e1]", bg: "bg-[#f1f5f9]" },
} as const;
