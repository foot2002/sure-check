"use client";

import type { ValidationCase } from "@/lib/validation/types";
import type { CaseProgressState } from "@/lib/validation/types";

interface ValidationCaseTableProps {
  cases: ValidationCase[];
  selectedIds: Set<string>;
  progress: Record<string, CaseProgressState>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleEnabled: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ValidationCaseTable({
  cases,
  selectedIds,
  progress,
  onToggleSelect,
  onToggleSelectAll,
  onToggleEnabled,
  onRemove,
}: ValidationCaseTableProps) {
  const allSelected = cases.length > 0 && cases.every((c) => selectedIds.has(c.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="min-w-full text-left text-[11px]">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="px-2 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="전체 선택"
              />
            </th>
            <th className="px-2 py-2 font-medium">enabled</th>
            <th className="px-2 py-2 font-medium">이름</th>
            <th className="min-w-[160px] px-2 py-2 font-medium">URL</th>
            <th className="px-2 py-2 font-medium">group</th>
            <th className="px-2 py-2 font-medium">기대 플랫폼</th>
            <th className="px-2 py-2 font-medium">기대 추출기</th>
            <th className="px-2 py-2 font-medium">진행</th>
            <th className="px-2 py-2 font-medium">삭제</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-background">
          {cases.map((testCase) => {
            const state = progress[testCase.id];
            return (
              <tr key={testCase.id} className="align-top">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(testCase.id)}
                    onChange={() => onToggleSelect(testCase.id)}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={testCase.enabled}
                    onChange={() => onToggleEnabled(testCase.id)}
                  />
                </td>
                <td className="max-w-[140px] px-2 py-2 font-medium text-foreground">
                  {testCase.name}
                </td>
                <td className="max-w-[200px] truncate px-2 py-2 font-mono text-muted">
                  {testCase.url}
                </td>
                <td className="px-2 py-2 text-muted">{testCase.platformGroup}</td>
                <td className="px-2 py-2 text-muted">
                  {testCase.expectedPlatform ?? "—"}
                </td>
                <td className="px-2 py-2 text-muted">
                  {testCase.expectedExtractor ?? "—"}
                </td>
                <td className="px-2 py-2">
                  {state?.progress === "running" && (
                    <span className="text-brand">실행 중…</span>
                  )}
                  {state?.resultStatus && state.progress === "done" && (
                    <span>{state.resultStatus}</span>
                  )}
                  {!state && "—"}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onRemove(testCase.id)}
                    className="text-[#9e2a3e] hover:underline"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
