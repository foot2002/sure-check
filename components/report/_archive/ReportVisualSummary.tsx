import { DecisionHero } from "@/components/report/DecisionHero";
import { UserEvidenceCards } from "@/components/report/UserEvidenceCards";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { ScanReport } from "@/lib/types/scan";

interface ReportVisualSummaryProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

export function ReportVisualSummary({
  report,
  audienceReport,
}: ReportVisualSummaryProps) {
  return (
    <div className="space-y-8">
      <DecisionHero report={report} audienceReport={audienceReport} />
      <UserEvidenceCards
        cards={audienceReport.userEvidenceCards}
        tone={audienceReport.safetyType.tone}
      />
    </div>
  );
}
