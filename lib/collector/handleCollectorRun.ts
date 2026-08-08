/**
 * Shared collector run HTTP handler.
 * Thin routes (/run, /run/a, /run/b) pass partition only.
 */

import { NextResponse } from "next/server";
import {
  authorizeCollectorCronRequest,
  isCollectorCronAuthConfigured,
} from "@/lib/collector/cronAuth";
import { runCollection } from "@/lib/collector/runCollection";
import {
  parseCollectorPartition,
  type CollectorPartition,
} from "@/lib/collector/searchPartitions";
import { resolveCollectorSearchStrategy } from "@/lib/collector/searchQueries";

export async function handleCollectorRunRequest(
  request: Request,
  options?: { partition?: CollectorPartition },
): Promise<Response> {
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
  let partition: CollectorPartition =
    options?.partition ?? parseCollectorPartition(null);

  // Query/body may refine partition only when route did not fix it.
  if (!options?.partition) {
    const url = new URL(request.url);
    const partitionParam = url.searchParams.get("partition");
    if (partitionParam) {
      partition = parseCollectorPartition(partitionParam);
    }
  }

  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        maxQueries?: number;
        partition?: string;
      };
      if (
        typeof body.maxQueries === "number" &&
        Number.isFinite(body.maxQueries) &&
        body.maxQueries > 0
      ) {
        maxQueries = Math.floor(body.maxQueries);
      }
      if (!options?.partition && body.partition) {
        partition = parseCollectorPartition(body.partition);
      }
    } catch {
      /* empty body ok */
    }
  }

  // /run/a and /run/b require org_v1.2 search strategy — never silently fall back to legacy full run.
  const strategy = resolveCollectorSearchStrategy();
  if ((partition === "a" || partition === "b") && strategy !== "org_v1") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "partition a/b requires COLLECTOR_SEARCH_STRATEGY=org_v1.2 (or org_v1). Current strategy is legacy.",
        partition,
        strategy,
      },
      { status: 409 },
    );
  }

  const result = await runCollection({
    trigger: "cron",
    maxQueries,
    partition,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, partition },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    partition,
    strategy,
    run: result.run,
    stats: result.stats,
    meta: "meta" in result ? result.meta : undefined,
  });
}
