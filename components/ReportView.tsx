import { ShareActions } from "@/components/ShareActions";
import { DetailedEvidenceSection } from "@/components/report/DetailedEvidenceSection";
import { DeveloperDiagnosticsSection } from "@/components/report/DeveloperDiagnosticsSection";
import { EvidenceActionPanel } from "@/components/report/EvidenceActionPanel";
import { OperatorImprovementPanel } from "@/components/report/OperatorImprovementPanel";
import { ReportAudienceZone } from "@/components/report/ReportAudienceZone";
import { SurveySourceAppendix } from "@/components/report/SurveySourceAppendix";
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
  const showDeveloperDiagnostics = process.env.NODE_ENV === "development";

  return (
    <div className="report-readable report-stack">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            SURE Check
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 md:text-[1.75rem]">
            개인정보 리스크 진단 리포트
          </h1>
        </div>
        <ShareActions report={report} variant="toolbar" />
      </div>

      {report.limitationReasons && report.limitationReasons.length > 0 && (
        <InfoCallout title="진단 제한 안내" variant="warning">
          <ul className="space-y-1">
            {report.limitationReasons.map((reason, i) => (
              <li key={i}>· {reason}</li>
            ))}
          </ul>
        </InfoCallout>
      )}

      <ReportAudienceZone
        variant="respondent"
        label="응답자용 진단"
        title="나의 응답 판단"
        description="이 설문에 지금 어떻게 응답하면 되는지 확인하세요."
      >
        <UserSafetyReport report={report} audienceReport={audienceReport} />
      </ReportAudienceZone>

      <EvidenceActionPanel report={report} audienceReport={audienceReport} />

      <ReportAudienceZone
        id="operator-report"
        variant="operator"
        label="기관·기업 담당자용"
        title="설문 개선 리포트"
        description="설문 담당자가 먼저 확인하고 고쳐야 할 항목입니다."
      >
        <OperatorImprovementPanel audienceReport={audienceReport} />
        <div className="report-subsection-ruled">
          <DetailedEvidenceSection
            report={report}
            audienceReport={audienceReport}
          />
        </div>
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="appendix"
        label="부록"
        title="설문/문항 정보 보기"
        description="진단에 사용된 설문 기본정보, 안내문, 문항 원문을 확인할 수 있습니다."
      >
        <SurveySourceAppendix report={report} audienceReport={audienceReport} />
      </ReportAudienceZone>

      <div className="space-y-5 border-t border-slate-200 pt-2">
        <TrustNoticePanel report={report} />
        {showDeveloperDiagnostics ? (
          <DeveloperDiagnosticsSection report={report} />
        ) : null}
      </div>
    </div>
  );
}
