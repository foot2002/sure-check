import type {
  OperatorFix,
  OperatorFixPriority,
} from "@/lib/reporting/reportMessages";

interface RequiredFixListProps {
  title: string;
  fixes: OperatorFix[];
  emptyText: string;
}

const priorityLabels: Record<OperatorFixPriority, string> = {
  required: "필수",
  recommended: "권장",
  optional: "선택",
};

const categoryLabels: Record<OperatorFix["category"], string> = {
  basic_notice: "기본 고지",
  retention_deletion: "보유·파기",
  outsourcing: "도구·위탁",
  overseas_transfer: "국외이전",
  sensitive_data: "민감정보",
  public_sector: "공공기관",
  employee_survey: "직원설문",
  event_reward: "경품",
  marketing: "마케팅",
  anonymity: "익명성",
};

export function RequiredFixList({
  title,
  fixes,
  emptyText,
}: RequiredFixListProps) {
  return (
    <div className="rounded-xl border border-border-subtle bg-background p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">{title}</h3>
      {fixes.length === 0 ? (
        <p className="text-[13px] text-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {fixes.map((fix) => (
            <li key={`${fix.category}_${fix.title}`} className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium text-foreground">
                  {fix.title}
                </span>
                <span className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                  {priorityLabels[fix.priority]}
                </span>
                <span className="rounded bg-brand-light px-1.5 py-0.5 text-[10px] text-brand">
                  {categoryLabels[fix.category]}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">{fix.reason}</p>
              <p className="text-[12px] leading-relaxed text-foreground">
                {fix.action}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
