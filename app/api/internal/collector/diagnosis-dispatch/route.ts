import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import { getAutoDiagnosisBatchSize } from "@/lib/collector/collectConfirmedPolicy";
import { dispatchCollectorDiagnoses } from "@/lib/collector/diagnosisBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Enqueue-only (no page precheck). Keep 300s: candidate scan lookups can exceed 60s. */
export const maxDuration = 300;

function parseParams(request: Request): {
  limit: number;
  dryRun: boolean;
  sourceType: "official_site" | "all";
} {
  const url = new URL(request.url);
  const limit = Number(
    url.searchParams.get("limit") || getAutoDiagnosisBatchSize(),
  );
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    url.searchParams.get("dryRun") === "true";
  const sourceTypeRaw = (url.searchParams.get("sourceType") || "").trim();

  return {
    limit: Number.isFinite(limit) ? limit : getAutoDiagnosisBatchSize(),
    dryRun,
    // Never-crawled sprint: cron defaults to official_site. Pass sourceType=all to include search.
    sourceType: sourceTypeRaw === "all" ? "all" : "official_site",
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

  let { limit, dryRun, sourceType } = parseParams(request);
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        limit?: number;
        dryRun?: boolean;
        sourceType?: string;
      };
      if (typeof body.limit === "number") limit = body.limit;
      if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
      if (body.sourceType === "all") sourceType = "all";
      if (body.sourceType === "official_site") sourceType = "official_site";
    } catch {
      /* empty */
    }
  }

  const result = await dispatchCollectorDiagnoses({
    limit,
    dryRun,
    processInline: false,
    sourceType,
  });
  return NextResponse.json({
    ok: true,
    sourceType,
    ...result,
    reason: result.reason ?? null,
  });
}

/** Vercel Cron (Bearer CRON_SECRET) and manual ops. Enqueue only. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
