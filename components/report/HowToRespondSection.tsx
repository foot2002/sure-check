import { createElement } from "react";
import { Check, Circle } from "lucide-react";
import {
  getSafetyTypeSecondaryIcon,
  getSafetyTypeTheme,
} from "@/components/report/ui/safetyTypeTheme";
import type { DecisionSummary } from "@/lib/reporting/reportMessages";
import type { SafetyTypeTone } from "@/lib/reporting/safetyType";
import {
  HOW_TO_RESPOND_OPTIONS,
  VERDICT_COPY,
  type VerdictType,
} from "@/lib/reporting/verdictTypes";

interface HowToRespondSectionProps {
  decision: DecisionSummary;
  tone?: SafetyTypeTone;
  actionHint?: string;
}

function isActive(optionVerdicts: VerdictType[], current: VerdictType): boolean {
  return optionVerdicts.includes(current);
}

export function HowToRespondSection({
  decision,
  tone = "green",
  actionHint,
}: HowToRespondSectionProps) {
  const copy = VERDICT_COPY[decision.verdictType];
  const theme = getSafetyTypeTheme(tone);

  return (
    <section className={`relative overflow-hidden rounded-[1.75rem] border-2 ${theme.card}`}>
      <div
        className={`pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-gradient-to-br ${theme.blobFrom} ${theme.blobTo} blur-2xl`}
        aria-hidden
      />

      <div className="relative space-y-5 p-5 md:p-8">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            이 설문을 어떻게 해야 하나요?
          </h3>
          <p className="mt-1 text-base text-muted">
            성격유형 결과의 추천 행동처럼, 지금 바로 따를 한 가지입니다.
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-white/80 bg-white/95 p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-md ${theme.iconBg} text-white`}
            >
              {createElement(getSafetyTypeSecondaryIcon(tone), { className: "h-8 w-8", "aria-hidden": true })}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <p className={`text-sm font-bold tracking-wide ${theme.accent}`}>
                권장 행동
              </p>
              <p className={`text-2xl font-extrabold leading-snug md:text-3xl ${theme.text}`}>
                {copy.howToRespond}
              </p>
              <p className="text-base leading-relaxed text-muted md:text-lg">
                {decision.actionDescription || copy.actionDescription}
              </p>
              {decision.isReportRecommended && (
                <p className="text-base leading-relaxed text-[#9f1239]">
                  신고는 의무가 아닙니다. 처리 기준이 불명확할 때 운영기관 문의
                  또는 신고를 검토하세요.
                </p>
              )}
              <div
                className={`report-btn-primary mt-2 inline-flex ${theme.cta} ${theme.ctaHover} shadow-md`}
                role="status"
              >
                {actionHint || copy.actionLabel}
              </div>
            </div>
          </div>
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_TO_RESPOND_OPTIONS.map((option) => {
            const active = isActive(option.verdicts, decision.verdictType);
            return (
              <li
                key={option.id}
                className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3.5 text-base ${
                  active
                    ? `${theme.border} ${theme.pill} font-bold ring-2 ${theme.ring}`
                    : "border-border-subtle bg-white/70 text-muted"
                }`}
              >
                {active ? (
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 opacity-35" aria-hidden />
                )}
                {option.label}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
