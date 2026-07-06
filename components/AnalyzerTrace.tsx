import type { AnalyzerTrace } from "@/lib/types/debug";

interface AnalyzerTraceProps {
  trace?: AnalyzerTrace;
  readable?: boolean;
}

export function AnalyzerTrace({ trace, readable = false }: AnalyzerTraceProps) {
  if (!trace || trace.steps.length === 0) {
    return (
      <p className={readable ? "text-sm text-muted md:text-[15px]" : "text-[12px] text-muted"}>
        analyzer trace 정보가 없습니다.
      </p>
    );
  }

  const titleClass = readable
    ? "text-sm font-bold text-foreground md:text-[15px]"
    : "text-[12px] font-semibold text-foreground";
  const summaryClass = readable
    ? "text-sm text-brand md:text-[15px]"
    : "text-[11px] text-brand";
  const detailClass = readable
    ? "text-sm leading-relaxed text-muted md:text-[15px]"
    : "text-[11px] leading-relaxed text-muted";
  const itemClass = readable ? "px-4 py-3" : "px-3 py-2.5";

  return (
    <ol className="space-y-3">
      {trace.steps.map((step) => (
        <li
          key={step.id}
          className={`rounded-xl border border-border-subtle bg-surface ${itemClass}`}
        >
          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={titleClass}>{step.title}</span>
            <span className={summaryClass}>{step.summary}</span>
          </div>
          {step.details.length > 0 && (
            <ul className="mt-2 space-y-1">
              {step.details.map((detail, index) => (
                <li key={`${step.id}_${index}`} className={detailClass}>
                  · {detail}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
