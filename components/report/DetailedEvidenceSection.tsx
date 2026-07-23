"use client";

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { PlatformMark } from "@/components/report/ui/PlatformMark";
import {
  ReportDetailBlock,
  ReportDetailBody,
  ReportDetailList,
  ReportDetailNote,
  ReportDetailStack,
  ReportDetailTable,
  ReportDetailTile,
} from "@/components/report/ui/ReportDetail";
import { ReportExpandTrigger } from "@/components/report/ui/ReportExpandTrigger";
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
    <section className="overflow-hidden rounded-[0.875rem]">
      <ReportExpandTrigger
        open={open}
        title="세부 판단근거"
        description="문항, 고지문, 설문주체, 사용도구, 법적 기준에 따른 산출 근거를 확인합니다."
        icon={Layers}
        onClick={() => setOpen((prev) => !prev)}
      />

      {open ? (
        <div className="report-expand-panel">
          <ReportDetailStack>
            <ReportDetailBlock title="수집정보 판단 근거">
              {evidence.dataEvidence.length === 0 ? (
                <ReportDetailBody>
                  {evidence.isLimited
                    ? "문항을 확인하지 못해 수집정보 근거를 표시하지 않습니다."
                    : "탐지된 수집정보 항목이 없습니다."}
                </ReportDetailBody>
              ) : (
                <ReportDetailTable
                  headers={["구분", "탐지 근거", "판단"]}
                  rows={evidence.dataEvidence.map((row) => [
                    row.category,
                    row.evidence,
                    row.judgment,
                  ])}
                />
              )}
            </ReportDetailBlock>

            <ReportDetailBlock title="고지문 확인 결과">
              {report.form.metadata?.source?.kind === "file" &&
              !report.form.hasPrivacyNotice ? (
                <ReportDetailTile className="mb-2.5">
                  <ReportDetailBody strong>
                    파일에서 개인정보 수집·이용 고지문을 확인하지 못했습니다.
                  </ReportDetailBody>
                  <ReportDetailBody className="mt-1">
                    업로드한 파일에 고지문이 포함되어 있지 않으면 보유기간, 파기
                    기준, 담당자 안내 등이 ‘미확인’으로 진단될 수 있습니다.
                  </ReportDetailBody>
                </ReportDetailTile>
              ) : null}
              {evidence.noticeChecks.length === 0 ? (
                <ReportDetailBody>
                  {evidence.isLimited
                    ? "고지문 확인 결과를 산출하지 못했습니다."
                    : "표시할 고지 확인 항목이 없습니다."}
                </ReportDetailBody>
              ) : (
                <>
                  <ReportDetailTable
                    headers={["확인 항목", "상태", "근거"]}
                    rows={evidence.noticeChecks.map((row) => [
                      row.item,
                      row.statusLabel,
                      row.evidence,
                    ])}
                    renderCell={(cell, columnIndex) =>
                      columnIndex === 1 ? (
                        <StatusChip label={cell} />
                      ) : (
                        cell
                      )
                    }
                  />
                  {evidence.noticeExtraMissingCount > 0 ? (
                    <ReportDetailNote className="mt-2">
                      추가 미확인 항목 {evidence.noticeExtraMissingCount}건
                    </ReportDetailNote>
                  ) : null}
                </>
              )}
            </ReportDetailBlock>

            <ReportDetailBlock title="설문주체·도구 판단 근거">
              <div className="mb-2.5 flex items-center gap-2.5">
                <PlatformMark
                  platform={report.platform}
                  source={
                    report.form.metadata?.source?.kind === "file"
                      ? "file"
                      : "url"
                  }
                  size="md"
                />
                <span className="report-detail-body-strong">
                  {audienceReport.safetyType.toolBadge}
                </span>
              </div>
              <ReportDetailTable
                headers={["판단 항목", "결과", "근거"]}
                rows={evidence.subjectToolEvidence.map((row) => [
                  row.item,
                  row.result,
                  row.evidence,
                ])}
              />
            </ReportDetailBlock>

            <ReportDetailBlock title="적용 법·정책 기준">
              <AppliedLegalBasisList entries={evidence.appliedLegalBasis} />
              <ReportDetailNote className="mt-2.5">
                자동 진단 결과이며, 정확한 법률 판단은 담당기관 또는 전문가
                확인이 필요합니다.
              </ReportDetailNote>
            </ReportDetailBlock>

            <ReportDetailBlock title="진단 한계">
              <div
                className={
                  evidence.isLimited
                    ? "rounded-[0.625rem] border border-[#fde68a] bg-[#fffbeb] p-2.5"
                    : undefined
                }
              >
                <ReportDetailList items={evidence.diagnosisLimitations} />
              </div>
            </ReportDetailBlock>
          </ReportDetailStack>
        </div>
      ) : null}
    </section>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        NOTICE_STATUS_STYLE[label] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function AppliedLegalBasisList({ entries }: { entries: LegalBasisEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <ReportDetailBody>적용된 법·정책 기준이 없습니다.</ReportDetailBody>
    );
  }

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  return (
    <div className="space-y-2.5">
      <div className="report-detail-chip-row">
        {entries.map((entry) => {
          const pressed = selectedId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={pressed}
              className="report-detail-chip"
              onClick={() => setSelectedId(pressed ? null : entry.id)}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      {selected ? (
        <ReportDetailTile>
          <ReportDetailBody strong>
            {selected.label}: {selected.shortTitle}
          </ReportDetailBody>
          <ReportDetailBody className="mt-1.5">
            {selected.description}
          </ReportDetailBody>
        </ReportDetailTile>
      ) : (
        <ReportDetailNote>
          항목을 누르면 요약을 확인할 수 있습니다.
        </ReportDetailNote>
      )}
    </div>
  );
}
