import { ShieldCheck } from "lucide-react";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { ToolGovernanceSummary } from "@/lib/reporting/reportMessages";

interface ToolGovernanceSectionProps {
  summary: ToolGovernanceSummary;
}

export function ToolGovernanceSection({ summary }: ToolGovernanceSectionProps) {
  if (!summary.showSection) return null;

  return (
    <section className="report-summary-card overflow-hidden p-5 md:p-6">
      <SectionHeader
        icon={ShieldCheck}
        title={summary.title}
        description={summary.body}
      />

      <div className="mt-4 rounded-2xl border border-[#c7d7f5] bg-[#f8faff] p-4 md:p-5">
        <p className="text-[15px] leading-relaxed text-foreground md:text-base">
          <span className="font-bold">{summary.certificationRecommendation}</span>
        </p>
        {summary.certificationReason && (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {summary.certificationReason}
          </p>
        )}
        {summary.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {summary.bullets.map((bullet) => (
              <li
                key={bullet}
                className="text-sm leading-relaxed text-foreground"
              >
                · {bullet}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.isCsapStronglyRecommended && (
            <span className="rounded-full border border-[#f5c2cc] bg-[#fdf0f2] px-3 py-1 text-xs font-semibold text-[#9e2a3e]">
              CSAP 강력 권고
            </span>
          )}
          {summary.isIsmsPRecommended && (
            <span className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#1e40af]">
              ISMS-P 권고
            </span>
          )}
          {summary.isCertifiedToolRecommended && (
            <span className="rounded-full border border-[#f0ddb0] bg-[#fdf6e8] px-3 py-1 text-xs font-semibold text-[#8a5f12]">
              보안인증 도구 권고
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
