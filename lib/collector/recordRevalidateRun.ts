/**
 * Persist revalidate runs into collection_runs (trigger=cron) without a new table.
 * error_summary starts with [revalidate] so admin UI can distinguish from search collects.
 *
 * Call beginRevalidateCollectionRun() before work and finishRevalidateCollectionRun()
 * after so the shared running lock covers the whole revalidate window.
 */

import {
  finishCollectionRun,
  tryStartCollectionRun,
} from "@/lib/collector/repository";
import type { RevalidateResult } from "@/lib/collector/revalidatePending";
import type { CollectionRunRow } from "@/lib/collector/types";

export type RevalidateRunRecord = {
  mode: "discovered" | "unreachable" | "both";
  discovered?: RevalidateResult;
  unreachable?: RevalidateResult;
  combined?: RevalidateResult;
};

function countTransitions(
  result: RevalidateResult | undefined,
  to: string,
): number {
  if (!result) return 0;
  return result.transitions.filter((t) => t.to === to).length;
}

function summarizeBlock(
  label: string,
  result: RevalidateResult | undefined,
): string {
  if (!result) return `${label}: (skipped)`;
  const toActive = countTransitions(result, "active");
  const toClosed = countTransitions(result, "closed");
  const toRestricted = countTransitions(result, "restricted");
  const toInvalid = countTransitions(result, "invalid");
  const toUnreachable = countTransitions(result, "unreachable");
  const stayedUnreachable = result.transitions.filter(
    (t) => t.from === "unreachable" && t.to === "unreachable",
  ).length;
  const unreachableRemain =
    result.byToStatus.unreachable ?? stayedUnreachable + toUnreachable;
  return [
    `${label}:`,
    `targeted=${result.targeted}`,
    `processed=${result.processed}`,
    `success=${result.processed - result.errors.length}`,
    `pageRequests=${result.pageRequests}`,
    `active=${toActive}`,
    `closed=${toClosed}`,
    `restricted=${toRestricted}`,
    `invalid=${toInvalid}`,
    `unreachable_kept=${unreachableRemain}`,
    `errors=${result.errors.length}`,
  ].join(" ");
}

export function buildRevalidateErrorSummary(input: RevalidateRunRecord): string {
  const lines = [
    `[revalidate] mode=${input.mode}`,
    summarizeBlock("discovered", input.discovered),
    summarizeBlock("unreachable", input.unreachable),
  ];
  if (input.combined) {
    lines.push(summarizeBlock("combined", input.combined));
  }
  return lines.join("\n").slice(0, 4000);
}

export async function beginRevalidateCollectionRun(): Promise<
  | { ok: true; run: CollectionRunRow }
  | { ok: false; error: string; status: number }
> {
  const lock = await tryStartCollectionRun("cron");
  if (!lock.ok) {
    return { ok: false, error: lock.reason, status: lock.status };
  }
  return { ok: true, run: lock.run };
}

export async function finishRevalidateCollectionRun(
  runId: string,
  input: RevalidateRunRecord,
): Promise<CollectionRunRow | null> {
  const parts = [input.discovered, input.unreachable, input.combined].filter(
    Boolean,
  ) as RevalidateResult[];
  const targeted = parts.reduce((a, r) => a + r.targeted, 0);
  const pageRequests = parts.reduce((a, r) => a + r.pageRequests, 0);
  const toActive = parts.reduce(
    (a, r) => a + countTransitions(r, "active"),
    0,
  );
  const toClosed = parts.reduce(
    (a, r) => a + countTransitions(r, "closed"),
    0,
  );
  const toRestricted = parts.reduce(
    (a, r) => a + countTransitions(r, "restricted"),
    0,
  );
  const errorCount = parts.reduce((a, r) => a + r.errors.length, 0);
  const changed = parts.reduce((a, r) => a + r.transitions.length, 0);

  const status =
    errorCount === 0
      ? "completed"
      : changed > 0
        ? "partial"
        : "failed";

  return finishCollectionRun({
    runId,
    status,
    queriesCount: 0,
    resultsCount: pageRequests,
    candidateLinksCount: targeted,
    // Reuse counters: "new" ≈ recovered active; "duplicate" ≈ closed+restricted
    newSurveysCount: toActive,
    duplicateSurveysCount: toClosed + toRestricted,
    errorCount,
    errorSummary: buildRevalidateErrorSummary(input),
  });
}

/** Convenience: lock → caller already has results → finish (tests). */
export async function recordRevalidateCollectionRun(
  input: RevalidateRunRecord,
): Promise<{
  ok: boolean;
  run?: CollectionRunRow;
  error?: string;
  status?: number;
}> {
  const begun = await beginRevalidateCollectionRun();
  if (!begun.ok) {
    return { ok: false, error: begun.error, status: begun.status };
  }
  const finished = await finishRevalidateCollectionRun(begun.run.id, input);
  return { ok: true, run: finished || begun.run };
}
