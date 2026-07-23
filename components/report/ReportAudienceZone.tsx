import type { ReactNode } from "react";

export type ReportAudienceZoneVariant =
  | "respondent"
  | "operator"
  | "appendix"
  | "warning";

interface ReportAudienceZoneProps {
  variant: ReportAudienceZoneVariant;
  label: string;
  title: string;
  description?: string;
  bridgeNote?: string;
  children: ReactNode;
  id?: string;
}

/**
 * Section shells use muted professional tints so zones read as distinct
 * information spaces. Inner cards stay white for contrast.
 */
const VARIANT_STYLE: Record<
  ReportAudienceZoneVariant,
  {
    shell: string;
    label: string;
    title: string;
    bridge: string;
    rule: string;
  }
> = {
  respondent: {
    shell:
      "rounded-[1.25rem] border border-[#D7E3DF] bg-[#F4F8F6] p-5 md:p-7",
    label: "border border-[#B7D0C8] bg-white text-[#1F4D44]",
    title: "text-slate-900",
    bridge: "border-[#D7E3DF] bg-white/80 text-slate-700",
    rule: "border-[#C5D6CF]",
  },
  operator: {
    shell:
      "rounded-[1.25rem] border border-[#D8DEE8] bg-[#F2F4F8] p-5 md:p-7",
    label: "border border-[#C5CDD9] bg-white text-[#334155]",
    title: "text-slate-900",
    bridge: "border-[#D8DEE8] bg-white/80 text-slate-600",
    rule: "border-[#C8CFDB]",
  },
  appendix: {
    shell:
      "rounded-[1.25rem] border border-[#E4E0DA] bg-[#F6F4F1] p-5 md:p-6",
    label: "border border-[#D6D0C8] bg-white text-[#57534E]",
    title: "text-slate-800",
    bridge: "border-[#E4E0DA] bg-white/80 text-slate-600",
    rule: "border-[#D9D3CB]",
  },
  warning: {
    shell:
      "rounded-[1.25rem] border border-[#E8D9D6] bg-[#F9F4F3] p-5 md:p-7",
    label: "border border-[#DEC8C4] bg-white text-[#7F1D1D]",
    title: "text-slate-900",
    bridge: "border-[#E8D9D6] bg-white/80 text-slate-700",
    rule: "border-[#DFCEC9]",
  },
};

export function ReportAudienceZone({
  variant,
  label,
  title,
  description,
  bridgeNote,
  children,
  id,
}: ReportAudienceZoneProps) {
  const style = VARIANT_STYLE[variant];

  return (
    <section
      id={id}
      className={`scroll-mt-8 space-y-0 ${style.shell}`}
    >
      <header className="space-y-2 pb-5 md:pb-6">
        <span
          className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide ${style.label}`}
        >
          {label}
        </span>
        <div>
          <h2
            className={`text-xl font-bold tracking-tight md:text-2xl ${style.title}`}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {bridgeNote ? (
          <p
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${style.bridge}`}
          >
            {bridgeNote}
          </p>
        ) : null}
      </header>

      <div className={`border-t ${style.rule}`} aria-hidden />

      <div className="pt-5 md:pt-6">{children}</div>
    </section>
  );
}
