"use client";

import { ChevronDown, Shield } from "lucide-react";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import type { PublicSectorCsapAssessment } from "@/lib/reporting/reportMessages";

interface PublicSectorCsapWarningProps {
  assessment: PublicSectorCsapAssessment;
}

export function PublicSectorCsapWarning({
  assessment,
}: PublicSectorCsapWarningProps) {
  const isStrong = assessment.showStrongWarning;

  return (
    <section
      aria-label="공공부문 CSAP 인증 도구 권고"
      className={isStrong ? "report-callout-card-strong p-5 md:p-6" : "report-callout-card p-4 md:p-5"}
    >
      <div className="flex gap-4 md:gap-5">
        <ReportIconBadge icon={Shield} tone={isStrong ? "navy" : "blue"} size="xl" />
        <div className="min-w-0 flex-1">
          <span className="report-step-badge">공공부문 권고</span>
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
          <p className="mt-2 text-xs text-[#64748b] md:text-sm">
            도구 분류: {assessment.toolStatusLabel}
          </p>
          {assessment.platformNote && (
            <p className="mt-2 text-sm leading-relaxed text-[#334155] md:text-[15px]">
              {assessment.platformNote}
            </p>
          )}

          <details className="group mt-5 overflow-hidden rounded-2xl border border-[#c7d7f5] bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm text-[#1e3a8a] marker:content-none md:text-[15px]">
              <span className="font-bold">{assessment.csapExplanation.title}</span>
              <ChevronDown
                size={18}
                className="shrink-0 text-[#3b5bdb] transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-3 border-t border-[#e8edf6] px-5 py-4 text-sm leading-relaxed text-[#475569] md:text-[15px]">
              <p>{assessment.csapExplanation.body}</p>
              <p>
                공공기관이 개인정보를 클라우드 기반 서비스로 수집·처리하는 경우,
                단순히 설문 화면의 고지문만으로는 충분하지 않습니다. 서비스 자체의
                보안성, 접근권한 관리, 저장 위치, 백업, 파기, 운영관리 체계가 함께
                확인되어야 하므로 CSAP 인증 여부가 중요한 검토 기준이 됩니다.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                {assessment.csapExplanation.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <p className="rounded-xl bg-[#eff6ff] px-4 py-3 text-xs leading-relaxed text-[#1e40af] md:text-sm">
                {assessment.csapExplanation.disclaimer}
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
