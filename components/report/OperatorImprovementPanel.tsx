"use client";

import { useState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  FileWarning,
  ListOrdered,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CopyableNoticeTemplates } from "@/components/report/CopyableNoticeTemplates";
import {
  ReportDetailBlock,
  ReportDetailBody,
  ReportDetailField,
  ReportDetailList,
  ReportDetailStack,
  ReportDetailTable,
  ReportDetailTile,
} from "@/components/report/ui/ReportDetail";
import {
  ReportExpandTrigger,
  ReportSubsection,
} from "@/components/report/ui/ReportExpandTrigger";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { CoreOperatorProblem } from "@/lib/reporting/buildCoreOperatorProblems";

interface OperatorImprovementPanelProps {
  audienceReport: AudienceReport;
}

const SEVERITY_STYLE: Record<CoreOperatorProblem["severity"], string> = {
  HIGH_VIOLATION_RISK: "border-rose-200 bg-rose-50 text-rose-800",
  CHECK_REQUIRED: "border-amber-200 bg-amber-50 text-amber-900",
  RECOMMENDED_IMPROVEMENT: "border-slate-200 bg-slate-50 text-slate-700",
  LOW_OR_NONE: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const TOP_CARD_THEME: Array<{
  badge: string;
  iconBg: string;
  Icon: LucideIcon;
}> = [
  { badge: "bg-[#1e3a5f]", iconBg: "bg-[#1e3a5f]", Icon: ShieldAlert },
  { badge: "bg-[#0f766e]", iconBg: "bg-[#0f766e]", Icon: ClipboardCheck },
  { badge: "bg-[#1d4ed8]", iconBg: "bg-[#1d4ed8]", Icon: FileWarning },
];

export function OperatorImprovementPanel({
  audienceReport,
}: OperatorImprovementPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const report = audienceReport.operatorImprovement;
  const core = report.coreProblems;
  const topThree = core?.problems?.slice(0, 3) ?? [];
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(topThree.map((p) => p.id)),
  );

  if (
    audienceReport.isLimited ||
    audienceReport.safetyType.hideJudgmentDetails ||
    !core
  ) {
    return (
      <div className="space-y-6">
        <section className="report-inner-card p-5">
          <h3 className="text-lg font-bold text-slate-900 md:text-xl">
            설문 개선 리포트
          </h3>
          <p className="mt-2 text-[15px] text-slate-600">
            {audienceReport.safetyType.hideJudgmentDetails
              ? "종료된 설문은 분석 대상이 아니므로 운영자 보완사항을 안내하지 않습니다."
              : "문항을 확인하지 못해 운영자 보완사항을 최소화했습니다."}
          </p>
        </section>
        {!audienceReport.safetyType.hideJudgmentDetails &&
        (report.templates?.length ?? 0) > 0 ? (
          <CopyableNoticeTemplates templates={report.templates} />
        ) : null}
      </div>
    );
  }

  const countChips = [
    {
      label: "위반 소지 큼",
      count: core.counts.highViolationRisk,
      className: "border-rose-200 bg-rose-50 text-rose-800",
    },
    {
      label: "확인 필요",
      count: core.counts.checkRequired,
      className: "border-amber-200 bg-amber-50 text-amber-900",
    },
    {
      label: "개선 권고",
      count: core.counts.recommendedImprovement,
      className: "border-slate-200 bg-slate-50 text-slate-700",
    },
  ].filter((item) => item.count > 0);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <ReportSubsection className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 md:text-xl">
            설문 개선 리포트
          </h3>
          <p className="mt-1 text-[15px] text-slate-600">
            설문 담당자가 먼저 고치거나 확인해야 할 항목입니다.
          </p>
        </div>

        {topThree.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
                <ListOrdered className="h-4 w-4" aria-hidden />
              </span>
              <h4 className="text-base font-bold text-slate-900">
                최우선 개선사항 Top 3
              </h4>
            </div>
            <ul className="grid gap-3 md:grid-cols-3">
              {topThree.map((item, index) => {
                const theme = TOP_CARD_THEME[index] ?? TOP_CARD_THEME[0];
                const Icon = theme.Icon;
                return (
                  <li key={item.id} className="report-feature-card">
                    <div className="flex items-center gap-2.5">
                      <span className={`report-feature-icon ${theme.iconBg}`}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className={`report-feature-badge ${theme.badge}`}>
                        Top {index + 1}
                      </span>
                    </div>
                    <p className="mt-3 text-[15px] font-bold leading-snug text-slate-900">
                      {item.title}
                    </p>
                    <div className="report-feature-divider" />
                    <p className="text-sm leading-relaxed text-slate-600">
                      {item.action}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <p className="text-sm font-semibold text-slate-600">{core.summaryLine}</p>

        {countChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {countChips.map((chip) => (
              <span
                key={chip.label}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${chip.className}`}
              >
                {chip.label} {chip.count}
              </span>
            ))}
          </div>
        )}
      </ReportSubsection>

      <ReportSubsection ruled className="space-y-2.5">
        {core.problems.map((item) => {
          const open = openIds.has(item.id);
          return (
            <article
              key={item.id}
              className="report-inner-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left md:px-5"
                aria-expanded={open}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-[15px] font-bold text-slate-900 md:text-base">
                      {item.title}
                    </h4>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLE[item.severity]}`}
                    >
                      {item.severityLabel}
                    </span>
                  </div>
                  {!open ? (
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {item.action}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  {open ? "접기" : "펼치기"}
                </span>
              </button>

              {open ? (
                <div className="border-t border-slate-100 px-4 py-3.5 md:px-5">
                  <div className="space-y-3">
                    <ReportDetailField label="무엇이 문제인가">
                      {item.why}
                    </ReportDetailField>
                    <ReportDetailField label="어떤 기준에 걸리는가">
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.basisLabels.map((label) => (
                          <span key={label} className="report-badge-legal">
                            {label}
                          </span>
                        ))}
                      </div>
                    </ReportDetailField>
                    <ReportDetailTile tone="action">
                      <ReportDetailField label="무엇을 고치면 되는가" strong>
                        {item.action}
                      </ReportDetailField>
                    </ReportDetailTile>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </ReportSubsection>

      <ReportSubsection ruled className="space-y-3">
        <div className="overflow-hidden rounded-[0.875rem]">
          <ReportExpandTrigger
            open={detailsOpen}
            title="세부 개선사항 보기"
            description="도구·고지문·문항·운영관리 보완 항목을 확인합니다."
            icon={Wrench}
            onClick={() => setDetailsOpen((prev) => !prev)}
            compact
          />
          {detailsOpen ? (
            <div className="report-expand-panel">
              <ReportDetailStack>
                <ReportDetailBlock title="도구 개선">
                  <ReportDetailBody>{report.tool.summary}</ReportDetailBody>
                  {report.tool.platformNotes.length > 0 ? (
                    <div className="mt-1.5">
                      <ReportDetailList
                        items={report.tool.platformNotes.slice(0, 2)}
                      />
                    </div>
                  ) : null}
                </ReportDetailBlock>
                <ReportDetailBlock title="고지문 개선">
                  <ReportDetailList
                    items={report.noticeItems.map((i) => i.title).slice(0, 6)}
                    empty="표시할 고지문 보완 항목이 없습니다."
                  />
                </ReportDetailBlock>
                <ReportDetailBlock title="문항 개선">
                  <ReportDetailList
                    items={report.questionItems.map((i) => i.title).slice(0, 6)}
                    empty="표시할 문항 보완 항목이 없습니다."
                  />
                </ReportDetailBlock>
                <ReportDetailBlock title="운영관리 개선">
                  <ReportDetailList
                    items={report.managementItems
                      .map((i) => i.title)
                      .slice(0, 6)}
                    empty="표시할 운영관리 보완 항목이 없습니다."
                  />
                </ReportDetailBlock>
              </ReportDetailStack>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[0.875rem]">
          <ReportExpandTrigger
            open={legalOpen}
            title="법·정책 근거 설명"
            description="자동 진단용 요약이며 법률 자문이 아닙니다."
            icon={BookOpen}
            onClick={() => setLegalOpen((prev) => !prev)}
            compact
          />
          {legalOpen ? (
            <div className="report-expand-panel">
              <ReportDetailStack>
                <ReportDetailBlock title="법·정책 근거">
                  <ReportDetailTable
                    headers={["기준", "설명"]}
                    rows={report.legalBasisDetails.map((basis) => [
                      basis.label,
                      basis.description,
                    ])}
                    clampFromColumn={1}
                  />
                </ReportDetailBlock>
              </ReportDetailStack>
            </div>
          ) : null}
        </div>
      </ReportSubsection>

      {report.templates.length > 0 ? (
        <ReportSubsection ruled>
          <CopyableNoticeTemplates templates={report.templates} />
        </ReportSubsection>
      ) : null}
    </div>
  );
}
