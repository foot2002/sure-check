"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { SCAN_STEPS } from "@/lib/types/scan";
import type { ScanJob } from "@/lib/types/scan";

interface ScanProgressProps {
  scanId: string;
  onComplete: (job: ScanJob) => void;
  onError: (message: string) => void;
}

export function ScanProgress({ scanId, onComplete, onError }: ScanProgressProps) {
  const [job, setJob] = useState<ScanJob | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    let cancelled = false;
    let notFoundRetries = 0;
    const timer = { id: null as ReturnType<typeof setInterval> | null };

    async function poll() {
      try {
        const res = await fetch(`/api/scan/status/${scanId}`);
        if (!res.ok) {
          if (res.status === 404 && notFoundRetries < 8) {
            notFoundRetries += 1;
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            onErrorRef.current(
              (data as { error?: string }).error ??
                "진단 상태를 확인할 수 없습니다.",
            );
          }
          if (timer.id) clearInterval(timer.id);
          return;
        }

        notFoundRetries = 0;
        const data: ScanJob = await res.json();
        if (cancelled) return;
        setJob(data);

        if (
          data.status === "completed" ||
          data.status === "limited" ||
          data.status === "failed"
        ) {
          if (timer.id) clearInterval(timer.id);
          onCompleteRef.current(data);
        }
      } catch {
        if (!cancelled) onErrorRef.current("네트워크 오류가 발생했습니다.");
        if (timer.id) clearInterval(timer.id);
      }
    }

    poll();
    timer.id = setInterval(poll, 600);

    return () => {
      cancelled = true;
      if (timer.id) clearInterval(timer.id);
    };
  }, [scanId]);

  const currentStep = job?.currentStep ?? 0;
  const status = job?.status ?? "pending";

  return (
    <div className="rounded-xl border border-border-subtle bg-background p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand">
          <Loader2 size={18} className="animate-spin" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">진단 진행 중</h3>
          <p className="text-xs text-muted">
            {status === "pending" ? "준비 중..." : job?.stepLabel}
          </p>
        </div>
      </div>

      <ul className="space-y-1">
        {SCAN_STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isDone = currentStep > stepNum || status === "completed";
          const isActive =
            currentStep === stepNum ||
            (status === "running" && currentStep === stepNum);
          const isPending = currentStep < stepNum && status !== "completed";

          return (
            <li
              key={step}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                isActive
                  ? "bg-brand-light/60"
                  : isDone
                    ? "bg-surface"
                    : "transparent"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isDone
                    ? "bg-[#2d8a5e] text-white"
                    : isActive
                      ? "bg-brand text-white"
                      : "bg-border text-muted"
                }`}
              >
                {isDone ? <Check size={12} strokeWidth={3} /> : stepNum}
              </span>
              <span
                className={`text-[13px] ${
                  isPending ? "text-muted/60" : "text-foreground"
                } ${isActive ? "font-medium" : ""}`}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
