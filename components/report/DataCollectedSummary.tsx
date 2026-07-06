import type { CollectedDataSummary } from "@/lib/reporting/reportMessages";

interface DataCollectedSummaryProps {
  summary: CollectedDataSummary;
}

const groups: {
  key: keyof CollectedDataSummary;
  title: string;
  emptyText: string;
  tone: string;
}[] = [
  {
    key: "directIdentifiers",
    title: "직접식별정보",
    emptyText: "없음",
    tone: "border-[#f5cdb0] bg-[#fdf0e8] text-[#a34a1a]",
  },
  {
    key: "quasiIdentifiers",
    title: "준식별정보",
    emptyText: "없음",
    tone: "border-[#f0ddb0] bg-[#fdf6e8] text-[#8a5f12]",
  },
  {
    key: "sensitiveItems",
    title: "민감정보",
    emptyText: "없음",
    tone: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  },
  {
    key: "highRiskItems",
    title: "고위험정보",
    emptyText: "없음",
    tone: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  },
];

export function DataCollectedSummary({ summary }: DataCollectedSummaryProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface p-4 md:p-5">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">
        이 설문이 요구하는 정보
      </h3>
      <div className="space-y-3">
        {groups.map((group) => {
          const items = summary[group.key];
          return (
            <div key={group.key}>
              <p className="mb-1.5 text-[11px] font-medium text-muted">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {items.length > 0 ? (
                  items.map((item) => (
                    <span
                      key={item}
                      className={`rounded-full border px-2 py-1 text-[11px] ${group.tone}`}
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-border-subtle bg-background px-2 py-1 text-[11px] text-muted">
                    {group.emptyText}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
