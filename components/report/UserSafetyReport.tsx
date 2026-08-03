"use client";

import {
  Building2,
  Database,
  Shield,
} from "lucide-react";
import { SafetyTypeCard } from "@/components/report/SafetyTypeCard";
import { UserEvidenceCards } from "@/components/report/UserEvidenceCards";
import { ReportSubsection } from "@/components/report/ui/ReportExpandTrigger";
import { PlatformMark } from "@/components/report/ui/PlatformMark";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { ScanReport } from "@/lib/types/scan";

interface UserSafetyReportProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

export function UserSafetyReport({
  report,
  audienceReport,
}: UserSafetyReportProps) {
  const { safetyType, userEvidenceCards } = audienceReport;
  const sourceKind =
    report.form.metadata?.source?.kind === "file" ? "file" : "url";

  const profileItems = [
    {
      label: "설문주체",
      value: safetyType.subjectLabel,
      icon: (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <Building2 className="h-5 w-5" aria-hidden />
        </span>
      ),
    },
    {
      label: "수집정보",
      value: safetyType.dataBadge,
      icon: (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <Database className="h-5 w-5" aria-hidden />
        </span>
      ),
    },
    {
      label: "사용도구",
      value: safetyType.toolBadge,
      icon: (
        <PlatformMark
          platform={report.platform}
          source={sourceKind}
          label={safetyType.toolBadge}
          size="md"
        />
      ),
    },
    {
      label: "도구 판단",
      value: safetyType.toolJudgmentBadge,
      icon: (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <Shield className="h-5 w-5" aria-hidden />
        </span>
      ),
    },
  ];

  return (
    <div>
      <ReportSubsection>
        <SafetyTypeCard safetyType={safetyType} />
      </ReportSubsection>

      {safetyType.hideJudgmentDetails ? null : (
        <>
          <ReportSubsection ruled>
            <UserEvidenceCards
              cards={userEvidenceCards}
              tone={safetyType.tone}
              platform={report.platform}
              sourceKind={sourceKind}
            />
          </ReportSubsection>

          <ReportSubsection ruled className="space-y-3">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">
                설문 프로필 요약
              </h3>
              <p className="mt-1 text-[15px] text-slate-600">
                설문주체·수집정보·사용도구를 짧게 요약합니다.
              </p>
            </div>
            <div className="report-inner-card overflow-hidden">
              <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
                {profileItems.map(({ label, value, icon }, index) => (
                  <div
                    key={label}
                    className={`flex items-center gap-3 px-4 py-4 ${
                      index > 0 ? "border-t border-slate-100 sm:border-t-0" : ""
                    } ${index % 2 === 1 ? "sm:border-l sm:border-slate-100" : ""} ${
                      index >= 2
                        ? "lg:border-t-0 lg:border-l lg:border-slate-100"
                        : ""
                    }`}
                  >
                    {icon}
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold tracking-wide text-slate-500">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                        {value}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </ReportSubsection>
        </>
      )}
    </div>
  );
}
