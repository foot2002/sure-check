"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Code2, Copy, Check, FileSearch } from "lucide-react";
import { AnalyzerTrace } from "@/components/AnalyzerTrace";
import { ExtractedQuestionTable } from "@/components/ExtractedQuestionTable";
import type { ScanReport } from "@/lib/types/scan";
import { GRADE_LABELS } from "@/lib/utils/grade";

interface DebugPanelProps {
  report: ScanReport;
}

function boolLabel(value: boolean | undefined): string {
  if (value === undefined) return "—";
  return value ? "true" : "false";
}

function DebugField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border-subtle/60 py-3 last:border-0 sm:grid-cols-[160px_1fr] sm:gap-3">
      <dt className="text-sm font-semibold text-muted md:text-[15px]">{label}</dt>
      <dd
        className={`break-all text-sm text-foreground md:text-[15px] ${mono ? "font-mono text-[13px] md:text-sm" : ""}`}
      >
        {value === "" || value == null ? "—" : value}
      </dd>
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-background">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground md:text-[15px]"
        >
          <Code2 size={16} className="text-muted" />
          {title}
          {open ? (
            <ChevronUp size={16} className="ml-auto text-muted" />
          ) : (
            <ChevronDown size={16} className="ml-auto text-muted" />
          )}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-xs font-semibold text-muted transition hover:bg-surface md:text-sm"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      {open && (
        <pre className="max-h-96 overflow-auto border-t border-border-subtle bg-[#0f1419] px-4 py-3 text-xs leading-relaxed text-[#e6edf3] md:text-sm">
          {json}
        </pre>
      )}
    </div>
  );
}

