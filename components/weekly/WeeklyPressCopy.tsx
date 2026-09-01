"use client";

import { useState } from "react";

export function WeeklyPressCopy({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      {compact ? null : (
        <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
          {text}
        </pre>
      )}
      <button
        type="button"
        className="inline-flex rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "복사됨" : "요약 복사"}
      </button>
    </div>
  );
}
