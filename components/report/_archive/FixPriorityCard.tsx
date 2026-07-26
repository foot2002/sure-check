"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { OperatorFix } from "@/lib/reporting/reportMessages";

interface FixPriorityCardProps {
  title: string;
  fixes: OperatorFix[];
  emptyText: string;
  initiallyVisible?: number;
  variant?: "required" | "recommended" | "neutral";
}

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

const variantStyles = {
  required: {
    card: "border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white",
    badge: "bg-[#dbeafe] text-[#1e40af]",
    title: "text-[#172554]",
  },
  recommended: {
    card: "border-[#c7d7f5] bg-gradient-to-br from-[#f8fbff] to-white",
    badge: "bg-[#eff6ff] text-[#1e40af]",
    title: "text-[#1e3a8a]",
  },
  neutral: {
    card: "border-border-subtle bg-white",
    badge: "bg-[#f1f5f9] text-[#475569]",
    title: "text-foreground",
  },
};

function dedupeFixes(fixes: OperatorFix[]): OperatorFix[] {
  const grouped = new Map<string, OperatorFix>();
  for (const fix of fixes) {
    let key = fix.title;
    if (/보유|파기/.test(`${fix.title} ${fix.reason}`)) {
      key = "보유기간과 파기 기준 명시";
    } else if (/수탁자|위탁/.test(`${fix.title} ${fix.reason}`)) {
      key = "외부 설문 SaaS 위탁 안내 보완";
    }
    if (!grouped.has(key)) grouped.set(key, { ...fix, title: key });
  }
  return [...grouped.values()];
}

export function FixPriorityCard({
  title,
  fixes,
  emptyText,
  initiallyVisible = 5,
  variant = "neutral",
}: FixPriorityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const items = dedupeFixes(fixes);
  const visible = expanded ? items : items.slice(0, initiallyVisible);
  const hiddenCount = Math.max(0, items.length - initiallyVisible);
  const styles = variantStyles[variant];

  return (
    <div className={`report-summary-card border p-5 ${styles.card}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className={`text-base ${styles.title}`}>
          <span className="font-bold">{title}</span>
        </h3>
        <span className={`rounded-full px-2.5 py-1 text-xs ${styles.badge}`}>
          {items.length}건
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted md:text-[15px]">
          {emptyText}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted md:text-[15px]">
          세부 보완사항은 접혀 있습니다. 필요하면 펼쳐서 확인하세요.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((fix) => (
            <li
              key={`${fix.category}_${fix.title}`}
              className="rounded-xl border border-[#e8edf6] bg-white p-4 shadow-sm"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground md:text-[15px]">
                  <span className="font-bold">{fix.title}</span>
                </p>
                <span className="rounded-md bg-[#eff6ff] px-2 py-0.5 text-xs text-[#1e40af]">
                  {categoryLabels[fix.category]}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-muted">{fix.reason}</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground md:text-[15px]">
                {fix.action}
              </p>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span className="font-bold">{expanded ? "접기" : `더 보기 (${hiddenCount}건)`}</span>
        </button>
      )}
    </div>
  );
}
