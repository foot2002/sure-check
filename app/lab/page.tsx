"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Download,
  FlaskConical,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { GoldenCasesPanel } from "@/components/lab/GoldenCasesPanel";
import { PlatformCoverageMatrix } from "@/components/lab/PlatformCoverageMatrix";
import { ValidationCaseForm } from "@/components/lab/ValidationCaseForm";
import { ValidationCaseTable } from "@/components/lab/ValidationCaseTable";
import { ValidationResultCard } from "@/components/lab/ValidationResultCard";
import { ValidationResultsTable } from "@/components/lab/ValidationResultsTable";
import { ValidationRunPanel } from "@/components/lab/ValidationRunPanel";
import { ValidationSummary } from "@/components/lab/ValidationSummary";
import {
  copyValidationJson,
  downloadValidationCsv,
  downloadValidationJson,
} from "@/lib/validation/exportValidationResults";
import {
  buildValidationSummary,
  runValidationCases,
} from "@/lib/validation/runValidationCase";
import type {
  CaseProgressState,
  ValidationCase,
  ValidationResult,
} from "@/lib/validation/types";
import {
  clearAllValidationStorage,
  clearValidationResults,
  loadLastRunAt,
  loadValidationCases,
  loadValidationResults,
  resetValidationCasesToDefault,
  saveValidationCases,
  saveValidationResults,
} from "@/lib/validation/validationStorage";

