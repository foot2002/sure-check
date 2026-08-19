"use client";

export function SurveyUrlActions({
  url,
  onCopied,
  compact = false,
}: {
  url: string | null | undefined;
  onCopied?: () => void;
  compact?: boolean;
}) {
  if (!url) {
    return (
      <span className={compact ? "text-[11px] text-slate-400" : "text-xs text-slate-500"}>
        원본 URL 없음
      </span>
    );
  }

  const btn = compact
    ? "rounded border border-teal-700 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-50"
    : "rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800";
  const ghost = compact
    ? "rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
    : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={btn}
        onClick={(event) => event.stopPropagation()}
      >
        원본 설문 열기
      </a>
      <button
        type="button"
        className={ghost}
        onClick={async (event) => {
          event.stopPropagation();
          await navigator.clipboard.writeText(url);
          onCopied?.();
        }}
      >
        설문 URL 복사
      </button>
    </span>
  );
}
