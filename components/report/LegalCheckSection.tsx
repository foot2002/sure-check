import { Scale } from "lucide-react";
import { SectionHeader } from "@/components/report/ui/SectionHeader";
import type { LegalCheckItem, LegalCheckSummary } from "@/lib/reporting/reportMessages";

interface LegalCheckSectionProps {
  summary: LegalCheckSummary;
}

const COLUMNS: Array<{
  key: keyof LegalCheckSummary;
  title: string;
  empty: string;
  tone: string;
  titleTone: string;
}> = [
  {
    key: "severeViolationSuspicions",
    title: "위반 소지 큼",
    empty: "해당 없음",
    tone: "border-[#f5c2cc] bg-[#fdf0f2]",
    titleTone: "text-[#9e2a3e]",
  },
  {
    key: "checkRequiredItems",
    title: "확인 필요",
    empty: "해당 없음",
    tone: "border-[#f0ddb0] bg-[#fdf6e8]",
    titleTone: "text-[#8a5f12]",
  },
  {
    key: "improvementRecommendations",
    title: "개선 권고",
    empty: "해당 없음",
    tone: "border-[#bfdbfe] bg-[#eff6ff]",
    titleTone: "text-[#1e40af]",
  },
  {
    key: "passedItems",
    title: "문제 없음",
    empty: "표시할 항목 없음",
    tone: "border-[#c5e6d4] bg-[#edf7f1]",
    titleTone: "text-[#1f6b47]",
  },
];

function ItemList({ items, empty }: { items: LegalCheckItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="text-sm leading-relaxed text-foreground">
          · {item.label}
        </li>
      ))}
    </ul>
  );
}

export function LegalCheckSection({ summary }: LegalCheckSectionProps) {
  return (
    <section>
      <SectionHeader
        icon={Scale}
        title="법적 체크 결과"
        description="법률 위반을 확정하지 않습니다. 위반 소지·확인·개선 권고로 구분합니다."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <div
            key={column.key}
            className={`rounded-2xl border p-4 ${column.tone}`}
          >
            <p className={`mb-3 text-sm font-bold ${column.titleTone}`}>
              {column.title}
            </p>
            <ItemList items={summary[column.key]} empty={column.empty} />
          </div>
        ))}
      </div>
    </section>
  );
}
