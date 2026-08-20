/**
 * Collector → SURE-Check diagnosis bridge.
 * Selects eligible survey_links and enqueues existing scan_jobs only.
 */

import {
  bestTriageAcrossSources,
  type RecencyClass,
  type TriageResult,
} from "@/lib/collector/candidateTriage";
import {
  countDiagnosisLinksCreatedInKstDay,
  findActiveDiagnosisLinkForSurvey,
  findSurveyIdsWithBlockingDiagnosis,
  insertDiagnosisLink,
  syncDiagnosisLinkFromScanJob,
  type SurveyDiagnosisLinkRow,
} from "@/lib/collector/diagnosisLinkRepository";
import type { CollectorOrgQualityClass } from "@/lib/collector/orgQuality";
import {
  AUTO_DIAGNOSIS_BATCH_SIZE_DEFAULT,
  AUTO_DIAGNOSIS_DAILY_LIMIT_DEFAULT,
  diagnosisPriorityScore,
  getAutoDiagnosisBatchSize,
  getAutoDiagnosisDailyLimit,
  isAutoDiagnosisTarget,
  isOfficialAutoDiagnosisTriage,
} from "@/lib/collector/collectConfirmedPolicy";
import {
  countInProgressScanJobs,
  findAnyCompletedScanByCacheKey,
  findRunningScanByCacheKey,
} from "@/lib/jobs/scanJobQueue";
import { startUrlScanJob } from "@/lib/jobs/startUrlScanJob";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashNormalizedUrl } from "@/lib/utils/hash";
import { normalizeUrl } from "@/lib/utils/normalizeUrl";

import type { CollectorPlatform, SurveyLinkFreshness } from "@/lib/collector/types";

/** Default batch size (env AUTO_DIAGNOSIS_BATCH_SIZE overrides at runtime). */
export const COLLECTOR_DIAGNOSIS_DISPATCH_MAX = AUTO_DIAGNOSIS_BATCH_SIZE_DEFAULT;
export const COLLECTOR_DIAGNOSIS_BACKPRESSURE_PENDING =
  AUTO_DIAGNOSIS_BATCH_SIZE_DEFAULT;
/** Default daily cap (env AUTO_DIAGNOSIS_DAILY_LIMIT overrides at runtime). */
export const COLLECTOR_DIAGNOSIS_DAILY_MAX = AUTO_DIAGNOSIS_DAILY_LIMIT_DEFAULT;

export type EligibleCandidate = {
  surveyLinkId: string;
  canonicalUrl: string;
  platform: CollectorPlatform;
  title: string | null;
  triage: TriageResult;
  scanCacheKey: string;
  normalizedScanUrl: string;
};

export type DispatchItemOutcome = {
  surveyLinkId: string;
  canonicalUrl: string;
  platform: CollectorPlatform;
  organization: CollectorOrgQualityClass;
  queue: string;
  recency: RecencyClass;
  outcome:
    | "would_enqueue"
    | "queued"
    | "skipped_duplicate"
    | "skipped_not_eligible"
    | "skipped_backpressure"
    | "skipped_precheck_closed"
    | "skipped_precheck_restricted"
    | "failed";
  diagnosisJobId?: string | null;
  reportId?: string | null;
  skipReason?: string | null;
  error?: string | null;
};

export type DispatchResult = {
  dryRun: boolean;
  limit: number;
  inProgressScanJobs: number;
  eligibleBeforeDedupe: number;
  selected: number;
  outcomes: DispatchItemOutcome[];
  counts: {
    wouldEnqueue: number;
    queued: number;
    skippedDuplicate: number;
    skippedNotEligible: number;
    skippedBackpressure: number;
    skippedDailyLimit: number;
    skippedPrecheckClosed: number;
    skippedPrecheckRestricted: number;
    skippedStale: number;
    failed: number;
  };
  organizationDistribution: Record<string, number>;
  platformDistribution: Record<string, number>;
  recencyDistribution: Record<string, number>;
  daily: {
    kstDate: string;
    max: number;
    used: number;
    remaining: number;
    limitReached: boolean;
  };
  reason?: string | null;
  /** Alias of eligibleBeforeDedupe for ops responses. */
  candidates?: number;
  skippedAlreadyQueued?: number;
  skippedClosed?: number;
  skippedRestricted?: number;
  dailyUsed?: number;
  dailyLimit?: number;
  carryover?: number;
  enqueueOnly?: boolean;
};

