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
import { reportEmphasisForSubject } from "@/lib/rules/ruleScope";
import type { ScanReport } from "@/lib/types/scan";

interface UserSafetyReportProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

export function UserSafetyReport({
  report,
  audienceReport,
}: UserSafetyReportProps) {
  const { safetyType, userEvidenceCards, keyProblems } = audienceReport;
  const sourceKind =
    report.form.metadata?.source?.kind === "file" ? "file" : "url";
  const emphasis = reportEmphasisForSubject(
    safetyType.subjectLabel,
    report.debug?.publicSectorDetected ? "public" : null,
  );

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

      {keyProblems && keyProblems.length > 0 ? (
        <ReportSubsection ruled>
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">
                가장 심각한 문제 TOP {keyProblems.length}
              </h3>
              <p className="mt-1 text-[15px] text-slate-600">
                자동진단 근거로 확인된 핵심 이슈입니다. 법 위반을 확정하지 않으며,
                즉시 확인이 필요한 항목을 우선 보여줍니다.
              </p>
            </div>
            <ol className="space-y-3">
              {keyProblems.map((problem, index) => (
                <li
                  key={problem.id}
                  className={`rounded-2xl border px-4 py-4 ${
                    problem.severity === "critical"
                      ? "border-rose-300 bg-rose-50"
                      : problem.severity === "high"
                        ? "border-orange-300 bg-orange-50"
                        : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {index + 1}.{" "}
                    {problem.severity === "critical"
                      ? "CRITICAL"
                      : problem.severity === "high"
                        ? "HIGH"
                        : "MEDIUM"}
                  </p>
                  <p className="mt-1 text-base font-bold leading-snug text-slate-900 md:text-lg">
                    {problem.headline}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{problem.fact}</p>
                  <p className="mt-1.5 text-sm text-slate-600">{problem.why}</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    즉시 조치: {problem.action}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </ReportSubsection>
      ) : null}

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
                조직유형별 확인 포인트
              </h3>
              <p className="mt-1 text-[15px] text-slate-600">
                {emphasis.scope === "PUBLIC"
                  ? "공공부문 설문은 개인정보 고지와 함께 외부 도구·클라우드 기준 확인이 중요합니다."
                  : emphasis.scope === "UNIVERSITY_OFFICIAL"
                    ? "대학 공식조직 설문은 연구/조사 책임과 도구 적합성을 함께 확인합니다."
                    : "기업 설문은 고지·동의·위탁·국외 이전과 외부 SaaS 위험을 중심으로 확인합니다."}
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {emphasis.sectionTitles.map((title) => (
                <li
                  key={title}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800"
                >
                  {title}
                </li>
              ))}
            </ul>
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
