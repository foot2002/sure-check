"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { ExtractedQuestionTable } from "@/components/ExtractedQuestionTable";
import type { ValidationResult } from "@/lib/validation/types";

interface ValidationResultCardProps {
  result: ValidationResult;
  defaultOpen?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  pass: "bg-[#edf7f1] text-[#1f6b47] border-[#c5e6d4]",
  partial: "bg-[#fdf6e8] text-[#8a5f12] border-[#f0ddb0]",
  fail: "bg-[#fdf0f2] text-[#9e2a3e] border-[#f5c2cc]",
  skipped: "bg-[#f3f4f6] text-[#4b5563] border-[#d1d5db]",
  error: "bg-[#fdf0f2] text-[#9e2a3e] border-[#f5c2cc]",
};

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-border-subtle">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left text-[11px] font-medium"
        >
          {title}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <button type="button" onClick={handleCopy} className="text-[10px] text-muted">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-border-subtle bg-[#0f1419] p-2 text-[10px] text-[#e6edf3]">
          {json}
        </pre>
      )}
    </div>
  );
}

export function ValidationResultCard({
  result,
  defaultOpen = false,
}: ValidationResultCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const overrideRules = result.report?.debug?.overrideRules ?? [];

  return (
    <div className="rounded-xl border border-border-subtle bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[result.status] ?? ""}`}
        >
          {result.status}
        </span>
        <span className="flex-1 text-[13px] font-medium text-foreground">
          {result.caseName}
        </span>
        <span className="hidden text-[11px] text-muted sm:inline">
          {result.mismatches[0] ?? result.warnings[0] ?? "일치"}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border-subtle px-4 py-3">
          <p className="break-all font-mono text-[11px] text-muted">{result.url}</p>

          <div className="grid gap-2 text-[11px] md:grid-cols-2">
            <p>
              <span className="text-muted">플랫폼:</span> {result.actualPlatform}
            </p>
            <p>
              <span className="text-muted">추출기:</span> {result.actualExtractor}
            </p>
            <p>
              <span className="text-muted">문항:</span> {result.actualQuestionCount}
            </p>
            <p>
              <span className="text-muted">등급:</span> {result.actualRiskGrade ?? "—"}
            </p>
            <p>
              <span className="text-muted">제한:</span>{" "}
              {result.actualIsLimited ? "Y" : "N"}
            </p>
            <p>
              <span className="text-muted">diagnosisStatus:</span>{" "}
              {result.actualDiagnosisStatus ?? "—"}
            </p>
            <p>
              <span className="text-muted">dataLevel:</span>{" "}
              {result.actualDataLevel ?? "—"}
            </p>
          </div>

          {result.matched.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[#1f6b47]">matched</p>
              <ul className="space-y-0.5 text-[11px] text-muted">
                {result.matched.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.mismatches.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[#9e2a3e]">mismatches</p>
              <ul className="space-y-0.5 text-[11px] text-muted">
                {result.mismatches.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[#8a5f12]">warnings</p>
              <ul className="space-y-0.5 text-[11px] text-muted">
                {result.warnings.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.actualDetectedCategories.length > 0 && (
            <p className="text-[11px] text-muted">
              detectedCategories: {result.actualDetectedCategories.join(", ")}
            </p>
          )}

          {overrideRules.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold">override rules</p>
              <ul className="text-[11px] text-muted">
                {overrideRules.map((rule) => (
                  <li key={rule.ruleId}>
                    · {rule.ruleId} → {rule.minGrade}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.report && (
            <>
              <div>
                <p className="mb-2 text-[11px] font-semibold">추출 문항</p>
                <ExtractedQuestionTable questions={result.report.form.questions} />
              </div>
              <JsonBlock title="NormalizedForm JSON" data={result.normalizedForm} />
              <JsonBlock title="ScanReport JSON" data={result.report} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
