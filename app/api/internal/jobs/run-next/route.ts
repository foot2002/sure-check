import { NextResponse } from "next/server";
import {
  getInternalWorkerToken,
  isMonitoringConfigured,
} from "@/lib/jobs/config";
import { processNextCaptureJob } from "@/lib/jobs/processCaptureJob";
import { processNextScanJob } from "@/lib/jobs/processScanJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorize(request: Request): boolean {
  const expected = getInternalWorkerToken();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token =
    bearer ||
    request.headers.get("x-internal-worker-token")?.trim() ||
    "";
  return Boolean(token) && token === expected;
}

export async function POST(request: Request) {
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
  try {
    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
    };
    if (body.kind === "scan" || body.kind === "capture" || body.kind === "both") {
      kind = body.kind;
    }
  } catch {
    /* empty body ok */
  }

  const workerId = `cron_${process.pid}_${Date.now()}`;
  const results: Array<Record<string, unknown>> = [];

  if (kind === "scan" || kind === "both") {
    const scan = await processNextScanJob(workerId);
    results.push({ type: "scan", ...scan });
  }
  if (kind === "capture" || kind === "both") {
    const capture = await processNextCaptureJob(workerId);
    results.push({ type: "capture", ...capture });
  }

  return NextResponse.json({ ok: true, results });
}