export default function LabPage() {
  const [activeTab, setActiveTab] = useState<"validation" | "golden">("validation");
  const [cases, setCases] = useState<ValidationCase[]>(() =>
    loadValidationCases(),
  );
  const [results, setResults] = useState<ValidationResult[]>(() =>
    loadValidationResults(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, CaseProgressState>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runningCaseName, setRunningCaseName] = useState<string>();
  const [lastRunAt, setLastRunAt] = useState<string | null>(() =>
    loadLastRunAt(),
  );
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    saveValidationCases(cases);
  }, [cases]);

  const summary = useMemo(
    () => (results.length > 0 ? buildValidationSummary(results) : null),
    [results],
  );

  const detailResult = useMemo(
    () => results.find((r) => r.caseId === detailCaseId),
    [results, detailCaseId],
  );

  const persistResults = useCallback((next: ValidationResult[]) => {
    setResults(next);
    saveValidationResults(next);
    setLastRunAt(new Date().toISOString());
  }, []);

  const executeCases = useCallback(
    async (targetCases: ValidationCase[]) => {
      if (targetCases.length === 0 || isRunning) return;
      setIsRunning(true);
      setProgress({});

      const nextResults = [...results];
      const resultMap = new Map(nextResults.map((r) => [r.caseId, r]));

      const runResults = await runValidationCases(
        targetCases,
        (caseId, phase, result) => {
          const testCase = targetCases.find((c) => c.id === caseId);
          if (phase === "running") {
            setRunningCaseName(testCase?.name);
            setProgress((prev) => ({
              ...prev,
              [caseId]: { caseId, progress: "running" },
            }));
          } else if (result) {
            resultMap.set(caseId, result);
            setProgress((prev) => ({
              ...prev,
              [caseId]: {
                caseId,
                progress: "done",
                resultStatus: result.status,
              },
            }));
            persistResults([...resultMap.values()]);
          }
        },
      );

      for (const result of runResults) {
        resultMap.set(result.caseId, result);
      }
      persistResults([...resultMap.values()]);
      setIsRunning(false);
      setRunningCaseName(undefined);
    },
    [isRunning, persistResults, results],
  );

  function handleRunAll() {
    void executeCases(cases.filter((c) => c.enabled));
  }

  function handleRunSelected() {
    const selected = cases.filter((c) => selectedIds.has(c.id));
    void executeCases(selected);
  }

  function handleRerunFailed() {
    const failedIds = new Set(
      results
        .filter((r) => r.status === "fail" || r.status === "error")
        .map((r) => r.caseId),
    );
    void executeCases(cases.filter((c) => failedIds.has(c.id)));
  }

  function handleAddCase(testCase: ValidationCase) {
    setCases((prev) => [...prev, testCase]);
    setSelectedIds((prev) => new Set(prev).add(testCase.id));
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (cases.every((c) => selectedIds.has(c.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cases.map((c) => c.id)));
    }
  }

  function handleToggleEnabled(id: string) {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  }

  function handleRemove(id: string) {
    setCases((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleCopyJson() {
    if (!summary) return;
    await copyValidationJson(results, cases, summary);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border-subtle bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-[#f0f4ff] px-2.5 py-0.5 text-[10px] font-semibold text-[#3b5bdb]">
              개발자용 검증 페이지
            </span>
          </div>
          <Link href="/" className="text-[12px] text-muted hover:text-brand">
            ← 메인으로
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-8 md:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
            <FlaskConical size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              SURE Check 검증 Lab
            </h1>
            <p className="mt-1 text-[13px] text-muted">
              플랫폼별 추출·탐지·진단 품질을 기대값과 비교 검증합니다. 순차
              실행(케이스 간 500ms delay) · DB 미사용 · localStorage 저장
            </p>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">상단 요약</h2>
          <ValidationSummary summary={summary} lastRunAt={lastRunAt} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            플랫폼 커버리지 매트릭스
          </h2>
          <PlatformCoverageMatrix />
        </section>

        <div className="flex flex-wrap gap-2 rounded-xl border border-border-subtle bg-surface p-2">
          <button
            type="button"
            onClick={() => setActiveTab("validation")}
            className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
              activeTab === "validation"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            URL Validation Cases
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("golden")}
            className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
              activeTab === "golden"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Golden Cases
          </button>
        </div>

        {activeTab === "golden" ? (
          <GoldenCasesPanel />
        ) : (
          <>
            <ValidationCaseForm onAdd={handleAddCase} />

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  테스트 케이스 ({cases.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCases(resetValidationCasesToDefault())}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px]"
                  >
                    <RotateCcw size={12} />
                    기본 케이스로 초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearValidationResults();
                      setResults([]);
                      setLastRunAt(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px]"
                  >
                    결과만 초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearAllValidationStorage();
                      setCases(resetValidationCasesToDefault());
                      setResults([]);
                      setLastRunAt(null);
                      setSelectedIds(new Set());
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#f5c2cc] px-3 py-1.5 text-[11px] text-[#9e2a3e]"
                  >
                    <Trash2 size={12} />
                    전체 초기화
                  </button>
                </div>
              </div>
              <ValidationCaseTable
                cases={cases}
                selectedIds={selectedIds}
                progress={progress}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onToggleEnabled={handleToggleEnabled}
                onRemove={handleRemove}
              />
            </section>

            <ValidationRunPanel
              isRunning={isRunning}
              runningCaseName={runningCaseName}
              onRunAll={handleRunAll}
              onRunSelected={handleRunSelected}
              onRerunFailed={handleRerunFailed}
            />

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">결과 테이블</h2>
                {summary && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyJson()}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px]"
                    >
                      <Copy size={12} />
                      {copyDone ? "복사됨" : "JSON 복사"}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadValidationJson(results, cases, summary)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px]"
                    >
                      <Download size={12} />
                      JSON 다운로드
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadValidationCsv(results, cases)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px]"
                    >
                      <Download size={12} />
                      CSV 다운로드
                    </button>
                  </div>
                )}
              </div>
              <ValidationResultsTable
                results={results}
                cases={cases}
                selectedDetailId={detailCaseId}
                onSelectDetail={(id) =>
                  setDetailCaseId((prev) => (prev === id ? null : id))
                }
              />
              {detailResult && (
                <ValidationResultCard result={detailResult} defaultOpen />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
