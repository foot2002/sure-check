import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import { runCollection } from "@/lib/collector/runCollection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleCollect(request: Request) {
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

  let maxQueries: number | undefined;
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        maxQueries?: number;
      };
      if (
        typeof body.maxQueries === "number" &&
        Number.isFinite(body.maxQueries) &&
        body.maxQueries > 0
      ) {
        maxQueries = Math.floor(body.maxQueries);
      }
    } catch {
      /* empty body ok */
    }
  }

  const result = await runCollection({ trigger: "cron", maxQueries });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    run: result.run,
    stats: result.stats,
  });
}

/** Vercel Cron invokes GET. */
export async function GET(request: Request) {
  return handleCollect(request);
}

/** Manual / script invocations may use POST. */
export async function POST(request: Request) {
  return handleCollect(request);
}
