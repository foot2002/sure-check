import { Sparkles } from "lucide-react";
import { ShareActions } from "@/components/ShareActions";
import { DetailedEvidenceSection } from "@/components/report/DetailedEvidenceSection";
import { DeveloperDiagnosticsSection } from "@/components/report/DeveloperDiagnosticsSection";
import { OperatorImprovementPanel } from "@/components/report/OperatorImprovementPanel";
import { UserSafetyReport } from "@/components/report/UserSafetyReport";
import { InfoCallout } from "@/components/report/ui/InfoCallout";
import { TrustNoticePanel } from "@/components/report/ui/TrustNoticePanel";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import type { ScanReport } from "@/lib/types/scan";

interface ReportViewProps {
  report: ScanReport;
}

export function ReportView({ report }: ReportViewProps) {
  const audienceReport = composeAudienceReport(report);

  return (
    <div className="report-readable report-shell space-y-12 md:space-y-16">
      <header className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-700 text-white shadow-md">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold tracking-[0.12em] text-teal-700">
            SURE Check
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            설문 안전유형 리포트
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

      <UserSafetyReport audienceReport={audienceReport} />

      <OperatorImprovementPanel audienceReport={audienceReport} />

      <DetailedEvidenceSection report={report} audienceReport={audienceReport} />

      <div className="report-secondary space-y-6">
        <DeveloperDiagnosticsSection report={report} />
        <ShareActions report={report} />
        <TrustNoticePanel report={report} />
      </div>
    </div>
  );
}
