"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function PressShareSummaryBox({ summary }: { summary: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">보도·공유용 요약</h2>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              복사됨
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              요약 복사
            </>
          )}
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{summary}</p>
      <p className="mt-3 text-xs text-slate-500">
        개별 기관명·설문 URL·문항 원문은 포함하지 않습니다.
      </p>
    </section>
  );
}