function scanIdentity(canonicalUrl: string): {
  normalized: string;
  cacheKey: string;
} {
  let normalized: string;
  try {
    normalized = normalizeUrl(canonicalUrl);
  } catch {
    normalized = canonicalUrl;
  }
  return { normalized, cacheKey: hashNormalizedUrl(normalized) };
}

function recencyRank(r: RecencyClass): number {
  if (r === "recent_high") return 0;
  if (r === "recent_possible") return 1;
  if (r === "unknown") return 2;
  return 3;
}

export function isEligibleTriage(triage: TriageResult): boolean {
  return isOfficialAutoDiagnosisTriage(triage);
}

/**
 * Pure selection helpers for unit tests (no DB).
 */
export function filterAndSortEligible(
  rows: Array<{
    id: string;
    canonicalUrl: string;
    platform: CollectorPlatform;
    title: string | null;
    status: string;
    triage: TriageResult;
    freshness?: SurveyLinkFreshness | null;
  }>,
): EligibleCandidate[] {
  const out: EligibleCandidate[] = [];
  for (const row of rows) {
    if (
      !isAutoDiagnosisTarget({
        status: row.status,
        freshness: row.freshness,
        title: row.title,
        triage: row.triage,
      })
    ) {
      continue;
    }
    const { normalized, cacheKey } = scanIdentity(row.canonicalUrl);
    out.push({
      surveyLinkId: row.id,
      canonicalUrl: row.canonicalUrl,
      platform: row.platform,
      title: row.title,
      triage: row.triage,
      scanCacheKey: cacheKey,
      normalizedScanUrl: normalized,
    });
  }
  out.sort((a, b) => {
    const pr =
      diagnosisPriorityScore({ triage: b.triage, title: b.title }) -
      diagnosisPriorityScore({ triage: a.triage, title: a.title });
    if (pr !== 0) return pr;
    const rr = recencyRank(a.triage.recency) - recencyRank(b.triage.recency);
    if (rr !== 0) return rr;
    return (
      b.triage.organizationScore +
      b.triage.recencyScore -
      (a.triage.organizationScore + a.triage.recencyScore)
    );
  });
  return out;
}

/** Prefer platform diversity when taking the first N. */
export function pickWithPlatformDiversity(
  candidates: EligibleCandidate[],
  limit: number,
): EligibleCandidate[] {
  if (candidates.length <= limit) return candidates.slice(0, limit);
  const picked: EligibleCandidate[] = [];
  const used = new Set<string>();
  const platforms: CollectorPlatform[] = [
    "google_forms",
    "naver_form",
    "moaform",
  ];
  for (const platform of platforms) {
    if (picked.length >= limit) break;
    const hit = candidates.find(
      (c) => c.platform === platform && !used.has(c.surveyLinkId),
    );
    if (hit) {
      picked.push(hit);
      used.add(hit.surveyLinkId);
    }
  }
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (used.has(c.surveyLinkId)) continue;
    picked.push(c);
    used.add(c.surveyLinkId);
  }
  return picked;
}

