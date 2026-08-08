import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { runCollection } from "@/lib/collector/runCollection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await getAdminSessionFromCookies())) {
    return unauthorizedJson();
  }

  let maxQueries: number | undefined;
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

  const result = await runCollection({ trigger: "admin", maxQueries });
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
