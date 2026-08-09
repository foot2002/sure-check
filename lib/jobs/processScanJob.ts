import { cloneReportForScan, getUrlCache } from "@/lib/cache/inMemoryUrlCache";
import { getJobWorkerConfig, isMonitoringConfigured } from "@/lib/jobs/config";
import {
  enqueuePendingCaptureJob,
} from "@/lib/jobs/captureJobQueue";
import {
  claimNextScanJob,
  claimScanJobByExternalId,
  getScanJobByExternalId,
  recoverStaleScanJobs,
  updateScanJobProgress,
  type QueuedScanJobRow,
} from "@/lib/jobs/scanJobQueue";
import { recordScanJobStep, runTimedStep } from "@/lib/jobs/scanJobSteps";
import { withTimeout } from "@/lib/jobs/withTimeout";
import { mockStore } from "@/lib/mock/mockStore";
import { toDbPlatform } from "@/lib/monitoring/reportToMonitoringRows";
import { finalizeMonitoringSnapshotForJob } from "@/lib/repositories/SupabaseMonitoringRepository";
import { resolveScanReport } from "@/lib/scan/resolveScanReport";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import type { ScanReport, ScanStatus } from "@/lib/types/scan";
import { hashNormalizedUrl } from "@/lib/utils/hash";
import { normalizeUrl } from "@/lib/utils/normalizeUrl";

function createPreviewCaptureId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Best-effort preview capture after diagnosis.
 * Must never throw into the scan job path.
 */
async function enqueuePostDiagnosisPreviewCapture(input: {
  diagnosisId: string;
  surveyUrl: string;
  finalUrl: string;
}): Promise<void> {
  if (!isMonitoringConfigured()) return;
  if (!input.diagnosisId || !input.surveyUrl) return;
  const captureJobId = createPreviewCaptureId();
  // Enqueue only — capture worker/cron processes separately so scan timeout
  // is not inflated by screenshot work.
  await enqueuePendingCaptureJob({
    externalCaptureId: captureJobId,
    diagnosisId: input.diagnosisId,
    surveyUrl: input.surveyUrl,
    finalUrl: input.finalUrl || input.surveyUrl,
    mode: "safe_public_only",
  });
}

async function setProgress(
  externalScanId: string,
  dbJob: QueuedScanJobRow | null,
  patch: {
    status: ScanStatus;
    currentStep: number;
    stepLabel: string;
    errorMessage?: string;
  },
): Promise<void> {
  mockStore.updateJob(externalScanId, {
    status: patch.status,
    currentStep: patch.currentStep,
    totalSteps: SCAN_PROGRESS_STEPS.length,
    stepLabel: patch.stepLabel,
    errorMessage: patch.errorMessage,
  });
  if (dbJob?.id) {
    await updateScanJobProgress(dbJob.id, {
      status:
        patch.status === "pending"
          ? "pending"
          : patch.status === "running"
            ? "running"
            : patch.status === "completed"
              ? "completed"
              : patch.status === "limited"
                ? "limited"
                : "failed",
      currentStep: patch.currentStep,
      totalSteps: SCAN_PROGRESS_STEPS.length,
      stepLabel: patch.stepLabel,
      errorMessage: patch.errorMessage ?? null,
    });
  }
}

