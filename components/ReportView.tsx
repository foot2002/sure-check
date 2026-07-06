import { ClipboardCheck } from "lucide-react";
import { DebugPanel } from "@/components/DebugPanel";
import { ShareActions } from "@/components/ShareActions";
import { CollectedDataVisual } from "@/components/report/CollectedDataVisual";
import { CompactEvidenceAccordion } from "@/components/report/CompactEvidenceAccordion";
import { CopyableNoticeTemplates } from "@/components/report/CopyableNoticeTemplates";
import { KeyReasonsGrid } from "@/components/report/KeyReasonsGrid";
import { OperatorFixDashboard } from "@/components/report/OperatorFixDashboard";
import { ReportVisualSummary } from "@/components/report/ReportVisualSummary";
import { RespondentChecklist } from "@/components/report/RespondentChecklist";
import { InfoCallout } from "@/components/report/ui/InfoCallout";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import { TrustNoticePanel } from "@/components/report/ui/TrustNoticePanel";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { isExtractionLimitedReport } from "@/lib/scan/limitedReport";
import type { ScanReport } from "@/lib/types/scan";

interface ReportViewProps {
  report: ScanReport;
}

export function ReportView({ report }: ReportViewProps) {
  const limited = isExtractionLimitedReport(report);
  const audienceReport = composeAudienceReport(report);

  return (
    <div className="report-readable space-y-10 md:space-y-12">
      <header className="flex items-center gap-4 border-b border-border-subtle pb-5">
        <ReportIconBadge icon={ClipboardCheck} tone="navy" size="lg" />
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-brand">
            Privacy Risk Report
          </p>
          <h1 className="text-xl tracking-tight text-foreground md:text-2xl">
            <span className="font-bold">개인정보 위험 진단 리포트</span>
          </h1>
        </div>
      </header>

      {report.limitationReasons && report.limitationReasons.length > 0 && (
        <InfoCallout title="진단 제한 안내" variant="warning">
          <ul className="space-y-1.5">
            {report.limitationReasons.map((reason, i) => (
              <li key={i}>· {reason}</li>
            ))}
          </ul>
        </InfoCallout>
      )}

      <ReportVisualSummary report={report} audienceReport={audienceReport} />

      <KeyReasonsGrid reasons={audienceReport.keyReasons} />

      {!limited && (
        <>
          <CollectedDataVisual summary={audienceReport.collectedDataSummary} />
          <OperatorFixDashboard audienceReport={audienceReport} />
          <DebugPanel report={report} />
          <RespondentChecklist audienceReport={audienceReport} />
          <CopyableNoticeTemplates templates={audienceReport.copyableTemplates} />
        </>
      )}

      {limited && <DebugPanel report={report} />}

      <div className="report-secondary space-y-6">
        <CompactEvidenceAccordion
          report={report}
          audienceReport={audienceReport}
        />
        <ShareActions report={report} />
        <TrustNoticePanel report={report} />
      </div>
    </div>
  );
}
