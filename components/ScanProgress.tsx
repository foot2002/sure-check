"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import type { ScanJob, ScanReport } from "@/lib/types/scan";

const SCAN_CLIENT_HARD_TIMEOUT_MS = 120_000;

const HARD_TIMEOUT_MESSAGE =
  "진단 시간이 길어져 자동으로 중단했습니다. 설문이 종료되었거나 접근이 제한되었을 수 있습니다. 잠시 후 다시 시도해 주세요.";

interface StatusPayload {
  ok?: boolean;
  scanId: string;
  status: ScanJob["status"] | "queued";
  formUrl?: string;
  platform?: ScanJob["platform"];
  mockKey?: ScanJob["mockKey"];
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  progressPercent?: number;
  errorMessage?: string;
  result?: ScanReport | null;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
}

interface ScanProgressProps {
  scanId: string;
  onComplete: (job: ScanJob, report?: ScanReport | null) => void;
  onError: (message: string) => void;
}

function nextPollDelayMs(elapsedMs: number): number {
  return elapsedMs < 10_000 ? 1000 : 2500;
}

export function ScanProgress({ scanId, onComplete, onError }: ScanProgressProps) {
  const [job, setJob] = useState<StatusPayload | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    let cancelled = false;
    let notFoundRetries = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    function finishLimited(message: string, report?: ScanReport | null) {
      const completeJob: ScanJob = {
        scanId,
        status: "limited",
        formUrl: "",
        platform: "unknown",
        mockKey: "generic_unknown_warning",
        currentStep: SCAN_PROGRESS_STEPS.length,
        totalSteps: SCAN_PROGRESS_STEPS.length,
        stepLabel: SCAN_PROGRESS_STEPS[SCAN_PROGRESS_STEPS.length - 1],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        errorMessage: message,
      };
      onCompleteRef.current(completeJob, report ?? null);
    }

    async function notifyServerTimeout() {
      try {
        await fetch(`/api/scan/timeout/${scanId}`, { method: "POST" });
      } catch {
        /* best-effort */
      }
    }

    async function poll() {
      try {
        if (Date.now() - startedAt >= SCAN_CLIENT_HARD_TIMEOUT_MS) {
          if (!cancelled) {
            await notifyServerTimeout();
            finishLimited(HARD_TIMEOUT_MESSAGE);
          }
          return;
        }

        const res = await fetch(`/api/scan/status/${scanId}`);
        if (!res.ok) {
          if (res.status === 404 && notFoundRetries < 12) {
            notFoundRetries += 1;
            scheduleNext();
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            onErrorRef.current(
              (data as { error?: string }).error ??
                "진단 상태를 확인할 수 없습니다.",
            );
          }
          return;
        }

        notFoundRetries = 0;
        const data = (await res.json()) as StatusPayload;
        if (cancelled) return;

        const normalizedStatus =
          data.status === "queued" ? "pending" : data.status;
        setJob({ ...data, status: normalizedStatus });

        if (
          normalizedStatus === "completed" ||
          normalizedStatus === "limited" ||
          normalizedStatus === "failed"
        ) {
          const completeJob: ScanJob = {
            scanId: data.scanId,
            status: normalizedStatus,
            formUrl: data.formUrl || "",
            platform: data.platform || "unknown",
            mockKey: data.mockKey || "generic_unknown_warning",
            currentStep: data.currentStep,
            totalSteps: data.totalSteps,
            stepLabel: data.stepLabel,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
            errorMessage: data.errorMessage,
          };
          onCompleteRef.current(completeJob, data.result ?? null);
          return;
        }

        scheduleNext();
      } catch {
        if (!cancelled) onErrorRef.current("네트워크 오류가 발생했습니다.");
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= SCAN_CLIENT_HARD_TIMEOUT_MS) {
        void (async () => {
          await notifyServerTimeout();
          if (!cancelled) finishLimited(HARD_TIMEOUT_MESSAGE);
        })();
        return;
      }
      timerId = setTimeout(() => {
        void poll();
      }, nextPollDelayMs(elapsed));
    }

    void poll();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [scanId]);

  const currentStep = job?.currentStep ?? 0;
  const status = job?.status ?? "pending";
  const steps = SCAN_PROGRESS_STEPS;

  return (
    <div className="rounded-xl border border-border-subtle bg-background p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand">
          <Loader2 size={18} className="animate-spin" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">진단 진행 중</h3>
          <p className="text-xs text-muted">
            {status === "pending"
              ? "대기 중..."
              : job?.stepLabel || "현재 문항을 분석하고 있습니다."}
          </p>
          {typeof job?.progressPercent === "number" ? (
            <p className="mt-1 text-[11px] text-muted/80">
              {job.progressPercent}%
            </p>
          ) : null}
        </div>
      </div>

      <ul className="space-y-1">
        {steps.map((step, index) => {
          const stepNum = index;
          const isDone =
            currentStep > stepNum ||
            status === "completed" ||
            (status === "limited" && index < steps.length - 1);
          const isActive = status === "running" && currentStep === stepNum;
          const isPending = !isDone && !isActive;

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
                {isDone ? <Check size={12} strokeWidth={3} /> : index + 1}
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