async function processClaimedScanJob(
  claimed: QueuedScanJobRow,
  workerId: string,
): Promise<{ ok: boolean; scanId: string; status: ScanStatus }> {
  const externalScanId = claimed.external_scan_id;
  const formUrl = claimed.form_url;
  if (!externalScanId || !formUrl) {
    return { ok: false, scanId: externalScanId || "", status: "failed" };
  }

  const config = getJobWorkerConfig();
  const timeoutMs = config.scanTimeoutSeconds * 1000;
  const totalSteps = SCAN_PROGRESS_STEPS.length;
  const jobStartedAt = Date.now();

  await setProgress(externalScanId, claimed, {
    status: "running",
    currentStep: 1,
    stepLabel: SCAN_PROGRESS_STEPS[1],
  });

  try {
    await setProgress(externalScanId, claimed, {
      status: "running",
      currentStep: 2,
      stepLabel: SCAN_PROGRESS_STEPS[2],
    });

    const { report, jobStatus, meta } = await withTimeout(
      runTimedStep(claimed.id, "extract_questions", async () => {
        await setProgress(externalScanId, claimed, {
          status: "running",
          currentStep: 3,
          stepLabel: SCAN_PROGRESS_STEPS[3],
        });
        return runTimedStep(claimed.id, "analyze_privacy", async () => {
          await setProgress(externalScanId, claimed, {
            status: "running",
            currentStep: 4,
            stepLabel: SCAN_PROGRESS_STEPS[4],
          });
          return runTimedStep(claimed.id, "build_report", async () =>
            resolveScanReport(externalScanId, formUrl),
          );
        });
      }),
      timeoutMs,
      "scan_job",
    );

    await setProgress(externalScanId, claimed, {
      status: "running",
      currentStep: 5,
      stepLabel: SCAN_PROGRESS_STEPS[5],
    });

    mockStore.saveReport(report);

    let monitoringSaved = false;
    const saveStarted = Date.now();
    try {
      await runTimedStep(claimed.id, "save_monitoring", async () => {
        await finalizeMonitoringSnapshotForJob(claimed.id, report);
      });
      monitoringSaved = true;
    } catch (err) {
      console.error("[jobs] save_monitoring failed:", err);
      monitoringSaved = false;
    }
    const saveDurationMs = Date.now() - saveStarted;
    meta.saveDurationMs = saveDurationMs;
    meta.totalDurationMs = Date.now() - jobStartedAt;
    if (report.debug) {
      report.debug.saveDurationMs = saveDurationMs;
      report.debug.totalDurationMs = meta.totalDurationMs;
    }
    mockStore.saveReport(report);

    // Capture runs async separately — never block or fail diagnosis.
    let captureEnqueued = false;
    if (
      monitoringSaved &&
      isMonitoringConfigured() &&
      jobStatus !== "failed" &&
      !report.form?.loginRequired
    ) {
      try {
        await enqueuePostDiagnosisPreviewCapture({
          diagnosisId: externalScanId,
          surveyUrl: formUrl,
          finalUrl: report.form?.url || formUrl,
        });
        captureEnqueued = true;
      } catch (err) {
        console.warn(
          "[jobs] preview capture enqueue skipped:",
          err instanceof Error ? err.message : err,
        );
        captureEnqueued = false;
      }
    }

    await recordScanJobStep({
      scanJobId: claimed.id,
      stepName: "capture_evidence",
      status: captureEnqueued ? "completed" : "skipped",
    });
    await recordScanJobStep({
      scanJobId: claimed.id,
      stepName: "upload_storage",
      status: "skipped",
    });
    await runTimedStep(claimed.id, "finalize", async () => undefined);

    const terminalStatus: ScanStatus =
      jobStatus === "limited"
        ? "limited"
        : jobStatus === "failed"
          ? "failed"
          : "completed";

    mockStore.updateJob(externalScanId, {
      status: terminalStatus,
      currentStep: totalSteps,
      stepLabel: SCAN_PROGRESS_STEPS[totalSteps - 1],
      errorMessage:
        terminalStatus === "failed" || terminalStatus === "limited"
          ? report.summary
          : undefined,
    });

    await updateScanJobProgress(claimed.id, {
      status: terminalStatus,
      currentStep: totalSteps,
      totalSteps,
      stepLabel: SCAN_PROGRESS_STEPS[totalSteps - 1],
      errorMessage:
        terminalStatus === "failed" || terminalStatus === "limited"
          ? report.summary
          : null,
      platform: toDbPlatform(report.platform),
      monitoringSaved,
      evidenceStored: false,
      completedAt: report.completedAt || new Date().toISOString(),
      extractionMode: meta.extractionMode,
      browserUsed: meta.browserUsed,
      browserReason: meta.browserReason ?? null,
      fastExtractorConfidence: meta.fastExtractorConfidence ?? null,
      fallbackTriggered: meta.fallbackTriggered,
      fallbackReason: meta.fallbackReason ?? null,
      totalDurationMs: meta.totalDurationMs ?? null,
      extractDurationMs: meta.extractDurationMs ?? null,
      analysisDurationMs: meta.analysisDurationMs ?? null,
      saveDurationMs: meta.saveDurationMs ?? null,
    });

    try {
      const normalized = normalizeUrl(formUrl);
      const hash = hashNormalizedUrl(normalized);
      getUrlCache().set(
        hash,
        cloneReportForScan(report, `cached_${hash.slice(0, 16)}`, formUrl),
        config.scanCacheTtlSeconds * 1000,
      );
    } catch {
      /* cache best-effort */
    }

    void workerId;

    return { ok: true, scanId: externalScanId, status: terminalStatus };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "진단 중 오류가 발생했습니다.";
    const limited =
      /timed out|timeout|제한/i.test(message) ||
      message.includes("timed out");
    const status: ScanStatus = limited ? "limited" : "failed";
    const userMessage = limited
      ? "진단이 제한되었습니다. 잠시 후 다시 시도해 주세요."
      : "진단 중 오류가 발생했습니다.";

    const fallbackReport = buildFailureReport(externalScanId, formUrl, userMessage);
    mockStore.saveReport(fallbackReport);
    mockStore.updateJob(externalScanId, {
      status,
      currentStep: totalSteps,
      stepLabel: SCAN_PROGRESS_STEPS[totalSteps - 1],
      errorMessage: userMessage,
    });

    try {
      await updateScanJobProgress(claimed.id, {
        status,
        currentStep: totalSteps,
        totalSteps,
        stepLabel: SCAN_PROGRESS_STEPS[totalSteps - 1],
        errorMessage: userMessage,
        monitoringSaved: false,
        evidenceStored: false,
        completedAt: new Date().toISOString(),
      });
      await finalizeMonitoringSnapshotForJob(claimed.id, fallbackReport).catch(
        () => undefined,
      );
    } catch (updateErr) {
      console.error("[jobs] failed to persist scan failure:", updateErr);
    }

    return { ok: false, scanId: externalScanId, status };
  }
}

