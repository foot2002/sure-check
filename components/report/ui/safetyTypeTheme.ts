import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Lock,
  OctagonX,
  ShieldCheck,
} from "lucide-react";
import type { SafetyTypeId, SafetyTypeTone } from "@/lib/reporting/safetyType";

export interface SafetyTypeTheme {
  tone: SafetyTypeTone;
  /** Soft pastel page/card tint */
  pageTint: string;
  card: string;
  cardSoft: string;
  border: string;
  text: string;
  accent: string;
  muted: string;
  iconBg: string;
  iconFg: string;
  badge: string;
  pill: string;
  blobFrom: string;
  blobTo: string;
  cta: string;
  ctaHover: string;
  ring: string;
  Icon: LucideIcon;
}

const THEMES: Record<SafetyTypeTone, Omit<SafetyTypeTheme, "tone" | "Icon">> = {
  green: {
    pageTint: "bg-[#f3faf7]",
    card: "border-[#a7f3d0] bg-gradient-to-br from-[#ecfdf5] via-[#f0fdf4] to-white",
    cardSoft: "border-[#d1fae5] bg-[#ecfdf5]/70",
    border: "border-[#a7f3d0]",
    text: "text-[#064e3b]",
    accent: "text-[#059669]",
    muted: "text-[#047857]/80",
    iconBg: "bg-gradient-to-br from-[#34d399] to-[#059669]",
    iconFg: "text-white",
    badge: "border-[#6ee7b7] bg-[#d1fae5] text-[#065f46]",
    pill: "bg-[#d1fae5] text-[#065f46]",
    blobFrom: "from-[#6ee7b7]/50",
    blobTo: "to-[#a7f3d0]/20",
    cta: "bg-[#059669] text-white",
    ctaHover: "hover:bg-[#047857]",
    ring: "ring-[#6ee7b7]/60",
  },
  amber: {
    pageTint: "bg-[#fffbeb]",
    card: "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] via-[#fef3c7] to-white",
    cardSoft: "border-[#fde68a] bg-[#fffbeb]/80",
    border: "border-[#fde68a]",
    text: "text-[#78350f]",
    accent: "text-[#d97706]",
    muted: "text-[#92400e]/80",
    iconBg: "bg-gradient-to-br from-[#fbbf24] to-[#d97706]",
    iconFg: "text-white",
    badge: "border-[#fcd34d] bg-[#fef3c7] text-[#92400e]",
    pill: "bg-[#fef3c7] text-[#92400e]",
    blobFrom: "from-[#fcd34d]/45",
    blobTo: "to-[#fde68a]/20",
    cta: "bg-[#d97706] text-white",
    ctaHover: "hover:bg-[#b45309]",
    ring: "ring-[#fcd34d]/60",
  },
  orange: {
    pageTint: "bg-[#fff7ed]",
    card: "border-[#fdba74] bg-gradient-to-br from-[#fff7ed] via-[#ffedd5] to-white",
    cardSoft: "border-[#fed7aa] bg-[#fff7ed]/80",
    border: "border-[#fdba74]",
    text: "text-[#7c2d12]",
    accent: "text-[#ea580c]",
    muted: "text-[#9a3412]/80",
    iconBg: "bg-gradient-to-br from-[#fb923c] to-[#ea580c]",
    iconFg: "text-white",
    badge: "border-[#fdba74] bg-[#ffedd5] text-[#9a3412]",
    pill: "bg-[#ffedd5] text-[#9a3412]",
    blobFrom: "from-[#fdba74]/45",
    blobTo: "to-[#fed7aa]/20",
    cta: "bg-[#ea580c] text-white",
    ctaHover: "hover:bg-[#c2410c]",
    ring: "ring-[#fdba74]/60",
  },
  blue: {
    pageTint: "bg-[#f5f3ff]",
    card: "border-[#c4b5fd] bg-gradient-to-br from-[#eef2ff] via-[#ede9fe] to-white",
    cardSoft: "border-[#ddd6fe] bg-[#f5f3ff]/80",
    border: "border-[#c4b5fd]",
    text: "text-[#312e81]",
    accent: "text-[#6d28d9]",
    muted: "text-[#5b21b6]/80",
    iconBg: "bg-gradient-to-br from-[#818cf8] to-[#7c3aed]",
    iconFg: "text-white",
    badge: "border-[#c4b5fd] bg-[#ede9fe] text-[#5b21b6]",
    pill: "bg-[#ede9fe] text-[#5b21b6]",
    blobFrom: "from-[#a78bfa]/40",
    blobTo: "to-[#c4b5fd]/20",
    cta: "bg-[#6d28d9] text-white",
    ctaHover: "hover:bg-[#5b21b6]",
    ring: "ring-[#c4b5fd]/60",
  },
  red: {
    pageTint: "bg-[#fff1f2]",
    card: "border-[#fda4af] bg-gradient-to-br from-[#fff1f2] via-[#ffe4e6] to-white",
    cardSoft: "border-[#fecdd3] bg-[#fff1f2]/80",
    border: "border-[#fda4af]",
    text: "text-[#881337]",
    accent: "text-[#e11d48]",
    muted: "text-[#9f1239]/80",
    iconBg: "bg-gradient-to-br from-[#fb7185] to-[#e11d48]",
    iconFg: "text-white",
    badge: "border-[#fda4af] bg-[#ffe4e6] text-[#9f1239]",
    pill: "bg-[#ffe4e6] text-[#9f1239]",
    blobFrom: "from-[#fb7185]/40",
    blobTo: "to-[#fda4af]/20",
    cta: "bg-[#e11d48] text-white",
    ctaHover: "hover:bg-[#be123c]",
    ring: "ring-[#fda4af]/60",
  },
  gray: {
    pageTint: "bg-[#f8fafc]",
    card: "border-[#cbd5e1] bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-white",
    cardSoft: "border-[#e2e8f0] bg-[#f8fafc]/90",
    border: "border-[#cbd5e1]",
    text: "text-[#0f172a]",
    accent: "text-[#475569]",
    muted: "text-[#64748b]",
    iconBg: "bg-gradient-to-br from-[#94a3b8] to-[#475569]",
    iconFg: "text-white",
    badge: "border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]",
    pill: "bg-[#f1f5f9] text-[#334155]",
    blobFrom: "from-[#94a3b8]/30",
    blobTo: "to-[#cbd5e1]/20",
    cta: "bg-[#475569] text-white",
    ctaHover: "hover:bg-[#334155]",
    ring: "ring-[#cbd5e1]/60",
  },
};

const ICONS: Record<SafetyTypeTone, LucideIcon> = {
  green: ShieldCheck,
  amber: AlertCircle,
  orange: ClipboardCheck,
  blue: Lock,
  red: OctagonX,
  gray: HelpCircle,
};

const SECONDARY_ICONS: Record<SafetyTypeTone, LucideIcon> = {
  green: BadgeCheck,
  amber: AlertCircle,
  orange: FileText,
  blue: BadgeCheck,
  red: OctagonX,
  gray: HelpCircle,
};

export function getSafetyTypeTheme(tone: SafetyTypeTone): SafetyTypeTheme {
  return {
    tone,
    Icon: ICONS[tone],
    ...THEMES[tone],
  };
}

export function getSafetyTypeSecondaryIcon(tone: SafetyTypeTone): LucideIcon {
  return SECONDARY_ICONS[tone];
}

export const SAFETY_TYPE_ID_TO_TONE: Record<SafetyTypeId, SafetyTypeTone> = {
  SAFE_RESPOND: "green",
  PII_CAUTION: "amber",
  NOTICE_CHECK: "orange",
  SECURITY_CHECK: "blue",
  STOP_RESPONSE: "red",
  JUDGMENT_UNKNOWN: "gray",
};
