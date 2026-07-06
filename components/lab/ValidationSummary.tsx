import type { ValidationRunSummary } from "@/lib/validation/types";

interface ValidationSummaryProps {
  summary: ValidationRunSummary | null;
  lastRunAt: string | null;
}

export function ValidationSummary({ summary, lastRunAt }: ValidationSummaryProps) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-4 text-[13px] text-muted">
        아직 검증 실행 결과가 없습니다.
      </div>
    );
  }

  const cards = [
    { label: "전체", value: summary.total },
    { label: "통과", value: summary.passed, color: "text-[#1f6b47]" },
    { label: "부분통과", value: summary.partial, color: "text-[#8a5f12]" },
    { label: "실패", value: summary.failed, color: "text-[#9e2a3e]" },
    { label: "스킵", value: summary.skipped },
    { label: "오류", value: summary.errors },
    { label: "평균 문항", value: summary.averageQuestionCount },
    { label: "진단 제한", value: summary.limitedCount },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border-subtle bg-surface px-3 py-2 text-center"
          >
            <p className="text-[10px] text-muted">{card.label}</p>
            <p className={`text-lg font-semibold ${card.color ?? "text-foreground"}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {Object.keys(summary.platformSuccessRates).length > 0 && (
        <div className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold text-muted">플랫폼별 성공률</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(summary.platformSuccessRates).map(([platform, stats]) => (
              <span key={platform} className="text-[12px] text-foreground">
                {platform}: {stats.rate}% ({stats.passed}/{stats.total})
              </span>
            ))}
          </div>
        </div>
      )}

      {lastRunAt && (
        <p className="text-[11px] text-muted">마지막 실행: {lastRunAt}</p>
      )}
    </div>
  );
}
