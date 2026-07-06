import type { AudienceReport } from "@/lib/reporting/reportMessages";

interface RespondentAdviceBoxProps {
  audienceReport: AudienceReport;
}

function AdviceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {items.slice(0, 5).map((item) => (
          <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-muted">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RespondentAdviceBox({
  audienceReport,
}: RespondentAdviceBoxProps) {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-[#c5dce8]/60 bg-[#f7fafc] p-4 md:p-5">
        <AdviceList
          title="응답 전 확인할 점"
          items={audienceReport.respondentDoList}
        />
      </div>
      <div className="rounded-xl border border-[#f0ddb0]/60 bg-[#fdfaf3] p-4 md:p-5">
        <AdviceList
          title="입력하지 않는 것이 좋은 정보"
          items={audienceReport.respondentDontList}
        />
      </div>
    </section>
  );
}
