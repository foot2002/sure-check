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
/** Wave of ≤10 diagnoses; allow browser-tail jobs within Fluid Compute ceiling. */
export const maxDuration = 300;

function parseParams(request: Request): {
  limit: number;
  dryRun: boolean;
  processInline: boolean;
} {
  const url = new URL(request.url);
  const limit = Number(
    url.searchParams.get("limit") || COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
  );
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("dryRun") === "true";
  // Cron / default: process inline so each wave reaches a terminal linkage state.
  // Opt out with inline=0|false.
  const inlineParam = url.searchParams.get("inline");
  const processInline =
    inlineParam === "0" || inlineParam === "false" ? false : true;

  return {
    limit: Number.isFinite(limit) ? limit : COLLECTOR_DIAGNOSIS_DISPATCH_MAX,
    dryRun,
    processInline,
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

  let { limit, dryRun, processInline } = parseParams(request);
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        limit?: number;
        dryRun?: boolean;
        processInline?: boolean;
        inline?: boolean;
      };
      if (typeof body.limit === "number") limit = body.limit;
      if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
      if (typeof body.processInline === "boolean") {
        processInline = body.processInline;
      } else if (typeof body.inline === "boolean") {
        processInline = body.inline;
      }
    } catch {
      /* empty */
    }
  }

  const result = await dispatchCollectorDiagnoses({
    limit,
    dryRun,
    processInline: dryRun ? false : processInline,
  });
  return NextResponse.json({
    ok: true,
    ...result,
    reason: result.reason ?? null,
  });
}

/** Vercel Cron (Bearer CRON_SECRET) and manual ops. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
