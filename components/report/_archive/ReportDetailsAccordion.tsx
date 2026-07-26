"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnalyzerTrace } from "@/components/AnalyzerTrace";
import { FindingList } from "@/components/FindingList";
import { ReportListSection, ReportSection } from "@/components/ReportSection";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { ScanReport } from "@/lib/types/scan";

interface ReportDetailsAccordionProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

export function ReportDetailsAccordion({
  report,
  audienceReport,
}: ReportDetailsAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border-subtle bg-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-5"
      >
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            상세 근거 보기
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">
            {audienceReport.detailsSummary}
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-muted" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border-subtle p-4 md:p-5">
          {report.sections.evidenceItems.length > 0 && (
            <ReportListSection
              title="근거 문항"
              items={report.sections.evidenceItems}
            />
          )}

          <ReportSection title="수집정보 위험" variant="warning">
            <p>{report.sections.dataCollectionRisk || "상세 평가 없음"}</p>
          </ReportSection>

          <ReportSection title="도구·처리경로 위험">
            <p>{report.sections.toolProcessingRisk || "상세 평가 없음"}</p>
          </ReportSection>

          <ReportSection title="고지·동의 요약" variant="warning">
            <p>{report.sections.noticeConsentGap || "상세 평가 없음"}</p>
          </ReportSection>

          <ReportSection title="관리·운영 위험">
            <p>{report.sections.managementRisk || "상세 평가 없음"}</p>
          </ReportSection>

          <ReportSection title="법적 기준 요약" variant="info">
            <p>{report.sections.legalBasisSummary}</p>
          </ReportSection>

          <FindingList findings={report.findings} />

          {report.analyzerTrace && (
            <ReportSection title="Analyzer Trace" variant="info">
              <AnalyzerTrace trace={report.analyzerTrace} />
            </ReportSection>
          )}
        </div>
      )}
    </section>
  );
}
