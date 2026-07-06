"use client";

import { Loader2, Play, RotateCcw } from "lucide-react";

interface ValidationRunPanelProps {
  isRunning: boolean;
  runningCaseName?: string;
  onRunAll: () => void;
  onRunSelected: () => void;
  onRerunFailed: () => void;
}

export function ValidationRunPanel({
  isRunning,
  runningCaseName,
  onRunAll,
  onRunSelected,
  onRerunFailed,
}: ValidationRunPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface p-4">
      <button
        type="button"
        disabled={isRunning}
        onClick={onRunAll}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
      >
        {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        전체 실행
      </button>
      <button
        type="button"
        disabled={isRunning}
        onClick={onRunSelected}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[13px] font-medium disabled:opacity-50"
      >
        선택된 케이스만 실행
      </button>
      <button
        type="button"
        disabled={isRunning}
        onClick={onRerunFailed}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-[13px] font-medium disabled:opacity-50"
      >
        <RotateCcw size={14} />
        실패 케이스만 재실행
      </button>
      {isRunning && (
        <span className="text-[12px] text-muted">
          순차 실행 중… {runningCaseName ? `(${runningCaseName})` : ""}
        </span>
      )}
    </div>
  );
}
