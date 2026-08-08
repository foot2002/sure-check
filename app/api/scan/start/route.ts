import { NextResponse } from "next/server";
import { startUrlScanJob } from "@/lib/jobs/startUrlScanJob";
import {
  checkScanRateLimit,
  getClientIp,
  recordScanStart,
  recordScanTerminal,
} from "@/lib/jobs/scanRateLimit";

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

    const result = await startUrlScanJob({
      formUrl,
      trigger: "user",
      completedPolicy: "ttl_cache",
      onProcessSettled: () => recordScanTerminal(clientIp),
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    if (!result.cached && !result.reusedRunningJob) {
      recordScanStart(clientIp);
    }

    return NextResponse.json({
      ok: true,
      scanId: result.scanId,
      status: result.status,
      pollUrl: result.pollUrl,
      cached: result.cached,
      reusedRunningJob: result.reusedRunningJob,
      reused: result.reused,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "진단 시작 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