function buildFailureReport(
  scanId: string,
  formUrl: string,
  summary: string,
): ScanReport {
  const now = new Date().toISOString();
  return {
    scanId,
    formUrl,
    platform: "unknown",
    mockKey: "generic_unknown_warning",
    diagnosisStatus: "failed",
    grade: undefined,
    score: null,
    isLimited: true,
    limitedReason: summary,
    confidence: "none",
    summary,
    sections: {
      dataCollectionRisk: summary,
      toolProcessingRisk: "",
      noticeConsentGap: "",
      managementRisk: "",
      detectedPersonalData: [],
      missingObligations: [],
      respondentGuidance: [summary],
      operatorRecommendations: [],
      evidenceItems: [],
      legalBasisSummary: "",
      disclaimer: "자동 진단 결과이며 법률 자문이 아닙니다.",
    },
    findings: [],
    form: {
      platform: "unknown",
      title: "",
      url: formUrl,
      questions: [],
      hasPrivacyNotice: false,
      hasConsent: false,
      hasRetentionNotice: false,
      hasOverseasTransferNotice: false,
      isLimited: true,
      limitedReason: summary,
    },
    createdAt: now,
    completedAt: now,
    scanStatus: "failed",
    limitationReasons: [summary],
  };
}

/**
 * Process a specific scan by external id (after() path).
 * No-ops if another worker already claimed it or concurrency is full.
 */
