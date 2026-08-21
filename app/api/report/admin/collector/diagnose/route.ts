import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { dispatchCollectorDiagnoses } from "@/lib/collector/diagnosisBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ADMIN_DISPATCH_MAX = 20;

export async function POST(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  let limit = ADMIN_DISPATCH_MAX;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(ADMIN_DISPATCH_MAX, Math.floor(body.limit)));
    }
  } catch {
    /* empty */
  }

  const result = await dispatchCollectorDiagnoses({
    limit,
    dryRun: false,
    processInline: false,
  });
  return NextResponse.json({
    ok: true,
    ...result,
    reason: result.reason ?? null,
  });
}
