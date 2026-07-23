import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FormInput,
  Globe,
  HelpCircle,
  Layers,
} from "lucide-react";
import type { Platform } from "@/lib/types/scan";

export type PlatformMarkSource = "url" | "file" | undefined;

interface PlatformMarkProps {
  platform?: Platform | string | null;
  source?: PlatformMarkSource;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

type MarkStyle = {
  bg: string;
  fg: string;
  border: string;
  ring: string;
  letter?: string;
  Icon?: LucideIcon;
};

function resolveKey(
  platform?: Platform | string | null,
  source?: PlatformMarkSource,
  label?: string,
): string {
  if (source === "file") return "file";
  const raw = `${platform ?? ""} ${label ?? ""}`.toLowerCase();
  if (/google|구글/.test(raw)) return "google_forms";
  if (/naver|네이버/.test(raw)) return "naver_forms";
  if (/moa|모아/.test(raw)) return "moaform";
  if (/wiseon|csap/.test(raw)) return "wiseon_csap";
  if (/file|파일|docx|xlsx|pdf|hwpx/.test(raw)) return "file";
  if (platform === "google_forms") return "google_forms";
  if (platform === "naver_forms") return "naver_forms";
  if (platform === "moaform") return "moaform";
  if (platform === "wiseon_csap") return "wiseon_csap";
  if (platform === "generic") return "generic";
  return "unknown";
}

const STYLES: Record<string, MarkStyle> = {
  google_forms: {
    bg: "bg-[#F3E8FF]",
    fg: "text-[#6D28D9]",
    border: "border-[#DDD6FE]",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
    letter: "G",
  },
  naver_forms: {
    bg: "bg-[#ECFDF5]",
    fg: "text-[#047857]",
    border: "border-[#A7F3D0]",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
    letter: "N",
  },
  moaform: {
    bg: "bg-[#EFF6FF]",
    fg: "text-[#1D4ED8]",
    border: "border-[#BFDBFE]",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
    Icon: Layers,
  },
  wiseon_csap: {
    bg: "bg-[#F0FDFA]",
    fg: "text-[#0F766E]",
    border: "border-[#99F6E4]",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
    letter: "W",
  },
  file: {
    bg: "bg-slate-100",
    fg: "text-slate-700",
    border: "border-slate-200",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
    Icon: FileText,
  },
  generic: {
    bg: "bg-slate-100",
    fg: "text-slate-700",
    border: "border-slate-200",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
    Icon: FormInput,
  },
  unknown: {
    bg: "bg-slate-100",
    fg: "text-slate-600",
    border: "border-slate-200",
    ring: "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
    Icon: HelpCircle,
  },
};

const SIZE = {
  sm: { wrap: "h-9 w-9 text-sm", icon: 16 },
  md: { wrap: "h-11 w-11 text-base", icon: 20 },
  lg: { wrap: "h-12 w-12 text-lg", icon: 22 },
};

/**
 * Favicon-like platform mark without external trademark image downloads.
 */
export function PlatformMark({
  platform,
  source,
  label,
  size = "md",
  className = "",
}: PlatformMarkProps) {
  const key = resolveKey(platform, source, label);
  const style = STYLES[key] ?? STYLES.unknown;
  const dim = SIZE[size];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border font-bold ${dim.wrap} ${style.bg} ${style.fg} ${style.border} ${style.ring} ${className}`}
      aria-hidden
      title={label}
    >
      {style.letter ? (
        style.letter
      ) : style.Icon ? (
        <style.Icon size={dim.icon} strokeWidth={2.25} />
      ) : (
        <Globe size={dim.icon} strokeWidth={2.25} />
      )}
    </span>
  );
}
