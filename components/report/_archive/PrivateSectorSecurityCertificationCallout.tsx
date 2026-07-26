"use client";

import {
  Award,
  Building2,
  ChevronDown,
  Cloud,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import type { PrivateSectorSecurityCertAssessment } from "@/lib/reporting/reportMessages";

interface PrivateSectorSecurityCertificationCalloutProps {
  assessment: PrivateSectorSecurityCertAssessment;
}

const cardIcons = {
  csap: Cloud,
  isms_p: Building2,
  secure_collection_tool: Lock,
} as const;

const cardTones = {
  csap: "blue" as const,
  isms_p: "indigo" as const,
  secure_collection_tool: "navy" as const,
};

export function PrivateSectorSecurityCertificationCallout({
  assessment,
}: PrivateSectorSecurityCertificationCalloutProps) {
  const isStrong = assessment.showStrongWarning;
  const isSensitive = Boolean(assessment.sensitiveDataNote);

  return (
    <section
      aria-label="민간기업 보안 인증 도구 권고"
      className={
        isStrong
          ? isSensitive
            ? "rounded-2xl border border-[#93b4f6] bg-gradient-to-br from-white via-[#f8fbff] to-[#dbeafe] p-5 shadow-[0_12px_40px_rgba(30,64,175,0.14)] md:p-6"
            : "report-callout-card-strong p-5 md:p-6"
          : "report-callout-card p-4 md:p-5"
      }
    >
      <div className="flex gap-4 md:gap-5">
        <ReportIconBadge
          icon={isStrong ? ShieldCheck : Award}
          tone={isSensitive ? "rose" : "navy"}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <span className="report-step-badge">민간기업 권고</span>
          <h2 className="mt-3 text-lg leading-snug text-[#172554] md:text-xl">
            <span className="font-bold">{assessment.title}</span>
          </h2>
          <div className="report-card-divider my-4" />
          <p className="text-sm leading-relaxed text-[#334155] md:text-[15px]">
            {assessment.body}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#1e40af] md:text-[15px]">
            <span className="font-bold">{assessment.strongRecommendation}</span>
          </p>
          {assessment.sensitiveDataNote && (
            <p className="mt-3 text-sm leading-relaxed text-[#be123c] md:text-[15px]">
              <span className="font-bold">{assessment.sensitiveDataNote}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-[#64748b] md:text-sm">
            도구 분류: {assessment.toolStatusLabel}
          </p>
          {assessment.platformNote && (
            <p className="mt-2 text-sm leading-relaxed text-[#334155] md:text-[15px]">
              {assessment.platformNote}
            </p>
          )}
          <p className="mt-4 rounded-xl bg-white/80 px-4 py-3 text-xs leading-relaxed text-[#475569] md:text-sm">
            {assessment.certificationDisclaimer}
          </p>

          <details className="group mt-5 overflow-hidden rounded-2xl border border-[#c7d7f5] bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm text-[#1e3a8a] marker:content-none md:text-[15px]">
              <span className="font-bold">{assessment.explanationSectionTitle}</span>
              <ChevronDown
                size={18}
                className="shrink-0 text-[#3b5bdb] transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="grid gap-4 border-t border-[#e8edf6] p-4 md:grid-cols-3">
              {assessment.certificationCards.map((card) => {
                const CardIcon = cardIcons[card.id];
                const tone = cardTones[card.id];

                return (
                  <article
                    key={card.id}
                    className="overflow-hidden rounded-2xl border border-[#dbeafe] bg-gradient-to-b from-white to-[#f8fbff] shadow-[0_4px_20px_rgba(30,58,138,0.06)]"
                  >
                    <div className="border-b border-[#e8edf6] bg-gradient-to-r from-[#eff6ff] to-white px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ReportIconBadge icon={CardIcon} tone={tone} size="md" />
                        <h3 className="text-sm text-[#172554] md:text-[15px]">
                          <span className="font-bold">{card.title}</span>
                        </h3>
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <p className="text-xs leading-relaxed text-[#475569] md:text-sm">
                        {card.description}
                      </p>
                      {card.privateSectorNote && (
                        <p className="text-xs leading-relaxed text-[#1e40af] md:text-sm">
                          {card.privateSectorNote}
                        </p>
                      )}
                      <ul className="space-y-1.5">
                        {card.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="flex gap-2 text-xs leading-relaxed text-[#475569] md:text-sm"
                          >
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b5bdb]" />
                            {bullet}
                          </li>
                        ))}
                      </ul>
                      <p className="rounded-xl bg-[#eff6ff] px-3 py-2.5 text-[11px] leading-relaxed text-[#1e40af] md:text-xs">
                        {card.disclaimer}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
