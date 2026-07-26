"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileSearch } from "lucide-react";
import { AnalyzerTrace } from "@/components/AnalyzerTrace";
import { ReportSection } from "@/components/ReportSection";
import { PillTag } from "@/components/report/ui/PillTag";
import { dedupeFindings, type DedupeFindingGroup } from "@/lib/reporting/dedupeFindings";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { FindingCategory, ScanReport } from "@/lib/types/scan";

interface CompactEvidenceAccordionProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

const groupLabels: Record<string, string> = {
  data: "수집정보 근거",
  tool: "도구·처리경로 근거",
  notice: "고지·동의 근거",
  management: "관리·운영 근거",
  override: "최소등급 적용 근거",
  context: "맥락 근거",
};

function categoryFor(group: DedupeFindingGroup): FindingCategory {
  return group.category;
}

function EvidenceGroup({
  title,
  groups,
}: {
  title: string;
  groups: DedupeFindingGroup[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? groups : groups.slice(0, 5);
  const hidden = Math.max(0, groups.length - 5);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-background p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground md:text-[15px]">{title}</h3>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted">
          {groups.length}건
        </span>
      </div>
      <ul className="space-y-4">
        {visible.map((group) => (
          <li key={group.id} className="border-b border-border-subtle/70 pb-4 last:border-0 last:pb-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground md:text-[15px]">
                {group.title}
              </p>
              {group.count > 1 && (
                <PillTag tone="neutral" size="sm">
                  {group.count}건 묶음
                </PillTag>
              )}
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {group.descriptions[0]}
            </p>
            {group.evidence.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {group.evidence.map((item) => (
                  <PillTag key={item} tone="neutral" size="sm">
                    {item}
                  </PillTag>
                ))}
                {group.evidenceExtraCount > 0 && (
                  <PillTag tone="neutral" size="sm">
                    외 {group.evidenceExtraCount}건
                  </PillTag>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? "접기" : `더 보기 (${hidden}건)`}
        </button>
      )}
    </div>
  );
}

export function CompactEvidenceAccordion({
  report,
  audienceReport,
}: CompactEvidenceAccordionProps) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => dedupeFindings(report.findings), [report.findings]);
  const grouped = useMemo(() => {
    const map = new Map<FindingCategory, DedupeFindingGroup[]>();
    for (const group of groups) {
      const category = categoryFor(group);
      map.set(category, [...(map.get(category) ?? []), group]);
    }
    return map;
  }, [groups]);

  return (
    <section className="rounded-2xl border border-border-subtle bg-[#fafbfc]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left md:px-6 md:py-5"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-muted shadow-sm">
            <FileSearch size={18} strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground md:text-lg">
              세부 판단 근거 및 방법
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {audienceReport.detailsSummary}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-muted" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border-subtle p-5 md:p-6">
          {(["data", "tool", "notice", "management", "override", "context"] as const).map(
            (category) => (
              <EvidenceGroup
                key={category}
                title={groupLabels[category]}
                groups={grouped.get(category) ?? []}
              />
            ),
          )}

          <ReportSection title="법적 기준 요약" variant="info">
            <p>{report.sections.legalBasisSummary}</p>
          </ReportSection>

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
