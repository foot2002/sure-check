"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { CopyableNoticeTemplates } from "@/components/report/CopyableNoticeTemplates";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import type { CoreOperatorProblem } from "@/lib/reporting/buildCoreOperatorProblems";

interface OperatorImprovementPanelProps {
  audienceReport: AudienceReport;
}

const SEVERITY_STYLE: Record<CoreOperatorProblem["severity"], string> = {
  HIGH_VIOLATION_RISK: "border-[#fda4af] bg-[#fff1f2] text-[#9f1239]",
  CHECK_REQUIRED: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  RECOMMENDED_IMPROVEMENT: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]",
  LOW_OR_NONE: "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46]",
};

export function OperatorImprovementPanel({
  audienceReport,
}: OperatorImprovementPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const report = audienceReport.operatorImprovement;
  const core = report.coreProblems;

  if (audienceReport.isLimited) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
          <h3 className="text-xl font-bold text-slate-900 md:text-2xl">
            운영자용 핵심 개선 리포트
          </h3>
          <p className="mt-3 text-base text-muted">
            문항을 확인하지 못해 운영자 보완사항을 최소화했습니다.
          </p>
        </section>
        {report.templates.length > 0 ? (
          <CopyableNoticeTemplates templates={report.templates} />
        ) : null}
      </div>
    );
  }

  const countChips = [
    {
      label: "위반 소지 큼",
      count: core.counts.highViolationRisk,
      className: "border-[#fda4af] bg-[#fff1f2] text-[#9f1239]",
    },
    {
      label: "확인 필요",
      count: core.counts.checkRequired,
      className: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    },
    {
      label: "개선 권고",
      count: core.counts.recommendedImprovement,
      className: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]",
    },
  ].filter((item) => item.count > 0);

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 md:text-2xl">
            운영자용 핵심 개선 리포트
          </h3>
          <p className="mt-2 text-base text-muted">
            설문 담당자가 먼저 고치거나 확인해야 할 항목입니다.
          </p>
        </div>

        <p className="text-base font-semibold text-slate-700 md:text-lg">
          {core.summaryLine}
        </p>

        {countChips.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {countChips.map((chip) => (
              <span
                key={chip.label}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-bold ${chip.className}`}
              >
                {chip.label} {chip.count}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {core.problems.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <h4 className="text-lg font-bold text-foreground md:text-xl">
                  {item.title}
                </h4>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold md:text-sm ${SEVERITY_STYLE[item.severity]}`}
                >
                  {item.severityLabel}
                </span>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    문제
                  </p>
                  <p className="mt-2 text-base leading-relaxed text-muted">
                    {item.why}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    근거
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.basisLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
                    조치
                  </p>
                  <p className="mt-1.5 text-base font-bold leading-relaxed text-foreground md:text-lg">
                    {item.action}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <details
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          open={detailsOpen}
          onToggle={(e) =>
            setDetailsOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-bold text-foreground">
            세부 개선사항 보기
            <ChevronDown
              className={`h-5 w-5 text-muted transition ${detailsOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </summary>
          <div className="space-y-5 border-t border-slate-100 px-5 py-5">
            <DetailGroup title="도구 개선">
              <p className="text-base leading-relaxed text-muted">
                {report.tool.summary}
              </p>
              {report.tool.platformNotes.slice(0, 2).map((note) => (
                <p key={note} className="text-base text-muted">
                  · {note}
                </p>
              ))}
            </DetailGroup>

            <DetailGroup title="고지문 개선">
              <ShortList
                items={report.noticeItems.map((i) => i.title)}
                empty="표시할 고지문 보완 항목이 없습니다."
              />
            </DetailGroup>

            <DetailGroup title="문항 개선">
              <ShortList
                items={report.questionItems.map((i) => i.title)}
                empty="표시할 문항 보완 항목이 없습니다."
              />
            </DetailGroup>

            <DetailGroup title="운영관리 개선">
              <ShortList
                items={report.managementItems.map((i) => i.title)}
                empty="표시할 운영관리 보완 항목이 없습니다."
              />
            </DetailGroup>
          </div>
        </details>

        <details
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          open={legalOpen}
          onToggle={(e) => setLegalOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-bold text-foreground">
            법·정책 근거 설명
            <ChevronDown
              className={`h-5 w-5 text-muted transition ${legalOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </summary>
          <div className="space-y-3 border-t border-slate-100 px-5 py-5">
            <p className="text-sm leading-relaxed text-slate-500">
              아래 안내는 자동 진단용 요약이며 법률 자문이 아닙니다. 정확한 조문
              해석이 필요하면 법률 전문가 또는 담당기관에 확인하세요.
            </p>
            {report.legalBasisDetails.map((basis) => (
              <div
                key={basis.id}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
              >
                <p className="text-base font-bold text-foreground">
                  {basis.label}
                </p>
                <p className="mt-1 text-base leading-relaxed text-muted">
                  {basis.description}
                </p>
              </div>
            ))}
          </div>
        </details>
      </section>

      {report.templates.length > 0 ? (
        <CopyableNoticeTemplates templates={report.templates} />
      ) : null}
    </div>
  );
}

function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-base font-bold text-foreground">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ShortList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-base text-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 6).map((item) => (
        <li key={item} className="text-base text-muted">
          · {item}
        </li>
      ))}
    </ul>
  );
}
