import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { OFFICIAL_SITE_MAX_ORGS_PER_RUN } from "@/lib/collector/officialSiteCrawlPolicy";
import { runOfficialSiteCollection } from "@/lib/collector/runOfficialSiteCollection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  let limit = 1;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(
        1,
        Math.min(OFFICIAL_SITE_MAX_ORGS_PER_RUN, Math.floor(body.limit)),
      );
    }
  } catch {
    /* empty */
  }

  const result = await runOfficialSiteCollection({ limit });
  return NextResponse.json({
    ...result,
    kind: "official_site",
    ok: result.ok || Boolean(result.crawled) || result.skippedParallel === true,
  });
}
