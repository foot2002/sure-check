import { after, NextResponse } from "next/server";
import { cloneReportForScan } from "@/lib/cache/inMemoryUrlCache";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { processScanJob } from "@/lib/jobs/processScanJob";
import {
  QueueSchemaNotReadyError,
  assertQueueSchemaReady,
} from "@/lib/jobs/queueSchema";
import {
  enqueuePendingScanJob,
  findCachedCompletedScan,
  findRunningScanByCacheKey,
  toApiScanStatus,
} from "@/lib/jobs/scanJobQueue";
import {
  checkScanRateLimit,
  getClientIp,
  recordScanStart,
  recordScanTerminal,
} from "@/lib/jobs/scanRateLimit";
import { mockStore } from "@/lib/mock/mockStore";
import {
  createPendingScanId,
  getScanRepository,
} from "@/lib/repositories/MockScanRepository";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import { hashNormalizedUrl } from "@/lib/utils/hash";
import { normalizeUrl } from "@/lib/utils/normalizeUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Background processing continues via after() up to this limit. */
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rate = checkScanRateLimit(clientIp);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: rate.reason },
        { status: 429 },
      );
    }

    const body = await request.json();
    const formUrl = typeof body.formUrl === "string" ? body.formUrl.trim() : "";

    if (!formUrl) {
      return NextResponse.json(
        { ok: false, error: "설문 URL을 입력해 주세요." },
        { status: 400 },
      );
    }

    try {
      new URL(formUrl);
    } catch {
      return NextResponse.json(
        { ok: false, error: "올바른 URL 형식이 아닙니다." },
        { status: 400 },
      );
    }

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
        return NextResponse.json({ ok: false, error: message }, { status: 503 });
      }

      try {
        const running = await findRunningScanByCacheKey(cacheKey);
        if (running?.external_scan_id) {
          const scanId = running.external_scan_id;
          // Resume processing — after() may have been dropped on a prior request.
          after(() => {
            void processScanJob(scanId).catch((err) => {
              console.error("[scan/start] resume processScanJob failed:", err);
            });
          });
          return NextResponse.json({
            ok: true,
            scanId,
            status: toApiScanStatus(running.status),
            pollUrl: `/api/scan/status/${scanId}`,
            cached: false,
            reusedRunningJob: true,
            reused: true,
          });
        }

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
          return NextResponse.json({
            ok: true,
            scanId,
            status: "completed" as const,
            pollUrl: `/api/scan/status/${scanId}`,
            cached: true,
            reusedRunningJob: false,
            reused: false,
          });
        }
      } catch (err) {
        console.warn("[scan/start] cache/dedupe lookup failed:", err);
      }
    }

    const repository = getScanRepository();
    const pending = await repository.createScanJob({ formUrl });
    const scanId = pending.scanId || createPendingScanId();

    if (isMonitoringConfigured()) {
      try {
        await enqueuePendingScanJob({
          externalScanId: scanId,
          formUrl,
          formUrlHash,
          cacheKey,
          urlHost,
          totalSteps: SCAN_PROGRESS_STEPS.length,
        });
      } catch (err) {
        console.error("[scan/start] enqueue failed:", err);
        return NextResponse.json(
          {
            ok: false,
            error:
              "진단 대기열에 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 503 },
        );
      }
    }

    recordScanStart(clientIp);

    after(() => {
      void processScanJob(scanId)
        .catch((err) => {
          console.error("[scan/start] processScanJob failed:", err);
        })
        .finally(() => {
          recordScanTerminal(clientIp);
        });
    });

    return NextResponse.json({
      ok: true,
      scanId,
      status: "queued" as const,
      pollUrl: `/api/scan/status/${scanId}`,
      cached: false,
      reusedRunningJob: false,
      reused: false,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "진단 시작 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
