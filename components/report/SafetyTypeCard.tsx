import { createElement } from "react";
import { Database, Wrench } from "lucide-react";
import { getSafetyTypeTheme } from "@/components/report/ui/safetyTypeTheme";
import type { SafetyTypeProfile } from "@/lib/reporting/safetyType";

interface SafetyTypeCardProps {
  safetyType: SafetyTypeProfile;
}

export function SafetyTypeCard({ safetyType }: SafetyTypeCardProps) {
  const theme = getSafetyTypeTheme(safetyType.tone);

  return (
    <section
      className={`relative overflow-hidden rounded-[2rem] border-2 shadow-[var(--report-shadow)] ${theme.card}`}
    >
      <div
        className={`pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br ${theme.blobFrom} ${theme.blobTo} blur-2xl`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-gradient-to-tr ${theme.blobFrom} ${theme.blobTo} blur-3xl`}
        aria-hidden
      />

      <div className="relative space-y-7 p-6 md:p-10">
        <div className="flex flex-wrap items-start gap-5 md:gap-7">
          <span
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] shadow-lg md:h-24 md:w-24 ${theme.iconBg} ${theme.iconFg}`}
          >
            {createElement(theme.Icon, {
              className: "h-10 w-10 md:h-12 md:w-12",
              strokeWidth: 2.25,
              "aria-hidden": true,
            })}
          </span>

          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-bold tracking-[0.08em] md:text-base ${theme.accent}`}
            >
              설문 안전유형
            </p>
            <h1
              className={`mt-2 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl ${theme.text}`}
            >
              {safetyType.displayName}
            </h1>
            <p
              className={`mt-4 text-2xl font-bold leading-snug md:text-3xl ${theme.text}`}
            >
              {safetyType.headline}
            </p>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted md:text-lg">
              {safetyType.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <span
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${theme.badge}`}
          >
            설문 주체: {safetyType.subjectLabel}
          </span>
          {safetyType.subjectEvidenceLabel ? (
            <span className="rounded-full border border-white/80 bg-white/85 px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm">
              {safetyType.subjectEvidenceLabel}
            </span>
          ) : null}
          {safetyType.subjectMatchMethodLabel ? (
            <span className="rounded-full border border-white/80 bg-white/85 px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm">
              {safetyType.subjectMatchMethodLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm">
            <Database className="h-3.5 w-3.5 text-muted" aria-hidden />
            수집정보: {safetyType.dataBadge}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm">
            <Wrench className="h-3.5 w-3.5 text-muted" aria-hidden />
            사용도구: {safetyType.toolBadge}
          </span>
          <span
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              /강력|CSAP|ISMS/.test(safetyType.toolJudgmentBadge)
                ? "border-[#c4b5fd] bg-[#ede9fe] text-[#5b21b6]"
                : "border-white/80 bg-white/85 text-foreground shadow-sm"
            }`}
          >
            도구 판단: {safetyType.toolJudgmentBadge}
          </span>
        </div>

        <div
          className={`rounded-2xl border bg-white/90 px-5 py-4 shadow-sm md:px-6 md:py-5 ${theme.border}`}
        >
          <p className={`text-sm font-bold tracking-wide ${theme.accent}`}>
            바로 해야 할 행동
          </p>
          <p className={`mt-1.5 text-lg font-bold leading-snug md:text-xl ${theme.text}`}>
            {safetyType.action}
          </p>
        </div>
      </div>
    </section>
  );
}
