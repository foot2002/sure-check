import { Sparkles } from "lucide-react";
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
    <div className="report-readable report-shell space-y-14 md:space-y-20">
      <header className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-700 text-white shadow-md">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold tracking-[0.12em] text-teal-700">
            SURE Check
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            응답 판단 리포트
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

      <ReportAudienceZone
        variant="respondent"
        label="응답자용"
        title="나의 응답 판단"
        description="이 설문에 지금 어떻게 응답하면 되는지 바로 확인하세요."
      >
        <UserSafetyReport audienceReport={audienceReport} />
      </ReportAudienceZone>

      <EvidenceActionPanel report={report} audienceReport={audienceReport} />

      <ReportAudienceZone
        id="operator-report"
        variant="operator"
        label="기관·기업 담당자용"
        title="설문 개선 리포트"
        description="설문 담당자가 먼저 확인하고 고쳐야 할 항목입니다."
        bridgeNote="여기부터는 설문 운영자용입니다."
      >
        <OperatorImprovementPanel audienceReport={audienceReport} />
        <DetailedEvidenceSection report={report} audienceReport={audienceReport} />
      </ReportAudienceZone>

      <ReportAudienceZone
        variant="appendix"
        label="부록"
        title="설문/문항 정보 보기"
        description="진단에 사용된 설문 기본정보, 안내문, 문항 원문을 확인할 수 있습니다."
        bridgeNote="아래 정보는 진단에 사용된 설문 기본정보와 문항 원문입니다. 판단 결과가 아니라 참고용 자료입니다."
      >
        <SurveySourceAppendix report={report} audienceReport={audienceReport} />
      </ReportAudienceZone>

      <div className="space-y-6">
        <ShareActions report={report} />
        <TrustNoticePanel report={report} />
        {showDeveloperDiagnostics ? (
          <DeveloperDiagnosticsSection report={report} />
        ) : null}
      </div>
    </div>
  );
}
