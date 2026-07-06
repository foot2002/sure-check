import { CopyableTemplateBox } from "@/components/report/CopyableTemplateBox";
import { RequiredFixList } from "@/components/report/RequiredFixList";
import type { AudienceReport } from "@/lib/reporting/reportMessages";

interface OperatorActionPanelProps {
  audienceReport: AudienceReport;
}

export function OperatorActionPanel({
  audienceReport,
}: OperatorActionPanelProps) {
  if (audienceReport.isLimited) {
    return (
      <section className="rounded-xl border border-border-subtle bg-surface p-4 md:p-5">
        <h2 className="mb-2 text-[13px] font-semibold text-foreground">
          운영자 보완사항
        </h2>
        <p className="text-[13px] leading-relaxed text-muted">
          {audienceReport.operatorSummary}
        </p>
      </section>
    );
  }

  const allFixes = [
    ...audienceReport.requiredFixes,
    ...audienceReport.recommendedFixes,
  ];
  const toolFixes = allFixes.filter((fix) =>
    ["outsourcing", "overseas_transfer"].includes(fix.category),
  );
  const publicFixes = allFixes.filter((fix) => fix.category === "public_sector");
  const employeeFixes = allFixes.filter((fix) =>
    ["employee_survey", "anonymity"].includes(fix.category),
  );
  const designFixes = allFixes.filter((fix) =>
    ["event_reward", "marketing", "sensitive_data"].includes(fix.category),
  );

  return (
    <section className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4 md:p-5">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground">
          운영자 보완사항
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {audienceReport.operatorSummary}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <RequiredFixList
          title="필수 보완"
          fixes={audienceReport.requiredFixes}
          emptyText="즉시 보완해야 할 필수 항목은 크게 보이지 않습니다."
        />
        <RequiredFixList
          title="권장 보완"
          fixes={audienceReport.recommendedFixes}
          emptyText="권장 보완 항목이 없습니다."
        />
        <RequiredFixList
          title="도구·위탁 보완"
          fixes={toolFixes}
          emptyText="도구·위탁 관련 별도 보완 항목이 없습니다."
        />
        <RequiredFixList
          title="설문 설계 보완"
          fixes={designFixes}
          emptyText="설문 설계 관련 별도 보완 항목이 없습니다."
        />
        <RequiredFixList
          title="공공기관 보완"
          fixes={publicFixes}
          emptyText="공공기관 맥락 보완 항목이 없습니다."
        />
        <RequiredFixList
          title="직원/조직진단 보완"
          fixes={employeeFixes}
          emptyText="직원/조직진단 맥락 보완 항목이 없습니다."
        />
      </div>

      <CopyableTemplateBox templates={audienceReport.copyableTemplates} />
    </section>
  );
}
