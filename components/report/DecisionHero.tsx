import { AlertTriangle, CheckCircle2, HelpCircle, Info } from "lucide-react";
import { CertificationNoticeBox } from "@/components/report/CertificationNoticeBox";
import { RiskScoreVisual } from "@/components/report/RiskScoreVisual";
import { PillTag } from "@/components/report/ui/PillTag";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import {
  type PrivacyDataType,
  RESPONDENT_DECISION_STYLES,
} from "@/lib/reporting/reportMessages";
import type { ScanReport } from "@/lib/types/scan";

interface DecisionHeroProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

function scopeLabel(report: ScanReport): string {
  if (report.isLimited || report.diagnosisStatus === "limited") return "진단 제한";
  if (report.form.partialScan) return "부분 진단";
  if (report.form.extractedFromHtml && report.platform === "generic") return "베타 진단";
  return "정밀 진단";
}

const privacyTypeLabels: Record<PrivacyDataType, string> = {
  minimal: "개인정보 거의 없음",
  quasi_only: "준식별정보만 있음",
  direct_identifier: "직접식별정보 있음",
  sensitive_or_high_risk: "민감·고위험정보 있음",
  limited: "진단 제한",
};

const privacyTypeTones: Record<
  PrivacyDataType,
  "safe" | "caution" | "warning" | "danger" | "neutral"
> = {
  minimal: "safe",
  quasi_only: "caution",
  direct_identifier: "warning",
  sensitive_or_high_risk: "danger",
  limited: "neutral",
};

const statusBadgeStyles: Record<string, string> = {
  "응답 가능": RESPONDENT_DECISION_STYLES.can_respond,
  "주의 필요": RESPONDENT_DECISION_STYLES.respond_with_caution,
  "확인 후 응답": RESPONDENT_DECISION_STYLES.check_before_responding,
  "위험": RESPONDENT_DECISION_STYLES.hold_response,
  "판단 불가": "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
};

export function DecisionHero({ report, audienceReport }: DecisionHeroProps) {
  const limited = audienceReport.isLimited;
  const assessment = audienceReport.privacyAssessment;
  const badgeStyle =
    statusBadgeStyles[assessment.statusBadge] ??
    RESPONDENT_DECISION_STYLES[audienceReport.respondentDecision];

  const DecisionIcon = limited
    ? HelpCircle
    : assessment.type === "minimal"
      ? CheckCircle2
      : assessment.type === "quasi_only"
        ? Info
        : AlertTriangle;

  const iconTone =
    assessment.type === "sensitive_or_high_risk"
      ? "rose"
      : assessment.type === "direct_identifier"
        ? "amber"
        : "navy";

  return (
    <section className="report-hero-card overflow-hidden">
      <div className="border-b border-[#dbeafe] bg-gradient-to-r from-[#eff6ff] to-transparent px-5 py-3.5 md:px-8">
        <p className="text-xs uppercase tracking-[0.14em] text-brand md:text-[13px]">
          핵심 진단 결과
        </p>
      </div>

      <div className="grid gap-8 p-5 md:grid-cols-[1fr_auto] md:items-start md:p-8">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs md:text-sm ${badgeStyle}`}
            >
              {assessment.statusBadge}
            </span>
            <PillTag tone={privacyTypeTones[assessment.type]} size="md">
              {privacyTypeLabels[assessment.type]}
            </PillTag>
            <span className="inline-flex items-center rounded-full border border-border-subtle bg-background px-3 py-1.5 text-xs text-muted md:text-sm">
              {scopeLabel(report)}
            </span>
          </div>

          <div className="flex gap-5">
            <ReportIconBadge icon={DecisionIcon} tone={iconTone} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-2xl leading-tight tracking-tight text-foreground md:text-4xl">
                {assessment.conclusion}
              </h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground md:text-lg">
                {assessment.inclusionSummary}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted md:text-[15px]">
                {assessment.respondentAdvice}
              </p>
              {assessment.highRiskNote && (
                <p className="mt-2 text-sm text-[#be123c] md:text-[15px]">
                  <span className="font-bold">{assessment.highRiskNote}</span>
                </p>
              )}
            </div>
          </div>

          {assessment.quickActions.length > 0 && (
            <div className="mt-7">
              <p className="mb-3 text-sm text-foreground md:text-[15px]">
                <span className="font-bold">판단 핵심 근거</span>
              </p>
              <ul className="grid gap-3 md:grid-cols-3">
                {assessment.quickActions.slice(0, 3).map((reason, index) => (
                  <li
                    key={reason}
                    className="report-summary-card flex gap-3 p-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b5bdb] to-[#1e3a8a] text-sm font-bold text-white shadow-[0_4px_12px_rgba(30,58,138,0.22)]">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground md:text-[15px]">
                      {reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {assessment.certificationNotice && (
            <CertificationNoticeBox notice={assessment.certificationNotice} />
          )}
        </div>

        <div className="flex justify-center md:justify-end">
          <RiskScoreVisual
            score={report.score}
            limited={limited}
            decision={audienceReport.respondentDecision}
            scoreEvaluation={assessment.scoreEvaluation}
          />
        </div>
      </div>
    </section>
  );
}
