import { createElement } from "react";
import { getSafetyTypeTheme } from "@/components/report/ui/safetyTypeTheme";
import type { SafetyTypeProfile } from "@/lib/reporting/safetyType";

interface SafetyTypeCardProps {
  safetyType: SafetyTypeProfile;
}

export function SafetyTypeCard({ safetyType }: SafetyTypeCardProps) {
  const theme = getSafetyTypeTheme(safetyType.tone);

  const metaBadges = [
    { key: "method", label: `진단 방식 · ${safetyType.diagnosisMethodLabel}` },
    ...(safetyType.fileNameLabel
      ? [{ key: "file", label: `파일명 · ${safetyType.fileNameLabel}` }]
      : []),
    { key: "subject", label: `설문 주체 · ${safetyType.subjectLabel}` },
    { key: "data", label: `수집정보 · ${safetyType.dataBadge}` },
    { key: "tool", label: `사용도구 · ${safetyType.toolBadge}` },
  ].slice(0, 5);

  return (
    <section className="report-inner-card p-5 md:p-7">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <span
            className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${theme.iconBg} ${theme.iconFg} border-slate-200/80`}
          >
            {createElement(theme.Icon, {
              className: "h-6 w-6",
              strokeWidth: 2,
              "aria-hidden": true,
            })}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold tracking-wide text-slate-500">
                응답 판단
              </p>
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${theme.statusBadge}`}
              >
                {safetyType.displayName}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-snug tracking-tight text-slate-900 md:text-[1.75rem]">
              {safetyType.headline}
            </h1>
            <p
              className={`mt-2 text-[15px] font-semibold leading-relaxed ${theme.accent}`}
            >
              {safetyType.howToAct}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {metaBadges.map((badge) => (
            <span key={badge.key} className="report-badge-neutral">
              {badge.label}
            </span>
          ))}
          <span className="report-badge-neutral">
            도구 판단 · {safetyType.toolJudgmentBadge}
          </span>
        </div>

        <div className="grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3">
          <div className="report-inner-muted p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              왜 문제인가요?
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
              {safetyType.whyProblem}
            </p>
          </div>
          <div className="report-inner-muted p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              {safetyType.legalOrLimitTitle}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
              {safetyType.legalOrLimitBody}
            </p>
          </div>
          <div className="report-inner-muted p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500">
              어떻게 해야 하나요?
            </p>
            <p className="mt-2 text-[15px] font-semibold leading-relaxed text-slate-900">
              {safetyType.howToAct}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