export function DebugPanel({ report }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [cacheState, setCacheState] = useState<"idle" | "clearing" | "cleared" | "failed">(
    "idle",
  );
  const debug = report.debug;

  async function handleClearCache() {
    setCacheState("clearing");
    try {
      const response = await fetch("/api/cache/clear", { method: "POST" });
      setCacheState(response.ok ? "cleared" : "failed");
    } catch {
      setCacheState("failed");
    }
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left md:px-6 md:py-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
            6
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <FileSearch size={18} strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground md:text-lg">
              상세 설문 분석 결과
            </h2>
            <p className="mt-0.5 text-sm text-muted md:text-[15px]">
              추출 문항, 판단 근거, 진단 메타데이터를 확인합니다.
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={20} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={20} className="shrink-0 text-muted" />
        )}
      </button>

      {open && (
        <div className="space-y-5 border-t border-border-subtle px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-background px-4 py-3">
            <p className="text-sm leading-relaxed text-muted md:text-[15px]">
              이전 진단 결과가 남아 보이면 URL 캐시를 초기화하세요.
            </p>
            <div className="flex items-center gap-2">
              {cacheState === "cleared" && (
                <span className="text-sm font-medium text-emerald-600">초기화됨</span>
              )}
              {cacheState === "failed" && (
                <span className="text-sm font-medium text-red-600">초기화 실패</span>
              )}
              <button
                type="button"
                onClick={handleClearCache}
                disabled={cacheState === "clearing"}
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cacheState === "clearing" ? "초기화 중..." : "URL 캐시 초기화"}
              </button>
            </div>
          </div>

          {!debug ? (
            <p className="text-sm text-muted md:text-[15px]">
              상세 분석 메타데이터가 아직 생성되지 않았습니다.
            </p>
          ) : (
            <>
              <dl className="rounded-xl border border-border-subtle bg-background px-4 py-2">
                <DebugField label="입력 URL" value={debug.inputUrl} mono />
                <DebugField label="정규화 URL" value={debug.normalizedUrl} mono />
                <DebugField label="플랫폼" value={debug.platform} />
                <DebugField
                  label="진단 상태"
                  value={debug.diagnosisStatus ?? report.diagnosisStatus ?? "—"}
                />
                <DebugField label="최종 URL" value={debug.finalUrl ?? "—"} mono />
                <DebugField label="추출기" value={debug.extractorName} />
                <DebugField label="문항 수" value={debug.questionCount} />
                <DebugField label="부분 진단" value={boolLabel(debug.partialScan)} />
                <DebugField label="진단 제한" value={boolLabel(debug.isLimited)} />
                <DebugField label="제한 사유" value={debug.limitedReason ?? "—"} />
                <DebugField label="신뢰도" value={debug.confidence ?? "—"} />
                <DebugField label="분기 감지" value={boolLabel(debug.branchDetected)} />
                <DebugField label="로그인 필요" value={boolLabel(debug.loginRequired)} />
                <DebugField label="응답 마감" value={boolLabel(debug.closedForm)} />
                <DebugField
                  label="맥락"
                  value={
                    debug.contextSummary ??
                    (debug.contextLabels.length > 0
                      ? debug.contextLabels.join(", ")
                      : "—")
                  }
                />
                <DebugField
                  label="공공부문 감지"
                  value={boolLabel(debug.publicSectorDetected)}
                />
                <DebugField
                  label="공공부문 근거"
                  value={debug.publicSectorEvidence.join(" | ") || "—"}
                />
                <DebugField
                  label="수집정보 위험"
                  value={
                    debug.dataRiskLevel
                      ? `${debug.dataRiskLevel} (${debug.dataRiskLabel ?? ""})`
                      : "—"
                  }
                />
                <DebugField
                  label="도구 위험"
                  value={
                    debug.toolRiskLevel
                      ? `${debug.toolRiskLevel} (${debug.toolRiskLabel ?? ""})`
                      : "—"
                  }
                />
                <DebugField
                  label="필수 의무"
                  value={
                    debug.obligations.length > 0
                      ? debug.obligations.map((o) => o.label).join(", ")
                      : "—"
                  }
                />
                <DebugField
                  label="누락 고지"
                  value={
                    debug.missingNotices.length > 0
                      ? debug.missingNotices
                          .map((gap) => `${gap.label} [${gap.status}]`)
                          .join(", ")
                      : "—"
                  }
                />
                <DebugField
                  label="관리 위험"
                  value={
                    debug.managementItems.length > 0
                      ? debug.managementItems
                          .map((item) => `${item.label} [${item.status}]`)
                          .join(", ")
                      : "—"
                  }
                />
                <DebugField
                  label="등급 보정 규칙"
                  value={
                    debug.overrideRules.length > 0
                      ? debug.overrideRules.map((rule) => rule.ruleId).join(", ")
                      : "—"
                  }
                />
                <DebugField
                  label="적용된 보정"
                  value={
                    debug.overrideRules.length > 0
                      ? debug.overrideRules
                          .map((rule) => `${rule.ruleId} → ${rule.minGrade}`)
                          .join(", ")
                      : "—"
                  }
                />
                <DebugField
                  label="최종 점수"
                  value={debug.finalScore ?? (debug.isLimited ? "산정 불가" : "—")}
                />
                <DebugField
                  label="최종 등급"
                  value={
                    debug.finalGrade
                      ? `${debug.finalGrade} (${GRADE_LABELS[debug.finalGrade]})`
                      : "—"
                  }
                />
              </dl>

              <div>
                <h3 className="mb-3 text-base font-bold text-foreground md:text-lg">
                  추출 문항
                </h3>
                <ExtractedQuestionTable questions={report.form.questions} readable />
              </div>

              <div>
                <h3 className="mb-3 text-base font-bold text-foreground md:text-lg">
                  Analyzer 판단 흐름
                </h3>
                <AnalyzerTrace trace={report.analyzerTrace} readable />
              </div>
            </>
          )}

          <div className="space-y-3">
            <JsonBlock title="NormalizedForm JSON" data={report.form} />
            <JsonBlock title="ScanReport JSON" data={report} />
          </div>
        </div>
      )}
    </section>
  );
}
