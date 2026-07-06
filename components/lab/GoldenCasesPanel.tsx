"use client";

import { useMemo, useState } from "react";
import { Download, FlaskConical, RotateCcw } from "lucide-react";
import { GOLDEN_CASES, type GoldenCase } from "@/lib/validation/goldenCases";
import type { GoldenCaseResult } from "@/lib/validation/compareGoldenCase";
import {
  buildGoldenSummary,
  downloadGoldenResultsJson,
  runGoldenCases,
} from "@/lib/validation/runGoldenCase";

const STATUS_CLASS: Record<string, string> = {
  pass: "border-[#c5e6d4] bg-[#edf7f1] text-[#1f6b47]",
  partial: "border-[#f0ddb0] bg-[#fdf6e8] text-[#8a5f12]",
  fail: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  error: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  skipped: "border-border-subtle bg-surface text-muted",
};

function dataItems(result?: GoldenCaseResult): string {
  if (!result) return "—";
  const items = [
    ...(result.dataItems.directIdentifiers ?? []),
    ...(result.dataItems.quasiIdentifiers ?? []),
    ...(result.dataItems.generalOpinions ?? []),
    ...(result.dataItems.sensitiveItems ?? []),
    ...(result.dataItems.highRiskItems ?? []),
  ];
  return items.length > 0 ? [...new Set(items)].join(", ") : "없음";
}

function expectedItems(goldenCase: GoldenCase): string {
  const expected = goldenCase.expectedDataItems;
  if (!expected) return "—";
  const items = [
    ...(expected.directIdentifiers ?? []),
    ...(expected.quasiIdentifiers ?? []),
    ...(expected.generalOpinions ?? []),
    ...(expected.sensitiveItems ?? []),
    ...(expected.highRiskItems ?? []),
  ];
  return items.length > 0 ? items.join(", ") : "없음";
}

function expectedDecision(goldenCase: GoldenCase): string {
  if (!goldenCase.expectedDecision) return "—";
  return Array.isArray(goldenCase.expectedDecision)
    ? goldenCase.expectedDecision.join(", ")
    : goldenCase.expectedDecision;
}

export function GoldenCasesPanel() {
  const [results, setResults] = useState<GoldenCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningCaseName, setRunningCaseName] = useState<string>();

  const resultMap = useMemo(
    () => new Map(results.map((result) => [result.caseId, result])),
    [results],
  );
  const summary = useMemo(
    () => (results.length > 0 ? buildGoldenSummary(results) : null),
    [results],
  );

  async function execute(targetCases: GoldenCase[]) {
    if (isRunning || targetCases.length === 0) return;
    setIsRunning(true);

    const nextMap = new Map(results.map((result) => [result.caseId, result]));
    const runResults = await runGoldenCases(targetCases, (caseId, phase, result) => {
      const goldenCase = targetCases.find((item) => item.id === caseId);
      if (phase === "running") {
        setRunningCaseName(goldenCase?.name);
      }
      if (phase === "done" && result) {
        nextMap.set(caseId, result);
        setResults([...nextMap.values()]);
      }
    });

    for (const result of runResults) {
      nextMap.set(result.caseId, result);
    }
    setResults([...nextMap.values()]);
    setRunningCaseName(undefined);
    setIsRunning(false);
  }

  function handleRunFailed() {
    const failedIds = new Set(
      results
        .filter((result) => result.status === "fail" || result.status === "error")
        .map((result) => result.caseId),
    );
    void execute(GOLDEN_CASES.filter((goldenCase) => failedIds.has(goldenCase.id)));
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-brand" />
              <h2 className="text-sm font-semibold text-foreground">
                Golden Cases
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              대표 설문 유형별 기대 결과를 고정해 룰 회귀를 검증합니다. 특정
              설문명 예외처리가 아니라 공통 패턴 기준으로 검사합니다.
            </p>
            {isRunning && (
              <p className="mt-2 text-[12px] text-brand">
                실행 중: {runningCaseName ?? "Golden Case"}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void execute(GOLDEN_CASES)}
              disabled={isRunning}
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              전체 Golden Case 실행
            </button>
            <button
              type="button"
              onClick={handleRunFailed}
              disabled={isRunning || results.every((result) => result.status === "pass")}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw size={12} />
              실패 케이스만 재실행
            </button>
            <button
              type="button"
              onClick={() => downloadGoldenResultsJson(results)}
              disabled={results.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={12} />
              결과 JSON 다운로드
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-4 grid gap-2 text-[12px] sm:grid-cols-5">
            <div className="rounded-lg bg-background p-3">
              전체 <strong>{summary.total}</strong>
            </div>
            <div className="rounded-lg bg-background p-3 text-[#1f6b47]">
              통과 <strong>{summary.passed}</strong>
            </div>
            <div className="rounded-lg bg-background p-3 text-[#8a5f12]">
              부분 <strong>{summary.partial}</strong>
            </div>
            <div className="rounded-lg bg-background p-3 text-[#9e2a3e]">
              실패 <strong>{summary.failed + summary.errors}</strong>
            </div>
            <div className="rounded-lg bg-background p-3">
              제한 <strong>{summary.limitedCount}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-background">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="min-w-[180px] px-3 py-2 font-medium">케이스명</th>
              <th className="px-3 py-2 font-medium">시나리오</th>
              <th className="px-3 py-2 font-medium">기대 판단</th>
              <th className="px-3 py-2 font-medium">실제 판단</th>
              <th className="min-w-[220px] px-3 py-2 font-medium">기대 데이터</th>
              <th className="min-w-[220px] px-3 py-2 font-medium">실제 데이터</th>
              <th className="min-w-[220px] px-3 py-2 font-medium">mismatch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {GOLDEN_CASES.map((goldenCase) => {
              const result = resultMap.get(goldenCase.id);
              const status = result?.status ?? "skipped";
              return (
                <tr key={goldenCase.id} className="align-top">
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[status]}`}
                    >
                      {result?.status ?? "대기"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <div className="font-medium">{goldenCase.name}</div>
                    <div className="mt-1 text-[11px] text-muted">
                      {goldenCase.description}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted">
                    {goldenCase.scenarioType}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {expectedDecision(goldenCase)}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {result ? `${result.decision} (${result.score ?? "점수 없음"})` : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {expectedItems(goldenCase)}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {dataItems(result)}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {result?.mismatches.length
                      ? result.mismatches.join(" / ")
                      : result
                        ? "—"
                        : "미실행"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
