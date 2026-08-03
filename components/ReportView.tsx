import { ShareActions } from "@/components/ShareActions";
import { DetailedEvidenceSection } from "@/components/report/DetailedEvidenceSection";
import { DeveloperDiagnosticsSection } from "@/components/report/DeveloperDiagnosticsSection";
import { EvidenceActionPanel } from "@/components/report/EvidenceActionPanel";
import { FilePreDeployReport } from "@/components/report/FilePreDeployReport";
import { OperatorImprovementPanel } from "@/components/report/OperatorImprovementPanel";
import { ReportAudienceZone } from "@/components/report/ReportAudienceZone";
import { SafetyTypeCard } from "@/components/report/SafetyTypeCard";
import { SurveySourceAppendix } from "@/components/report/SurveySourceAppendix";
import { UserSafetyReport } from "@/components/report/UserSafetyReport";
import { InfoCallout } from "@/components/report/ui/InfoCallout";
import { TrustNoticePanel } from "@/components/report/ui/TrustNoticePanel";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { isFileSourceReport } from "@/lib/reporting/buildFilePreDeployReport";
import {
  ENDED_SURVEY_HEADLINE,
  isEndedSurveyReport,
} from "@/lib/scan/nonActionableForm";
import type { ScanReport } from "@/lib/types/scan";

interface ReportViewProps {
  report: ScanReport;
}

function EndedSurveyReportView({ report }: { report: ScanReport }) {
  const reason =
    report.limitedReason ||
    report.form?.limitedReason ||
    "응답이 종료되었거나 마감된 설문입니다.";

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

      <section className="report-inner-card p-5 md:p-7">
        <p className="text-xs font-semibold tracking-wide text-slate-500">
          응답 판단
        </p>
        <span className="mt-2 inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          종료된 설문
        </span>
        <h2 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-slate-900 md:text-[1.75rem]">
          {ENDED_SURVEY_HEADLINE}
        </h2>
        <p className="mt-2 text-[15px] font-semibold leading-relaxed text-slate-600">
          응답이 종료되어 더 이상 문항을 확인할 수 없습니다.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">{reason}</p>
      </section>

      <TrustNoticePanel report={report} />
    </div>
  );
}

export function ReportView({ report }: ReportViewProps) {
  // Incomplete hydrate (e.g. HTTP 202 body mistaken for a report) — recover via limited shell.
  if (!report?.form) {
    const reason =
      report?.limitedReason ||
      report?.summary ||
      (typeof (report as unknown as { error?: string } | null)?.error ===
      "string"
        ? (report as unknown as { error: string }).error
        : null);
    if (report?.isLimited || report?.scanStatus === "limited" || reason) {
      const shell: ScanReport = {
        scanId: report.scanId || "unknown",
        formUrl: report.formUrl || "",
        platform: report.platform || "generic",
        mockKey: report.mockKey || "generic_unknown_warning",
        diagnosisStatus: "limited",
        isLimited: true,
        limitedReason: reason || "진단이 제한되었습니다.",
        summary: reason || "진단이 제한되었습니다.",
        confidence: "none",
        scanStatus: "limited",
        limitationReasons: report.limitationReasons || [reason || "진단 제한"],
        sections: report.sections || {
          dataCollectionRisk: "",
          toolProcessingRisk: "",
          noticeConsentGap: "",
          managementRisk: "",
          detectedPersonalData: [],
          missingObligations: [],
          respondentGuidance: [],
          operatorRecommendations: [],
          evidenceItems: [],
          legalBasisSummary: "",
          disclaimer: "",
        },
        findings: report.findings || [],
        form: {
          platform: report.platform || "generic",
          title: "진단 제한",
          url: report.formUrl || "",
          questions: [],
          hasPrivacyNotice: false,
          hasConsent: false,
          hasRetentionNotice: false,
          hasOverseasTransferNotice: false,
          isLimited: true,
          limitedReason: reason || "진단이 제한되었습니다.",
        },
        createdAt: report.createdAt || new Date().toISOString(),
        completedAt: report.completedAt || new Date().toISOString(),
        debug: report.debug,
      };
      if (isEndedSurveyReport(shell)) {
        return <EndedSurveyReportView report={shell} />;
      }
      try {
        const audienceReport = composeAudienceReport(shell);
        return (
          <div className="report-readable report-stack">
            <SafetyTypeCard safetyType={audienceReport.safetyType} />
            <TrustNoticePanel report={shell} />
          </div>
        );
      } catch {
        /* fall through */
      }
    }
    return (
      <div className="rounded-2xl border border-[#f5c2cc] bg-[#fdf0f2] p-8 text-center">
        <p className="text-sm text-[#9e2a3e]">
          진단 결과를 불러오는 중이거나 아직 준비되지 않았습니다. 잠시 후 다시
          시도해 주세요.
        </p>
      </div>
    );
  }

  if (isEndedSurveyReport(report)) {
    return <EndedSurveyReportView report={report} />;
  }

  let audienceReport;
  try {
    audienceReport = composeAudienceReport(report);
  } catch (err) {
    console.error("[ReportView] composeAudienceReport failed:", err);
    return (
      <div className="rounded-2xl border border-[#f5c2cc] bg-[#fdf0f2] p-8 text-center">
        <p className="text-sm text-[#9e2a3e]">
          리포트 생성 중 오류가 발생했습니다. 다시 진단해 주세요.
        </p>
      </div>
    );
  }

  if (audienceReport.safetyType.hideJudgmentDetails) {
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
        <SafetyTypeCard safetyType={audienceReport.safetyType} />
        <TrustNoticePanel report={report} />
      </div>
    );
  }

  const showDeveloperDiagnostics = process.env.NODE_ENV === "development";
  const isFileReport = isFileSourceReport(report);

  if (isFileReport) {
    return (
      <div className="report-readable report-stack">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              SURE Check
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 md:text-[1.75rem]">
              설문파일 배포 전 진단 리포트
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

        <FilePreDeployReport report={report} />

        <ReportAudienceZone
          variant="appendix"
          label="부록"
          title="추출 원문·상세 근거"
          description="파일에서 읽은 문항·고지 원문과 세부 산출 근거입니다."
        >
          <DetailedEvidenceSection
            report={report}
            audienceReport={audienceReport}
          />
          <div className="report-subsection-ruled mt-4">
            <SurveySourceAppendix
              report={report}
              audienceReport={audienceReport}
            />
          </div>
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
