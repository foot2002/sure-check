import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import {
  getInternalWorkerToken,
  isMonitoringConfigured,
} from "@/lib/jobs/config";
import { processNextCaptureJob } from "@/lib/jobs/processCaptureJob";
import { processNextScanJob } from "@/lib/jobs/processScanJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Accept INTERNAL_WORKER_TOKEN (manual/ops) or Vercel Cron CRON_SECRET
 * (same pattern as collector cron endpoints).
 */
function authorize(request: Request): boolean {
  const expected = getInternalWorkerToken();
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token =
    bearer ||
    request.headers.get("x-internal-worker-token")?.trim() ||
    "";
  if (expected && token && token === expected) return true;
  if (isCollectorCronAuthConfigured() && authorizeCollectorCronRequest(request)) {
    return true;
  }
  return false;
}

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isMonitoringConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  let kind: "scan" | "capture" | "both" = "both";
  let captureBatch = 2;
  try {
    const url = new URL(request.url);
    const kindParam = url.searchParams.get("kind");
    if (kindParam === "scan" || kindParam === "capture" || kindParam === "both") {
      kind = kindParam;
    }
    const batchParam = Number(url.searchParams.get("captureBatch") || "2");
    if (Number.isFinite(batchParam) && batchParam > 0) {
      captureBatch = Math.min(5, Math.floor(batchParam));
    }
  } catch {
    /* ignore */
  }

  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        kind?: string;
        captureBatch?: number;
      };
      if (body.kind === "scan" || body.kind === "capture" || body.kind === "both") {
        kind = body.kind;
      }
      if (typeof body.captureBatch === "number" && body.captureBatch > 0) {
        captureBatch = Math.min(5, Math.floor(body.captureBatch));
      }
    } catch {
      /* empty body ok */
    }
  }

  // Cron default: drain capture backlog; scans have their own diagnosis dispatch.
  if (request.method === "GET" && kind === "both") {
    kind = "capture";
  }

  const workerId = `cron_${process.pid}_${Date.now()}`;
  const results: Array<Record<string, unknown>> = [];

  if (kind === "scan" || kind === "both") {
    const scan = await processNextScanJob(workerId);
    results.push({ type: "scan", ...scan });
  }
  if (kind === "capture" || kind === "both") {
    for (let i = 0; i < captureBatch; i += 1) {
      const capture = await processNextCaptureJob(`${workerId}_c${i}`);
      results.push({ type: "capture", ...capture });
      if (!capture.captureJobId) break;
    }
  }

  return NextResponse.json({ ok: true, results });
}

/** Vercel Cron (Bearer CRON_SECRET) and manual ops. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
