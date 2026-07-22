"use client";

import { useState } from "react";
import { ChevronDown, Code2 } from "lucide-react";
import { DebugPanel } from "@/components/DebugPanel";
import type { ScanReport } from "@/lib/types/scan";

interface DeveloperDiagnosticsSectionProps {
  report: ScanReport;
}

function readDebugOpen(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function DeveloperDiagnosticsSection({
  report,
}: DeveloperDiagnosticsSectionProps) {
  const [open, setOpen] = useState(readDebugOpen);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[var(--report-shadow-soft)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-5 text-left md:px-7"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Code2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-bold text-foreground md:text-xl">
              개발자 진단 정보
            </p>
            <p className="mt-1 text-base text-muted">
              Analyzer Trace, NormalizedForm, ScanReport JSON, raw question id
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5 md:px-7">
          <DebugPanel report={report} embedded />
        </div>
      )}
    </section>
  );
}
