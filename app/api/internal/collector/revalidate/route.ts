import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import {
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_REVALIDATE_CONCURRENCY,
  COLLECTOR_REVALIDATE_DELAY_MS,
  COLLECTOR_REVALIDATE_MAX_RETRIES,
  COLLECTOR_UNREACHABLE_BATCH_SIZE,
} from "@/lib/collector/opsPolicy";
import {
  beginRevalidateCollectionRun,
  finishRevalidateCollectionRun,
} from "@/lib/collector/recordRevalidateRun";
import { revalidatePendingSurveyLinks } from "@/lib/collector/revalidatePending";
import { finishCollectionRun } from "@/lib/collector/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RevalidateMode = "discovered" | "unreachable" | "both";

async function handleRevalidate(request: Request) {
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

  // Noon Cron defaults to both; POST body may override for manual tests.
  let mode: RevalidateMode = "both";
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        mode?: string;
      };
      if (
        body.mode === "discovered" ||
        body.mode === "unreachable" ||
        body.mode === "both"
      ) {
        mode = body.mode;
      }
    } catch {
      /* empty ok */
    }
  }

  const lock = await beginRevalidateCollectionRun();
  if (!lock.ok) {
    return NextResponse.json(
      { ok: false, error: lock.error },
      { status: lock.status },
    );
  }

  const common = {
    concurrency: COLLECTOR_REVALIDATE_CONCURRENCY,
    delayMs: COLLECTOR_REVALIDATE_DELAY_MS,
    maxRetries: COLLECTOR_REVALIDATE_MAX_RETRIES,
    oldestFirst: true as const,
  };

  try {
    if (mode === "discovered") {
      const discovered = await revalidatePendingSurveyLinks({
        ...common,
        statuses: ["discovered"],
        limit: COLLECTOR_DISCOVERED_BATCH_SIZE,
      });
      const run = await finishRevalidateCollectionRun(lock.run.id, {
        mode,
        discovered,
      });
      return NextResponse.json({
        ok: true,
        mode,
        discovered,
        run: run || lock.run,
      });
    }

    if (mode === "unreachable") {
      const unreachable = await revalidatePendingSurveyLinks({
        ...common,
        statuses: ["unreachable"],
        limit: COLLECTOR_UNREACHABLE_BATCH_SIZE,
      });
      const run = await finishRevalidateCollectionRun(lock.run.id, {
        mode,
        unreachable,
      });
      return NextResponse.json({
        ok: true,
        mode,
        unreachable,
        run: run || lock.run,
      });
    }

    const discovered = await revalidatePendingSurveyLinks({
      ...common,
      statuses: ["discovered"],
      limit: COLLECTOR_DISCOVERED_BATCH_SIZE,
    });
    const unreachable = await revalidatePendingSurveyLinks({
      ...common,
      statuses: ["unreachable"],
      limit: COLLECTOR_UNREACHABLE_BATCH_SIZE,
    });
    const run = await finishRevalidateCollectionRun(lock.run.id, {
      mode: "both",
      discovered,
      unreachable,
    });
    return NextResponse.json({
      ok: true,
      mode,
      discovered,
      unreachable,
      run: run || lock.run,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishCollectionRun({
      runId: lock.run.id,
      status: "failed",
      queriesCount: 0,
      resultsCount: 0,
      candidateLinksCount: 0,
      newSurveysCount: 0,
      duplicateSurveysCount: 0,
      errorCount: 1,
      errorSummary: `[revalidate] mode=${mode}\nfailed: ${message}`.slice(
        0,
        4000,
      ),
    }).catch(() => null);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel Cron (noon KST) invokes GET with mode=both. */
export async function GET(request: Request) {
  return handleRevalidate(request);
}

export async function POST(request: Request) {
  return handleRevalidate(request);
}
