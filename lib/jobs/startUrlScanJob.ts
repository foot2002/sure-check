/**
 * Shared URL → scan_jobs enqueue path used by user UI and collector auto-dispatch.
 * Does not run extractors/rules — only queues and schedules processScanJob.
 */

import { after } from "next/server";
import { cloneReportForScan } from "@/lib/cache/inMemoryUrlCache";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { processScanJob } from "@/lib/jobs/processScanJob";
import {
  QueueSchemaNotReadyError,
  assertQueueSchemaReady,
} from "@/lib/jobs/queueSchema";
import {
  enqueuePendingScanJob,
  findAnyCompletedScanByCacheKey,
  findCachedCompletedScan,
  findRunningScanByCacheKey,
  toApiScanStatus,
} from "@/lib/jobs/scanJobQueue";
import { mockStore } from "@/lib/mock/mockStore";
import {
  createPendingScanId,
  getScanRepository,
} from "@/lib/repositories/MockScanRepository";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import { hashNormalizedUrl } from "@/lib/utils/hash";
import { normalizeUrl } from "@/lib/utils/normalizeUrl";

export type ScanStartTrigger = "user" | "collector_auto";

export type StartUrlScanResult =
  | {
      ok: true;
      scanId: string;
      status: string;
      pollUrl: string;
      cached: boolean;
      reusedRunningJob: boolean;
      reused: boolean;
      cacheKey: string;
      formUrlHash: string;
      normalizedUrl: string;
      alreadyCompleted: boolean;
      reportId: string | null;
    }
  | { ok: false; error: string; status: number };

export async function startUrlScanJob(input: {
  formUrl: string;
  trigger?: ScanStartTrigger;
  /**
   * collector_auto: treat any prior completed scan as duplicate (no TTL).
   * user: use TTL cache for completed reuse.
   */
  completedPolicy?: "ttl_cache" | "any_completed";
  /** When true, await processScanJob (scripts). Route handlers use after(). */
  processInline?: boolean;
  onProcessSettled?: () => void;
}): Promise<StartUrlScanResult> {
  const formUrl = input.formUrl.trim();
  if (!formUrl) {
    return { ok: false, error: "설문 URL을 입력해 주세요.", status: 400 };
  }
  try {
    new URL(formUrl);
  } catch {
    return { ok: false, error: "올바른 URL 형식이 아닙니다.", status: 400 };
  }

  const trigger = input.trigger || "user";
  const completedPolicy =
    input.completedPolicy ||
    (trigger === "collector_auto" ? "any_completed" : "ttl_cache");

  let normalized: string;
  try {
    normalized = normalizeUrl(formUrl);
  } catch {
    normalized = formUrl;
  }
  const formUrlHash = hashNormalizedUrl(normalized);
  const cacheKey = formUrlHash;
  let urlHost: string | null = null;
  try {
    urlHost = new URL(normalized).host;
  } catch {
    urlHost = null;
  }

  if (isMonitoringConfigured()) {
    try {
      await assertQueueSchemaReady();
    } catch (err) {
      const message =
        err instanceof QueueSchemaNotReadyError
          ? err.message
          : "진단 대기열 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.";
      return { ok: false, error: message, status: 503 };
    }

    try {
      const running = await findRunningScanByCacheKey(cacheKey);
      if (running?.external_scan_id) {
        const scanId = running.external_scan_id;
        await scheduleProcess(scanId, input.processInline, input.onProcessSettled);
        return {
          ok: true,
          scanId,
          status: toApiScanStatus(running.status),
          pollUrl: `/api/scan/status/${scanId}`,
          cached: false,
          reusedRunningJob: true,
          reused: true,
          cacheKey,
          formUrlHash,
          normalizedUrl: normalized,
          alreadyCompleted: false,
          reportId: null,
        };
      }

      if (completedPolicy === "any_completed") {
        const prior = await findAnyCompletedScanByCacheKey(cacheKey);
        if (prior?.job.external_scan_id) {
          return {
            ok: true,
            scanId: prior.job.external_scan_id,
            status: "completed",
            pollUrl: `/api/scan/status/${prior.job.external_scan_id}`,
            cached: true,
            reusedRunningJob: false,
            reused: true,
            cacheKey,
            formUrlHash,
            normalizedUrl: normalized,
            alreadyCompleted: true,
            reportId: prior.reportId,
          };
        }
      } else {
        const cached = await findCachedCompletedScan(cacheKey);
        if (cached?.job.external_scan_id) {
          const scanId = cached.job.external_scan_id;
          const report = cloneReportForScan(cached.report, scanId, formUrl);
          mockStore.saveJob({
            scanId,
            status: "completed",
            formUrl,
            platform: report.platform,
            mockKey: report.mockKey,
            currentStep: SCAN_PROGRESS_STEPS.length,
            totalSteps: SCAN_PROGRESS_STEPS.length,
            stepLabel: SCAN_PROGRESS_STEPS[SCAN_PROGRESS_STEPS.length - 1],
            createdAt: cached.job.created_at,
            updatedAt: cached.job.updated_at,
          });
          mockStore.saveReport(report);
          return {
            ok: true,
            scanId,
            status: "completed",
            pollUrl: `/api/scan/status/${scanId}`,
            cached: true,
            reusedRunningJob: false,
            reused: false,
            cacheKey,
            formUrlHash,
            normalizedUrl: normalized,
            alreadyCompleted: true,
            reportId: null,
          };
        }
      }
    } catch (err) {
      console.warn(`[scan/startUrl] cache/dedupe lookup failed (${trigger}):`, err);
    }
  }

  const repository = getScanRepository();
  const pending = await repository.createScanJob({ formUrl });
  const scanId = pending.scanId || createPendingScanId();

  if (isMonitoringConfigured()) {
    try {
      await enqueuePendingScanJob({
        externalScanId: scanId,
        formUrl: normalized,
        formUrlHash,
        cacheKey,
        urlHost,
        totalSteps: SCAN_PROGRESS_STEPS.length,
      });
    } catch (err) {
      console.error(`[scan/startUrl] enqueue failed (${trigger}):`, err);
      return {
        ok: false,
        error: "진단 대기열에 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        status: 503,
      };
    }
  }

  await scheduleProcess(scanId, input.processInline, input.onProcessSettled);

  return {
    ok: true,
    scanId,
    status: "queued",
    pollUrl: `/api/scan/status/${scanId}`,
    cached: false,
    reusedRunningJob: false,
    reused: false,
    cacheKey,
    formUrlHash,
    normalizedUrl: normalized,
    alreadyCompleted: false,
    reportId: null,
  };
}

async function scheduleProcess(
  scanId: string,
  processInline: boolean | undefined,
  onSettled?: () => void,
): Promise<void> {
  const run = () =>
    processScanJob(scanId)
      .catch((err) => {
        console.error("[scan/startUrl] processScanJob failed:", err);
      })
      .finally(() => {
        onSettled?.();
      });

  if (processInline) {
    await run();
    return;
  }
  after(() => {
    void run();
  });
}
