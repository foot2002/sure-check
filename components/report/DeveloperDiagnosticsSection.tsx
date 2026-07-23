"use client";

import { useState } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { DebugPanel } from "@/components/DebugPanel";
import type { ScanReport } from "@/lib/types/scan";

interface DeveloperDiagnosticsSectionProps {
  report: ScanReport;
}

function readDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

/**
 * 개발 환경에서만 ReportView가 마운트합니다.
 * 공개 프로덕션 화면에는 렌더되지 않으며, 개발 환경에서도 ?debug=1일 때만 표시합니다.
 */
export function DeveloperDiagnosticsSection({
  report,
}: DeveloperDiagnosticsSectionProps) {
  const [visible] = useState(readDebugFlag);
  const [open, setOpen] = useState(readDebugFlag);

  if (!visible) return null;

  return (
    <section className="overflow-hidden rounded-[var(--report-radius)] border border-dashed border-slate-300 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left md:px-5"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
            <Code2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-bold text-slate-700 md:text-xl">
              내부 개발 진단
            </p>
            <p className="mt-1 text-[15px] text-slate-500">
              개발 환경 + ?debug=1 전용. 공개 리포트에는 포함되지 않습니다.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-slate-200 px-5 py-5 md:px-7">
          <DebugPanel report={report} embedded />
        </div>
      )}
    </section>
  );
}
