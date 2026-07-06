import { DecisionHero } from "@/components/report/DecisionHero";
import { PrivateSectorSecurityCertificationCallout } from "@/components/report/PrivateSectorSecurityCertificationCallout";
import { PublicSectorCsapWarning } from "@/components/report/PublicSectorCsapWarning";
import { RiskDimensionBars } from "@/components/report/RiskDimensionBars";
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
      {audienceReport.publicSectorCsapWarning && (
        <PublicSectorCsapWarning assessment={audienceReport.publicSectorCsapWarning} />
      )}
      {audienceReport.privateSectorSecurityCertWarning && (
        <PrivateSectorSecurityCertificationCallout
          assessment={audienceReport.privateSectorSecurityCertWarning}
        />
      )}
      <RiskDimensionBars dimensions={audienceReport.riskDimensions} />
    </div>
  );
}
