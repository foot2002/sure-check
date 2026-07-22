"use client";

import {
  ArrowDown,
  Building2,
  Database,
  Shield,
  Wrench,
} from "lucide-react";
import { HowToRespondSection } from "@/components/report/HowToRespondSection";
import { SafetyTypeCard } from "@/components/report/SafetyTypeCard";
import { toReasonCard } from "@/components/report/ui/reasonCardModel";
import { getSafetyTypeTheme } from "@/components/report/ui/safetyTypeTheme";
import type { AudienceReport } from "@/lib/reporting/reportMessages";

interface UserSafetyReportProps {
  audienceReport: AudienceReport;
}

export function UserSafetyReport({ audienceReport }: UserSafetyReportProps) {
  const { safetyType, decisionSummary } = audienceReport;
  const theme = getSafetyTypeTheme(safetyType.tone);
  const reasons = decisionSummary.primaryReasons.slice(0, 3).map(toReasonCard);

  const profileItems = [
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
      <div className="space-y-2">
        <p className={`text-sm font-bold tracking-[0.1em] ${theme.accent}`}>
          User Safety Type
        </p>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          나의 설문 안전유형
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted md:text-lg">
          이 설문이 어떤 안전유형인지, 지금 어떻게 하면 되는지 쉽게 알려드립니다.
        </p>
      </div>

      <SafetyTypeCard safetyType={safetyType} />

      <HowToRespondSection
        decision={decisionSummary}
        tone={safetyType.tone}
        actionHint={safetyType.action}
      />

      {reasons.length > 0 && (
        <section className="space-y-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">
              판단 핵심 근거
            </h3>
            <p className="mt-1 text-base text-muted">
              이 유형으로 판단한 핵심 이유 3가지입니다.
            </p>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {reasons.map((reason, index) => {
              const Icon = reason.Icon;
              return (
                <li
                  key={`${reason.title}_${index}`}
                  className="report-summary-card flex flex-col gap-3 p-5 md:p-6"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.iconBg} text-white shadow-md`}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <p className="text-lg font-bold text-foreground">
                      {reason.title}
                    </p>
                  </div>
                  <p className="text-base leading-relaxed text-muted">
                    {reason.description}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            설문 프로필 요약
          </h3>
          <p className="mt-1 text-base text-muted">
            설문주체, 수집정보, 사용도구를 한눈에 봅니다.
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
            운영자용 핵심 개선 리포트 보기
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
