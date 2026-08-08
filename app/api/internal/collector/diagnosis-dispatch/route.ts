import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import {
  COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
  dispatchCollectorDiagnoses,
} from "@/lib/collector/diagnosisBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseParams(request: Request): {
  limit: number;
  dryRun: boolean;
} {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || COLLECTOR_DIAGNOSIS_DISPATCH_MAX);
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("dryRun") === "true";

  return {
    limit: Number.isFinite(limit) ? limit : COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
    dryRun,
  };
}

async function handle(request: Request): Promise<Response> {
  if (!isCollectorCronAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "수집 Cron이 비활성화되어 있습니다. COLLECTOR_CRON_SECRET 또는 CRON_SECRET을 설정하세요.",
      },
      { status: 503 },
    );
  }
  if (!authorizeCollectorCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let { limit, dryRun } = parseParams(request);
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        limit?: number;
        dryRun?: boolean;
      };
      if (typeof body.limit === "number") limit = body.limit;
      if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
    } catch {
      /* empty */
    }
  }

  const result = await dispatchCollectorDiagnoses({ limit, dryRun });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
