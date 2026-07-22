"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, Info, ShieldAlert } from "lucide-react";
import { RiskScoreVisual } from "@/components/report/RiskScoreVisual";
import { PillTag } from "@/components/report/ui/PillTag";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import type { AudienceReport, PrivacyDataType } from "@/lib/reporting/reportMessages";
import { VERDICT_STYLES, type VerdictType } from "@/lib/reporting/verdictTypes";
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

function decisionIcon(verdict: VerdictType) {
  switch (verdict) {
    case "SAFE_TO_RESPOND":
      return CheckCircle2;
    case "RESPOND_WITH_CAUTION":
      return Info;
    case "LIMITED_DIAGNOSIS":
      return HelpCircle;
    case "REPORT_OR_INQUIRE":
      return ShieldAlert;
    default:
      return AlertTriangle;
  }
}

function iconTone(verdict: VerdictType): "navy" | "amber" | "rose" {
  if (verdict === "DO_NOT_RESPOND" || verdict === "REPORT_OR_INQUIRE") return "rose";
  if (verdict === "CHECK_NOTICE_BEFORE_INPUT") return "amber";
  return "navy";
}

export function DecisionHero({ report, audienceReport }: DecisionHeroProps) {
  const decision = audienceReport.decisionSummary;
  const verdict = decision.verdictType;
  const DecisionIcon = decisionIcon(verdict);
  const badgeStyle = VERDICT_STYLES[verdict];

  return (
    <section className="report-hero-card overflow-hidden">
      <div className="border-b border-[#dbeafe] bg-gradient-to-r from-[#eff6ff] to-transparent px-5 py-3.5 md:px-8">
        <p className="text-xs uppercase tracking-[0.14em] text-brand md:text-[13px]">
          응답 판단
        </p>
      </div>

      <div className="grid gap-8 p-5 md:grid-cols-[1fr_auto] md:items-start md:p-8">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs md:text-sm ${badgeStyle}`}
            >
              {decision.statusBadge}
            </span>
            <PillTag tone={privacyTypeTones[decision.privacyDataType]} size="md">
              {privacyTypeLabels[decision.privacyDataType]}
            </PillTag>
            <span className="inline-flex items-center rounded-full border border-border-subtle bg-background px-3 py-1.5 text-xs text-muted md:text-sm">
              {scopeLabel(report)}
            </span>
          </div>

          <div className="flex gap-5">
            <ReportIconBadge icon={DecisionIcon} tone={iconTone(verdict)} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-2xl leading-tight tracking-tight text-foreground md:text-4xl md:leading-[1.15]">
                <span className="font-bold">{decision.headline}</span>
              </h1>
              <div className="mt-4 rounded-2xl border border-[#c7d7f5] bg-[#f4f7fd] px-4 py-3.5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">
                  바로 해야 할 행동
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-foreground md:text-lg">
                  <span className="font-bold">{decision.actionLabel}</span>
                </p>
              </div>
            </div>
          </div>

          {decision.primaryReasons.length > 0 && (
            <div className="mt-7">
              <p className="mb-3 text-sm text-foreground md:text-[15px]">
                <span className="font-bold">핵심 이유</span>
              </p>
              <ul className="grid gap-3 md:grid-cols-3">
                {decision.primaryReasons.slice(0, 3).map((reason, index) => (
                  <li key={reason} className="report-summary-card flex gap-3 p-4">
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
        </div>

        <div className="flex flex-col items-center gap-2 md:justify-end">
          <RiskScoreVisual
            score={report.score}
            limited={audienceReport.isLimited}
            decision={verdict}
            scoreEvaluation={decision.scoreDisplay}
          />
          <p className="text-center text-xs text-muted">
            점수는 보조 정보입니다
          </p>
        </div>
      </div>
    </section>
  );
}
