import type { ReactNode } from "react";

export type ReportAudienceZoneVariant = "respondent" | "operator" | "appendix";

interface ReportAudienceZoneProps {
  variant: ReportAudienceZoneVariant;
  label: string;
  title: string;
  description: string;
  bridgeNote?: string;
  children: ReactNode;
  id?: string;
}

const VARIANT_STYLE: Record<
  ReportAudienceZoneVariant,
  {
    shell: string;
    label: string;
    title: string;
    bridge: string;
  }
> = {
  respondent: {
    shell:
      "rounded-[2rem] border-2 border-teal-200/80 bg-gradient-to-b from-white via-[#f0fdfa]/40 to-white p-5 shadow-[var(--report-shadow)] md:p-8",
    label: "bg-teal-700 text-white",
    title: "text-foreground",
    bridge: "border-teal-100 bg-teal-50/80 text-teal-900",
  },
  operator: {
    shell:
      "rounded-[2rem] border border-slate-300 bg-[#f8fafc] p-5 shadow-[var(--report-shadow-soft)] md:p-8",
    label: "bg-slate-700 text-white",
    title: "text-slate-900",
    bridge: "border-slate-200 bg-white text-slate-700",
  },
  appendix: {
    shell:
      "rounded-[1.75rem] border border-slate-200 bg-slate-50/90 p-5 md:p-7",
    label: "bg-slate-500 text-white",
    title: "text-slate-800",
    bridge: "border-slate-200 bg-white text-slate-600",
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
    <section id={id} className={`scroll-mt-8 space-y-8 md:space-y-10 ${style.shell}`}>
      <header className="space-y-3">
        <span
          className={`inline-flex rounded-full px-3.5 py-1.5 text-sm font-bold tracking-wide ${style.label}`}
        >
          {label}
        </span>
        <div>
          <h2
            className={`text-2xl font-extrabold tracking-tight md:text-3xl ${style.title}`}
          >
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted md:text-lg">
            {description}
          </p>
        </div>
        {bridgeNote ? (
          <p
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold md:text-base ${style.bridge}`}
          >
            {bridgeNote}
          </p>
        ) : null}
      </header>
      <div className="space-y-8 md:space-y-10">{children}</div>
    </section>
  );
}