async function loadActiveCandidatesFromDb(
  fetchLimit: number,
): Promise<EligibleCandidate[]> {
  const supabase = createSupabaseServerClient();
  // Deep enough to burn through recent already-diagnosed actives and still
  // reach the undiagnosed collect_confirmed backlog for each wave.
  const fetchSize = Math.min(Math.max(fetchLimit * 50, 400), 1500);
  type LinkRow = {
    id: unknown;
    canonical_url: unknown;
    platform: unknown;
    title: unknown;
    status: unknown;
    freshness?: unknown;
  };
  let links: LinkRow[] | null = null;
  let error: { message: string } | null = null;
  {
    const first = await supabase
      .from("survey_links")
      .select("id, canonical_url, platform, title, status, freshness")
      .eq("status", "active")
      .order("last_discovered_at", { ascending: false })
      .limit(fetchSize);
    links = (first.data as LinkRow[] | null) || null;
    error = first.error;
  }
  if (
    error &&
    /freshness/i.test(error.message) &&
    /column|schema|does not exist/i.test(error.message)
  ) {
    const fallback = await supabase
      .from("survey_links")
      .select("id, canonical_url, platform, title, status")
      .eq("status", "active")
      .order("last_discovered_at", { ascending: false })
      .limit(fetchSize);
    links = (fallback.data as LinkRow[] | null) || null;
    error = fallback.error;
  }

  if (error) throw new Error(`load active survey_links: ${error.message}`);
  const rows = links || [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  type SourceRow = {
    survey_link_id: unknown;
    source_url: unknown;
    source_title: unknown;
    search_query: unknown;
    source_published_at: unknown;
    source_type: unknown;
  };
  const sources: SourceRow[] = [];
  const sourceChunk = 150;
  for (let i = 0; i < ids.length; i += sourceChunk) {
    const slice = ids.slice(i, i + sourceChunk);
    const { data, error: sErr } = await supabase
      .from("survey_sources")
      .select(
        "survey_link_id, source_url, source_title, search_query, source_published_at, source_type",
      )
      .in("survey_link_id", slice);
    if (sErr) throw new Error(`load survey_sources: ${sErr.message}`);
    sources.push(...((data as SourceRow[] | null) || []));
  }

  const byLink = new Map<string, typeof sources>();
  for (const s of sources || []) {
    const id = String(s.survey_link_id);
    const cur = byLink.get(id) || [];
    cur.push(s);
    byLink.set(id, cur);
  }

  const mapped = rows.map((row) => {
    const srcs = byLink.get(String(row.id)) || [];
    const triage = bestTriageAcrossSources(
      srcs.map((s) => ({
        sourceUrl: String(s.source_url),
        sourceTitle: (s.source_title as string) || (row.title as string) || "",
        surveyTitle: (row.title as string) || undefined,
        searchQuery: (s.search_query as string) || undefined,
        sourcePublishedAt: (s.source_published_at as string) || undefined,
        sourceType:
          (s.source_type as "web" | "blog" | "cafe" | "unknown") || "unknown",
        firstSeenThisRun: false,
      })),
    );
    return {
      id: String(row.id),
      canonicalUrl: String(row.canonical_url),
      platform: row.platform as CollectorPlatform,
      title: (row.title as string) || null,
      status: String(row.status),
      triage,
      freshness: (row.freshness as SurveyLinkFreshness | null) || null,
    };
  });

  return filterAndSortEligible(mapped);
}

async function filterOpenForEnqueue(
  candidates: EligibleCandidate[],
): Promise<EligibleCandidate[]> {
  if (candidates.length === 0) return [];
  const blockedIds = await findSurveyIdsWithBlockingDiagnosis(
    candidates.map((c) => c.surveyLinkId),
  );
  const neverScanned: EligibleCandidate[] = [];
  const alreadyCompleted: EligibleCandidate[] = [];
  for (const c of candidates) {
    if (blockedIds.has(c.surveyLinkId)) continue;
    const running = await findRunningScanByCacheKey(c.scanCacheKey);
    if (running?.external_scan_id) continue;
    const completed = await findAnyCompletedScanByCacheKey(c.scanCacheKey);
    if (completed?.job.external_scan_id) {
      alreadyCompleted.push(c);
      continue;
    }
    neverScanned.push(c);
  }
  // Prefer URLs with no completed scan so missing diagnosis drains first.
  return neverScanned.concat(alreadyCompleted);
}

function emptyCounts() {
  return {
    wouldEnqueue: 0,
    queued: 0,
    skippedDuplicate: 0,
    skippedNotEligible: 0,
    skippedBackpressure: 0,
    skippedDailyLimit: 0,
    skippedPrecheckClosed: 0,
    skippedPrecheckRestricted: 0,
    skippedStale: 0,
    failed: 0,
  };
}

export async function dispatchCollectorDiagnoses(input?: {
  limit?: number;
  dryRun?: boolean;
  processInline?: boolean;
}): Promise<DispatchResult> {
  void input?.processInline;
  const dryRun = Boolean(input?.dryRun);
  const batchSize = getAutoDiagnosisBatchSize();
  const dailyMax = getAutoDiagnosisDailyLimit();
  const backpressureCap = batchSize;
  // Real enqueue stays at the batch cap; dry-run may inspect a slightly larger pool.
  const maxLimit = dryRun ? Math.max(20, batchSize) : batchSize;
  const requestedLimit = Math.min(
    Math.max(1, Math.floor(input?.limit ?? batchSize)),
    maxLimit,
  );
  const inProgress = await countInProgressScanJobs();
  const day = await countDiagnosisLinksCreatedInKstDay();
  const dailyRemaining = Math.max(0, dailyMax - day.total);
  const daily = {
    kstDate: day.kstDate,
    max: dailyMax,
    used: day.total,
    remaining: dailyRemaining,
    limitReached: dailyRemaining <= 0,
  };

  if (!dryRun && daily.limitReached) {
    return {
      dryRun,
      limit: requestedLimit,
      inProgressScanJobs: inProgress,
      eligibleBeforeDedupe: 0,
      selected: 0,
      outcomes: [],
      counts: emptyCounts(),
      organizationDistribution: {},
      platformDistribution: {},
      recencyDistribution: {},
      daily,
      reason: "daily_limit_reached_carryover",
      candidates: 0,
      skippedAlreadyQueued: 0,
      skippedClosed: 0,
      skippedRestricted: 0,
      dailyUsed: daily.used,
      dailyLimit: daily.max,
      carryover: 0,
      enqueueOnly: true,
    };
  }

  const limit = dryRun
    ? requestedLimit
    : Math.min(requestedLimit, dailyRemaining);

  const eligible = await loadActiveCandidatesFromDb(limit);
  const openEligible = await filterOpenForEnqueue(eligible);
  const selectedPool = pickWithPlatformDiversity(openEligible, limit);

  const orgDist: Record<string, number> = {};
  const platDist: Record<string, number> = {};
  const recDist: Record<string, number> = {};
  for (const c of eligible.slice(0, 40)) {
    orgDist[c.triage.organization] = (orgDist[c.triage.organization] || 0) + 1;
    platDist[c.platform] = (platDist[c.platform] || 0) + 1;
    recDist[c.triage.recency] = (recDist[c.triage.recency] || 0) + 1;
  }

  const outcomes: DispatchItemOutcome[] = [];
  const counts = emptyCounts();
  /** Rows actually inserted into survey_diagnosis_links this wave. */
  let linkageCreated = 0;

  let remainingSlots = Math.max(0, backpressureCap - inProgress);
  let remainingDaily = dailyRemaining;

  for (const c of selectedPool) {
    const base = {
      surveyLinkId: c.surveyLinkId,
      canonicalUrl: c.canonicalUrl,
      platform: c.platform,
      organization: c.triage.organization,
      queue: c.triage.queue,
      recency: c.triage.recency,
    };

    if (!dryRun && remainingDaily <= 0) {
      outcomes.push({
        ...base,
        outcome: "skipped_not_eligible",
        skipReason: "daily_limit_reached_carryover",
      });
      counts.skippedDailyLimit += 1;
      continue;
    }

    if (!dryRun && remainingSlots <= 0) {
      outcomes.push({
        ...base,
        outcome: "skipped_backpressure",
        skipReason: "in_progress_scan_jobs_at_cap",
      });
      counts.skippedBackpressure += 1;
      continue;
    }

    const existing = await findActiveDiagnosisLinkForSurvey(c.surveyLinkId);
    if (existing) {
      outcomes.push({
        ...base,
        outcome: "skipped_duplicate",
        diagnosisJobId: existing.diagnosis_job_id,
        reportId: existing.report_id,
        skipReason: `linkage_${existing.status}`,
      });
      counts.skippedDuplicate += 1;
      continue;
    }

    if (dryRun) {
      const running = await findRunningScanByCacheKey(c.scanCacheKey);
      if (running?.external_scan_id) {
        outcomes.push({
          ...base,
          outcome: "skipped_duplicate",
          diagnosisJobId: running.external_scan_id,
          skipReason: "scan_job_running_or_pending",
        });
        counts.skippedDuplicate += 1;
        continue;
      }
      outcomes.push({ ...base, outcome: "would_enqueue" });
      counts.wouldEnqueue += 1;
      continue;
    }

    const started = await startUrlScanJob({
      formUrl: c.canonicalUrl,
      trigger: "collector_auto",
      completedPolicy: "any_completed",
      processInline: false,
      enqueueOnly: true,
    });

    if (!started.ok) {
      await insertDiagnosisLink({
        surveyLinkId: c.surveyLinkId,
        diagnosisJobId: null,
        canonicalUrl: c.canonicalUrl,
        scanCacheKey: c.scanCacheKey,
        status: "failed_retryable",
        lastError: started.error,
        skipReason: "enqueue_failed",
      });
      linkageCreated += 1;
      remainingDaily -= 1;
      outcomes.push({
        ...base,
        outcome: "failed",
        error: started.error,
      });
      counts.failed += 1;
      continue;
    }

    if (started.alreadyCompleted || started.reusedRunningJob) {
      await insertDiagnosisLink({
        surveyLinkId: c.surveyLinkId,
        diagnosisJobId: started.scanId,
        reportId: started.reportId,
        canonicalUrl: c.canonicalUrl,
        scanCacheKey: started.cacheKey,
        status: started.alreadyCompleted ? "completed" : "queued",
        skipReason: started.alreadyCompleted
          ? "existing_completed_scan"
          : "reused_running_scan",
      });
      linkageCreated += 1;
      remainingDaily -= 1;
      outcomes.push({
        ...base,
        outcome: "skipped_duplicate",
        diagnosisJobId: started.scanId,
        reportId: started.reportId,
        skipReason: started.alreadyCompleted
          ? "scan_job_already_completed"
          : "scan_job_running_or_pending",
      });
      counts.skippedDuplicate += 1;
      continue;
    }

    const link = await insertDiagnosisLink({
      surveyLinkId: c.surveyLinkId,
      diagnosisJobId: started.scanId,
      canonicalUrl: c.canonicalUrl,
      scanCacheKey: started.cacheKey,
      status: "queued",
    });
    linkageCreated += 1;

    outcomes.push({
      ...base,
      outcome: "queued",
      diagnosisJobId: started.scanId,
      reportId: link?.report_id ?? null,
    });
    counts.queued += 1;
    remainingSlots -= 1;
    remainingDaily -= 1;
  }

  const usedAfter = day.total + (dryRun ? 0 : linkageCreated);
  const remainingAfter = dryRun
    ? dailyRemaining
    : Math.max(0, dailyMax - usedAfter);
  const carryover = Math.max(
    0,
    eligible.length - (dryRun ? counts.wouldEnqueue : linkageCreated),
  );
  return {
    dryRun,
    limit,
    inProgressScanJobs: inProgress,
    eligibleBeforeDedupe: eligible.length,
    selected: selectedPool.length,
    outcomes,
    counts,
    organizationDistribution: orgDist,
    platformDistribution: platDist,
    recencyDistribution: recDist,
    daily: {
      ...daily,
      used: dryRun ? day.total : usedAfter,
      remaining: remainingAfter,
      limitReached: remainingAfter <= 0,
    },
    reason: null,
    candidates: eligible.length,
    skippedAlreadyQueued: counts.skippedDuplicate,
    skippedClosed: counts.skippedPrecheckClosed,
    skippedRestricted: counts.skippedPrecheckRestricted,
    dailyUsed: dryRun ? day.total : usedAfter,
    dailyLimit: dailyMax,
    carryover,
    enqueueOnly: true,
  };
}

export async function refreshQueuedDiagnosisLinks(
  links: SurveyDiagnosisLinkRow[],
): Promise<void> {
  for (const link of links) {
    if (!link.diagnosis_job_id) continue;
    if (link.status !== "queued" && link.status !== "running") continue;
    await syncDiagnosisLinkFromScanJob(link.id, link.diagnosis_job_id);
  }
}
