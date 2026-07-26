import {
  RESPONDENT_DECISION_LABELS,
  RESPONDENT_DECISION_STYLES,
  type AudienceReport,
} from "@/lib/reporting/reportMessages";

interface RespondentDecisionCardProps {
  audienceReport: AudienceReport;
}

export function RespondentDecisionCard({
  audienceReport,
}: RespondentDecisionCardProps) {
  const label = audienceReport.isLimited
    ? "진단 제한"
    : RESPONDENT_DECISION_LABELS[audienceReport.respondentDecision];
  const style = audienceReport.isLimited
    ? "border-[#d1d5db] bg-[#f3f4f6] text-[#4b5563]"
    : RESPONDENT_DECISION_STYLES[audienceReport.respondentDecision];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <h2 className="text-base font-semibold text-foreground">응답 판단</h2>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${style}`}
          >
            {label}
          </span>
        </div>
        <p className="text-[15px] font-medium leading-relaxed text-foreground">
          {audienceReport.respondentDecisionTitle}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          {audienceReport.respondentDecisionSummary}
        </p>

        {audienceReport.respondentReasons.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {audienceReport.respondentReasons.slice(0, 3).map((reason) => (
              <li key={reason} className="flex gap-2 text-[13px] text-muted">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand/60" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {audienceReport.noticeSummary && (
        <div className="border-t border-border-subtle bg-background px-5 py-3 md:px-6">
          <p className="text-[12px] text-muted">{audienceReport.noticeSummary}</p>
        </div>
      )}
    </section>
  );
}
