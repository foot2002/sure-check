import { CheckSquare, ShieldAlert } from "lucide-react";
import { ReportIconBadge } from "@/components/report/ui/ReportIconBadge";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { AudienceReport } from "@/lib/reporting/reportMessages";

interface RespondentChecklistProps {
  audienceReport: AudienceReport;
}

function ChecklistCard({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "check" | "avoid";
}) {
  const Icon = variant === "check" ? CheckSquare : ShieldAlert;
  const tone =
    variant === "check"
      ? "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white"
      : "border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white";

  return (
    <div className={`report-summary-card border p-5 md:p-6 ${tone}`}>
      <div className="mb-4 flex items-center gap-4">
        <ReportIconBadge
          icon={Icon}
          tone={variant === "check" ? "blue" : "amber"}
          size="lg"
        />
        <h3 className="text-base text-foreground md:text-lg">
          <span className="font-bold">{title}</span>
        </h3>
      </div>
      <div className="report-card-divider mb-4" />
      <ul className="space-y-3">
        {items.slice(0, 5).map((item) => (
          <li
            key={item}
            className="flex gap-3 text-sm leading-relaxed text-muted md:text-[15px]"
          >
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b5bdb]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RespondentChecklist({ audienceReport }: RespondentChecklistProps) {
  return (
    <section>
      <SectionHeader
        step={7}
        title="응답자 체크리스트"
        description="응답 전·후에 확인하면 좋은 항목입니다."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ChecklistCard
          title="응답 전 확인"
          items={audienceReport.respondentDoList}
          variant="check"
        />
        <ChecklistCard
          title="입력하지 말 것"
          items={audienceReport.respondentDontList}
          variant="avoid"
        />
      </div>
    </section>
  );
}
