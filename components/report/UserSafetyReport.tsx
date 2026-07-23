"use client";

import {
  ArrowDown,
  Building2,
  Database,
  FileUp,
  Shield,
  Wrench,
} from "lucide-react";
import { SafetyTypeCard } from "@/components/report/SafetyTypeCard";
import { UserEvidenceCards } from "@/components/report/UserEvidenceCards";
import { getSafetyTypeTheme } from "@/components/report/ui/safetyTypeTheme";
import type { AudienceReport } from "@/lib/reporting/reportMessages";

interface UserSafetyReportProps {
  audienceReport: AudienceReport;
}

export function UserSafetyReport({ audienceReport }: UserSafetyReportProps) {
  const { safetyType, userEvidenceCards } = audienceReport;
  const theme = getSafetyTypeTheme(safetyType.tone);

  const profileItems = [
    {
      label: "진단 방식",
      value: safetyType.diagnosisMethodLabel,
      Icon: FileUp,
    },
    ...(safetyType.fileNameLabel
      ? [
          {
            label: "파일명",
            value: safetyType.fileNameLabel,
            Icon: FileUp,
          },
        ]
      : []),
    {
      label: "설문주체",
      value: safetyType.subjectLabel,
      Icon: Building2,
    },
    {
      label: "수집정보",
      value: safetyType.dataBadge,
      Icon: Database,
    },
    {
      label: "사용도구",
      value: safetyType.toolBadge,
      Icon: Wrench,
    },
    {
      label: "도구 판단",
      value: safetyType.toolJudgmentBadge,
      Icon: Shield,
    },
  ];

  return (
    <div className="space-y-10 md:space-y-12">
      <SafetyTypeCard safetyType={safetyType} />

      <UserEvidenceCards cards={userEvidenceCards} tone={safetyType.tone} />

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            설문 프로필 요약
          </h3>
          <p className="mt-1 text-base text-muted">
            설문주체·수집정보·사용도구를 짧게 요약합니다.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {profileItems.map(({ label, value, Icon }) => (
            <article
              key={label}
              className={`rounded-2xl border bg-white/90 p-4 shadow-sm md:p-5 ${theme.border}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.pill}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-muted">{label}</p>
              </div>
              <p className="mt-3 text-base font-bold leading-snug text-foreground md:text-lg">
                {value}
              </p>
            </article>
          ))}
        </div>
      </section>

      <a
        href="#operator-report"
        className="report-btn-secondary group inline-flex w-full justify-between gap-3 px-5 text-left sm:w-auto"
      >
        <span>
          <span className="block text-sm font-semibold text-muted">
            설문 담당자이신가요?
          </span>
          <span className="text-base font-bold text-foreground">
            기관·기업 담당자용 개선 리포트 보기
          </span>
        </span>
        <ArrowDown
          className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-y-0.5"
          aria-hidden
        />
      </a>
    </div>
  );
}
