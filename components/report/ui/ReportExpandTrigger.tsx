import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ReportSubsectionProps {
  children: ReactNode;
  /** Draw a refined hairline above this block */
  ruled?: boolean;
  className?: string;
}

/** Separates major content blocks inside a tinted report section. */
export function ReportSubsection({
  children,
  ruled = false,
  className = "",
}: ReportSubsectionProps) {
  return (
    <div
      className={`${ruled ? "report-subsection-ruled" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

interface ReportExpandTriggerProps {
  open: boolean;
  title: string;
  description?: string;
  icon?: LucideIcon;
  onClick: () => void;
  /** Compact single-line style for secondary collapses */
  compact?: boolean;
  /**
   * primary: dark navy content expand (세부 근거 등)
   * soft: muted utility expand (파일 첨부 등)
   */
  tone?: "primary" | "soft";
  className?: string;
}

/**
 * Expandable control. Use primary for content panels, soft for optional utilities.
 */
export function ReportExpandTrigger({
  open,
  title,
  description,
  icon: Icon,
  onClick,
  compact = false,
  tone = "primary",
  className = "",
}: ReportExpandTriggerProps) {
  const soft = tone === "soft";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`group ${
        soft ? "report-expand-trigger-soft" : "report-expand-trigger"
      } ${compact ? "report-expand-trigger-compact" : ""} ${className}`.trim()}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3.5 text-left">
        {Icon ? (
          <span
            className={
              soft
                ? "report-expand-trigger-icon-soft"
                : "report-expand-trigger-icon"
            }
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          </span>
        ) : null}
        <span className="min-w-0">
          <span
            className={`block text-[15px] font-bold tracking-tight md:text-base ${
              soft ? "text-slate-800" : "text-white"
            }`}
          >
            {title}
          </span>
          {description && !compact ? (
            <span
              className={`mt-1 block text-sm font-normal leading-relaxed ${
                soft ? "text-slate-500" : "text-slate-300"
              }`}
            >
              {description}
            </span>
          ) : null}
          {description && compact && soft ? (
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              {description}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className={`hidden rounded-md px-2.5 py-1 text-xs font-semibold sm:inline ${
            soft
              ? "border border-slate-200 bg-white text-slate-600"
              : "border border-white/20 bg-white/10 text-white"
          }`}
        >
          {open ? "접기" : soft ? "열기" : "펼쳐보기"}
        </span>
        <ChevronDown
          className={`h-5 w-5 transition-transform ${
            soft ? "text-slate-500" : "text-white/90"
          } ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </span>
    </button>
  );
}
