"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { buildDetailedEvidenceSummary } from "@/lib/reporting/buildDetailedEvidenceSummary";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { LegalBasisEntry } from "@/lib/reporting/legalBasisRegistry";
import type { ScanReport } from "@/lib/types/scan";

interface DetailedEvidenceSectionProps {
  report: ScanReport;
  audienceReport: AudienceReport;
}

const NOTICE_STATUS_STYLE: Record<string, string> = {
  확인됨: "bg-[#ecfdf5] text-[#166534]",
  "일부 부족": "bg-[#fffbeb] text-[#92400e]",
  미확인: "bg-[#fef2f2] text-[#991b1b]",
  "해당 없음": "bg-[#f1f5f9] text-[#64748b]",
};

export function DetailedEvidenceSection({
  report,
  audienceReport,
}: DetailedEvidenceSectionProps) {
  const [open, setOpen] = useState(false);
  const evidence = useMemo(
    () =>
      buildDetailedEvidenceSummary(report, audienceReport.collectedDataSummary),
    [report, audienceReport.collectedDataSummary],
  );

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[var(--report-shadow-soft)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-5 text-left md:px-7"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Layers className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xl font-bold text-foreground md:text-2xl">
              세부 판단근거
            </p>
            <p className="mt-1.5 text-base text-muted">
              이 결과가 어떤 문항, 고지문, 설문주체, 사용도구, 법적 기준에 따라
              산출되었는지 확인할 수 있습니다.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-slate-100 px-5 py-5 md:px-6">
          <EvidenceBlock title="수집정보 판단 근거">
            {evidence.dataEvidence.length === 0 ? (
              <p className="text-sm text-muted">
                {evidence.isLimited
                  ? "문항을 확인하지 못해 수집정보 근거를 표시하지 않습니다."
                  : "탐지된 수집정보 항목이 없습니다."}
              </p>
            ) : (
              <EvidenceTable
                headers={["구분", "탐지 근거", "판단"]}
                rows={evidence.dataEvidence.map((row) => [
                  row.category,
                  row.evidence,
                  row.judgment,
                ])}
              />
            )}
          </EvidenceBlock>

          <EvidenceBlock title="고지문 확인 결과">
            {evidence.noticeChecks.length === 0 ? (
              <p className="text-sm text-muted">
                {evidence.isLimited
                  ? "고지문 확인 결과를 산출하지 못했습니다."
                  : "표시할 고지 확인 항목이 없습니다."}
              </p>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {evidence.noticeChecks.map((row) => (
                    <div
                      key={row.item}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {row.item}
                        </p>
                        <StatusChip label={row.statusLabel} />
                      </div>
                      <p className="mt-1 text-sm text-muted">{row.evidence}</p>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-muted">
                        <th className="py-2 pr-3 font-semibold">확인 항목</th>
                        <th className="py-2 pr-3 font-semibold">상태</th>
                        <th className="py-2 font-semibold">근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidence.noticeChecks.map((row) => (
                        <tr
                          key={row.item}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-2.5 pr-3 font-medium text-foreground">
                            {row.item}
                          </td>
                          <td className="py-2.5 pr-3">
                            <StatusChip label={row.statusLabel} />
                          </td>
                          <td className="py-2.5 text-muted">{row.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {evidence.noticeExtraMissingCount > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    추가 미확인 항목 {evidence.noticeExtraMissingCount}건
                  </p>
                )}
              </>
            )}
          </EvidenceBlock>

          <EvidenceBlock title="설문주체·도구 판단 근거">
            <EvidenceTable
              headers={["판단 항목", "결과", "근거"]}
              rows={evidence.subjectToolEvidence.map((row) => [
                row.item,
                row.result,
                row.evidence,
              ])}
            />
          </EvidenceBlock>

          <EvidenceBlock title="적용 법·정책 기준">
            <AppliedLegalBasisList entries={evidence.appliedLegalBasis} />
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              자동 진단 결과이며, 정확한 법률 판단은 담당기관 또는 전문가 확인이
              필요합니다.
            </p>
          </EvidenceBlock>

          <EvidenceBlock title="진단 한계">
            <ul
              className={`space-y-1.5 ${
                evidence.isLimited
                  ? "rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3"
                  : ""
              }`}
            >
              {evidence.diagnosisLimitations.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-muted">
                  · {item}
                </li>
              ))}
            </ul>
          </EvidenceBlock>
        </div>
      )}
    </section>
  );
}

function EvidenceBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-foreground md:text-[15px]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function EvidenceTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <div
            key={row.join("|")}
            className="rounded-xl border border-slate-100 bg-slate-50 p-3"
          >
            <p className="text-sm font-semibold text-foreground">{row[0]}</p>
            <p className="mt-1 text-sm text-foreground">{row[1]}</p>
            <p className="mt-1 text-sm text-muted">{row[2]}</p>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-muted">
              {headers.map((header) => (
                <th key={header} className="py-2 pr-3 font-semibold last:pr-0">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.join("|")}
                className="border-b border-slate-100 last:border-0"
              >
                {row.map((cell, index) => (
                  <td
                    key={`${cell}_${index}`}
                    className={`py-2.5 pr-3 last:pr-0 ${
                      index === 0
                        ? "font-medium text-foreground"
                        : index === 2
                          ? "text-muted"
                          : "text-foreground"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
        NOTICE_STATUS_STYLE[label] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function AppliedLegalBasisList({ entries }: { entries: LegalBasisEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0) {
    return <p className="text-sm text-muted">적용된 법·정책 기준이 없습니다.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => {
        const open = expandedId === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => setExpandedId(open ? null : entry.id)}
            className={`rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition ${
              open
                ? "border-[#1e3a8a] bg-[#eff6ff] text-[#1e3a8a]"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
            }`}
          >
            <span>
              {entry.label}: {entry.shortTitle}
            </span>
            {open && (
              <span className="mt-1 block max-w-xs font-normal leading-relaxed text-muted">
                {entry.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