export async function processScanJob(
  externalScanId: string,
  workerId = `after_${process.pid}_${Date.now()}`,
): Promise<{ ok: boolean; scanId: string; status: ScanStatus }> {
  if (!isMonitoringConfigured()) {
    return processScanJobInMemory(externalScanId);
  }

  await recoverStaleScanJobs();

  const existing = await getScanJobByExternalId(externalScanId);
  if (
    existing &&
    (existing.status === "completed" ||
      existing.status === "failed" ||
      existing.status === "limited")
  ) {
    return {
      ok: true,
      scanId: externalScanId,
      status: existing.status as ScanStatus,
    };
  }

  let claimed: QueuedScanJobRow | null = null;
  try {
    claimed = await claimScanJobByExternalId(externalScanId, workerId);
  } catch (err) {
    console.error("[jobs] processScanJob claim failed:", err);
    if (existing?.id) {
      await updateScanJobProgress(existing.id, {
        status: "limited",
        errorMessage:
          "진단 대기열 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.",
        stepLabel: SCAN_PROGRESS_STEPS[SCAN_PROGRESS_STEPS.length - 1],
        currentStep: SCAN_PROGRESS_STEPS.length,
        completedAt: new Date().toISOString(),
      });
    }
    mockStore.updateJob(externalScanId, {
      status: "limited",
      errorMessage:
        "진단 대기열 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.",
    });
    return { ok: false, scanId: externalScanId, status: "limited" };
  }
  if (!claimed) {
    return { ok: false, scanId: externalScanId, status: "pending" };
  }
  if (
    claimed.status === "completed" ||
    claimed.status === "failed" ||
    claimed.status === "limited"
  ) {
    return {
      ok: true,
      scanId: externalScanId,
      status: claimed.status as ScanStatus,
    };
  }

  return processClaimedScanJob(claimed, workerId);
}

export async function processNextScanJob(
  workerId = `worker_${process.pid}_${Date.now()}`,
): Promise<{ ok: boolean; scanId: string | null; status: ScanStatus | null }> {
  if (!isMonitoringConfigured()) {
    return { ok: false, scanId: null, status: null };
  }
  await recoverStaleScanJobs();
  const claimed = await claimNextScanJob(workerId);
  if (!claimed?.external_scan_id) {
    return { ok: true, scanId: null, status: null };
  }
  const result = await processClaimedScanJob(claimed, workerId);
  return { ok: result.ok, scanId: result.scanId, status: result.status };
}

async function processScanJobInMemory(
  externalScanId: string,
): Promise<{ ok: boolean; scanId: string; status: ScanStatus }> {
  const job = mockStore.getJob(externalScanId);
  if (!job) return { ok: false, scanId: externalScanId, status: "failed" };
  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "limited"
  ) {
    return { ok: true, scanId: externalScanId, status: job.status };
  }

  mockStore.updateJob(externalScanId, {
    status: "running",
    currentStep: 2,
    stepLabel: SCAN_PROGRESS_STEPS[2],
  });

  try {
    const config = getJobWorkerConfig();
    const { report, jobStatus } = await withTimeout(
      resolveScanReport(externalScanId, job.formUrl),
      config.scanTimeoutSeconds * 1000,
      "scan_job",
    );
    mockStore.saveReport(report);
    mockStore.updateJob(externalScanId, {
      status: jobStatus,
      currentStep: SCAN_PROGRESS_STEPS.length,
      stepLabel: SCAN_PROGRESS_STEPS[SCAN_PROGRESS_STEPS.length - 1],
      errorMessage:
        jobStatus === "failed" || jobStatus === "limited"
          ? report.summary
          : undefined,
    });
    return { ok: true, scanId: externalScanId, status: jobStatus };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "진단 중 오류가 발생했습니다.";
    mockStore.updateJob(externalScanId, {
      status: "failed",
      errorMessage: message,
      stepLabel: SCAN_PROGRESS_STEPS[SCAN_PROGRESS_STEPS.length - 1],
      currentStep: SCAN_PROGRESS_STEPS.length,
    });
    return { ok: false, scanId: externalScanId, status: "failed" };
  }
}
