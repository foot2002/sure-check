import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import { OFFICIAL_SITE_MAX_ORGS_PER_RUN } from "@/lib/collector/officialSiteCrawlPolicy";
import { runOfficialSiteCollection } from "@/lib/collector/runOfficialSiteCollection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const url = new URL(request.url);
  let limit = Number(url.searchParams.get("limit") || OFFICIAL_SITE_MAX_ORGS_PER_RUN);
  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = body.limit;
    }
  }

  const result = await runOfficialSiteCollection({
    limit: Math.max(1, Math.min(OFFICIAL_SITE_MAX_ORGS_PER_RUN, Math.floor(limit))),
    trigger: "cron",
  });
  return NextResponse.json({
    ...result,
    kind: "official_site",
    ok: result.ok || Boolean(result.crawled) || result.skippedParallel === true,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
