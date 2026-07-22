import { DecisionHero } from "@/components/report/DecisionHero";
import { HowToRespondSection } from "@/components/report/HowToRespondSection";
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
      <HowToRespondSection
        decision={audienceReport.decisionSummary}
        tone={audienceReport.safetyType.tone}
        actionHint={audienceReport.safetyType.action}
      />
    </div>
  );
}
