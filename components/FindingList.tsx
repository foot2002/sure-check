import type { ScanFinding } from "@/lib/types/scan";

const severityLabels: Record<ScanFinding["severity"], string> = {
  info: "정보",
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "매우 높음",
};

const severityColors: Record<ScanFinding["severity"], string> = {
  info: "bg-background text-muted border-border",
  low: "bg-accent-light text-accent border-[#c5dce8]",
  medium: "bg-[#fdf6e8] text-[#8a5f12] border-[#f0ddb0]",
  high: "bg-[#fdf0e8] text-[#a34a1a] border-[#f5cdb0]",
  critical: "bg-[#fdf0f2] text-[#9e2a3e] border-[#f5c2cc]",
};

const categoryLabels: Record<ScanFinding["category"], string> = {
  context: "맥락",
  data: "수집정보",
  tool: "도구·처리",
  notice: "고지·동의",
  management: "관리·운영",
  override: "진단 제한",
};

interface FindingListProps {
  findings: ScanFinding[];
}

export function FindingList({ findings }: FindingListProps) {
  if (findings.length === 0) return null;

  return (
    <section className="rounded-xl border border-border-subtle bg-surface p-4 md:p-5">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">
        상세 발견 사항
      </h3>
      <ul className="space-y-2.5">
        {findings.map((finding) => (
          <li
            key={finding.id}
            className="rounded-lg border border-border-subtle bg-background p-3.5"
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-medium text-foreground">
                {finding.title}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${severityColors[finding.severity]}`}
              >
                {severityLabels[finding.severity]}
              </span>
              <span className="rounded bg-border/60 px-1.5 py-0.5 text-[10px] text-muted">
                {categoryLabels[finding.category]}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              {finding.description}
            </p>
            {finding.evidence && finding.evidence.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {finding.evidence.map((ev, i) => (
                  <li key={i} className="text-[11px] text-muted/80">
                    근거: {ev}
                  </li>
                ))}
              </ul>
            )}
            {finding.recommendation && (
              <p className="mt-2 text-[12px] text-brand">
                권고: {finding.recommendation}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
