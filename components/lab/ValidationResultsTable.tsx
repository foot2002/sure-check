"use client";

import type { ValidationCase, ValidationResult } from "@/lib/validation/types";

interface ValidationResultsTableProps {
  results: ValidationResult[];
  cases: ValidationCase[];
  onSelectDetail: (caseId: string) => void;
  selectedDetailId: string | null;
}

function findExpected(
  cases: ValidationCase[],
  caseId: string,
): ValidationCase | undefined {
  return cases.find((c) => c.id === caseId);
}

const STATUS_CLASS: Record<string, string> = {
  pass: "text-[#1f6b47]",
  partial: "text-[#8a5f12]",
  fail: "text-[#9e2a3e]",
  skipped: "text-muted",
  error: "text-[#9e2a3e]",
};

export function ValidationResultsTable({
  results,
  cases,
  onSelectDetail,
  selectedDetailId,
}: ValidationResultsTableProps) {
  if (results.length === 0) {
    return (
      <p className="rounded-xl border border-border-subtle bg-surface px-4 py-6 text-center text-[13px] text-muted">
        실행 결과가 없습니다. 검증을 실행해 주세요.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="min-w-full text-left text-[11px]">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="px-2 py-2 font-medium">상태</th>
            <th className="px-2 py-2 font-medium">케이스명</th>
            <th className="min-w-[120px] px-2 py-2 font-medium">URL</th>
            <th className="px-2 py-2 font-medium">기대 플랫폼</th>
            <th className="px-2 py-2 font-medium">실제 플랫폼</th>
            <th className="px-2 py-2 font-medium">기대 추출기</th>
            <th className="px-2 py-2 font-medium">실제 추출기</th>
            <th className="px-2 py-2 font-medium">기대 문항</th>
            <th className="px-2 py-2 font-medium">실제 문항</th>
            <th className="px-2 py-2 font-medium">기대 등급</th>
            <th className="px-2 py-2 font-medium">실제 등급</th>
            <th className="px-2 py-2 font-medium">제한</th>
            <th className="min-w-[120px] px-2 py-2 font-medium">mismatch</th>
            <th className="px-2 py-2 font-medium">상세</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-background">
          {results.map((result) => {
            const expected = findExpected(cases, result.caseId);
            const isSelected = selectedDetailId === result.caseId;
            return (
              <tr key={result.caseId} className="align-top">
                <td className={`px-2 py-2 font-semibold uppercase ${STATUS_CLASS[result.status] ?? ""}`}>
                  {result.status}
                </td>
                <td className="px-2 py-2 font-medium text-foreground">
                  {result.caseName}
                </td>
                <td className="max-w-[140px] truncate px-2 py-2 font-mono text-muted">
                  {result.url}
                </td>
                <td className="px-2 py-2 text-muted">
                  {expected?.expectedPlatform ?? "—"}
                </td>
                <td className="px-2 py-2">{result.actualPlatform}</td>
                <td className="px-2 py-2 text-muted">
                  {expected?.expectedExtractor ?? "—"}
                </td>
                <td className="px-2 py-2">{result.actualExtractor}</td>
                <td className="px-2 py-2 text-muted">
                  {expected?.expectedMinQuestionCount ?? "—"}
                </td>
                <td className="px-2 py-2">{result.actualQuestionCount}</td>
                <td className="px-2 py-2 text-muted">
                  {expected?.expectedRiskGrade ?? "—"}
                </td>
                <td className="px-2 py-2">{result.actualRiskGrade ?? "—"}</td>
                <td className="px-2 py-2">
                  {result.actualIsLimited ? "Y" : "N"}
                </td>
                <td className="max-w-[160px] px-2 py-2 text-muted">
                  {result.mismatches[0] ?? result.warnings[0] ?? "—"}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectDetail(result.caseId)}
                    className={`text-brand hover:underline ${isSelected ? "font-semibold" : ""}`}
                  >
                    {isSelected ? "닫기" : "보기"}
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
