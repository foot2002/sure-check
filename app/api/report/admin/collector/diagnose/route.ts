import { after, NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { dispatchCollectorDiagnoses } from "@/lib/collector/diagnosisBridge";
import { processNextScanJob } from "@/lib/jobs/processScanJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ADMIN_DISPATCH_MAX = 20;

export async function POST(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  let limit = ADMIN_DISPATCH_MAX;
  let surveyLinkIds: string[] = [];
  let manual = false;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      surveyLinkId?: string;
      surveyLinkIds?: string[];
      manual?: boolean;
    };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(ADMIN_DISPATCH_MAX, Math.floor(body.limit)));
    }
    if (typeof body.surveyLinkId === "string" && body.surveyLinkId.trim()) {
      surveyLinkIds.push(body.surveyLinkId.trim());
    }
    if (Array.isArray(body.surveyLinkIds)) {
      for (const id of body.surveyLinkIds) {
        if (typeof id === "string" && id.trim()) surveyLinkIds.push(id.trim());
      }
    }
    surveyLinkIds = [...new Set(surveyLinkIds)].slice(0, ADMIN_DISPATCH_MAX);
    manual = Boolean(body.manual && surveyLinkIds.length);
    if (surveyLinkIds.length > 0) {
      limit = Math.min(limit, surveyLinkIds.length);
    }
  } catch {
    /* empty */
  }

  const result = await dispatchCollectorDiagnoses({
    limit,
    dryRun: false,
    processInline: false,
    surveyLinkIds: surveyLinkIds.length ? surveyLinkIds : undefined,
    manual,
  });

  const queued = result.counts?.queued ?? 0;
  if (queued > 0) {
    after(() => {
      void processNextScanJob("admin_diagnose").catch((err) => {
        console.warn(
          "[admin-diagnose] worker kick failed:",
          err instanceof Error ? err.message : err,
        );
      });
    });
  }

  return NextResponse.json({
    ok: true,
    ...result,
    reason: result.reason ?? null,
  });
}
