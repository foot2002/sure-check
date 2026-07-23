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
  /** CSS color for left accent bar */
  accentColor: string;
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
  statusBadge: string;
  Icon: LucideIcon;
}

const THEMES: Record<SafetyTypeTone, Omit<SafetyTypeTheme, "tone" | "Icon">> = {
  green: {
    accentColor: "#059669",
    pageTint: "bg-white",
    card: "border-slate-200 bg-white",
    cardSoft: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    accent: "text-emerald-700",
    muted: "text-slate-600",
    iconBg: "bg-emerald-50",
    iconFg: "text-emerald-700",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pill: "bg-emerald-50 text-emerald-800",
    blobFrom: "from-transparent",
    blobTo: "to-transparent",
    cta: "bg-emerald-700 text-white",
    ctaHover: "hover:bg-emerald-800",
    ring: "ring-emerald-100",
    statusBadge: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  amber: {
    accentColor: "#d97706",
    pageTint: "bg-white",
    card: "border-slate-200 bg-white",
    cardSoft: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    accent: "text-amber-700",
    muted: "text-slate-600",
    iconBg: "bg-amber-50",
    iconFg: "text-amber-700",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
    pill: "bg-amber-50 text-amber-900",
    blobFrom: "from-transparent",
    blobTo: "to-transparent",
    cta: "bg-amber-700 text-white",
    ctaHover: "hover:bg-amber-800",
    ring: "ring-amber-100",
    statusBadge: "border-amber-200 bg-amber-50 text-amber-900",
  },
  orange: {
    accentColor: "#ea580c",
    pageTint: "bg-white",
    card: "border-slate-200 bg-white",
    cardSoft: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    accent: "text-orange-700",
    muted: "text-slate-600",
    iconBg: "bg-orange-50",
    iconFg: "text-orange-700",
    badge: "border-orange-200 bg-orange-50 text-orange-900",
    pill: "bg-orange-50 text-orange-900",
    blobFrom: "from-transparent",
    blobTo: "to-transparent",
    cta: "bg-orange-700 text-white",
    ctaHover: "hover:bg-orange-800",
    ring: "ring-orange-100",
    statusBadge: "border-orange-200 bg-orange-50 text-orange-900",
  },
  blue: {
    accentColor: "#1e3a8a",
    pageTint: "bg-white",
    card: "border-slate-200 bg-white",
    cardSoft: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    accent: "text-blue-800",
    muted: "text-slate-600",
    iconBg: "bg-slate-100",
    iconFg: "text-blue-800",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    pill: "bg-slate-100 text-slate-700",
    blobFrom: "from-transparent",
    blobTo: "to-transparent",
    cta: "bg-blue-900 text-white",
    ctaHover: "hover:bg-blue-950",
    ring: "ring-slate-100",
    statusBadge: "border-blue-200 bg-blue-50 text-blue-900",
  },
  red: {
    accentColor: "#e11d48",
    pageTint: "bg-white",
    card: "border-slate-200 bg-white",
    cardSoft: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    accent: "text-rose-700",
    muted: "text-slate-600",
    iconBg: "bg-rose-50",
    iconFg: "text-rose-700",
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    pill: "bg-rose-50 text-rose-800",
    blobFrom: "from-transparent",
    blobTo: "to-transparent",
    cta: "bg-rose-700 text-white",
    ctaHover: "hover:bg-rose-800",
    ring: "ring-rose-100",
    statusBadge: "border-rose-200 bg-rose-50 text-rose-800",
  },
  gray: {
    accentColor: "#64748b",
    pageTint: "bg-white",
    card: "border-slate-200 bg-white",
    cardSoft: "border-slate-200 bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-900",
    accent: "text-slate-600",
    muted: "text-slate-600",
    iconBg: "bg-slate-100",
    iconFg: "text-slate-600",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    pill: "bg-slate-100 text-slate-700",
    blobFrom: "from-transparent",
    blobTo: "to-transparent",
    cta: "bg-slate-700 text-white",
    ctaHover: "hover:bg-slate-800",
    ring: "ring-slate-100",
    statusBadge: "border-slate-200 bg-slate-100 text-slate-700",
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
