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
  let trigger: "admin" | "test" | "manual" = "admin";
  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      trigger?: "admin" | "test" | "manual";
    };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(
        1,
        Math.min(OFFICIAL_SITE_MAX_ORGS_PER_RUN, Math.floor(body.limit)),
      );
    }
    if (body.trigger === "test" || body.trigger === "manual" || body.trigger === "admin") {
      trigger = body.trigger;
    } else if (limit === 1) {
      trigger = "test";
    }
  } catch {
    /* empty */
  }

  const result = await runOfficialSiteCollection({ limit, trigger });
  return NextResponse.json({
    ...result,
    kind: "official_site",
    ok: result.ok || Boolean(result.crawled) || result.skippedParallel === true,
  });
}
