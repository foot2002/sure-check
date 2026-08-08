/**
 * Ops validation batch for Diagnosis Bridge:
 * 1) dry-run up to 20
 * 2) enqueue exact would_enqueue set (excluding prior test IDs)
 * 3) await processScanJob via startUrlScanJob({ processInline: true })
 * 4) sync linkage + write report
 *
 * Does not raise production dispatcher caps; sequential processInline
 * avoids backpressure while keeping the existing scan pipeline.
 *
 * Usage:
 *   npx tsx scripts/run-diagnosis-validation-batch.ts --dry-run
 *   npx tsx scripts/run-diagnosis-validation-batch.ts --enqueue
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  dispatchCollectorDiagnoses,
  type DispatchItemOutcome,
} from "../lib/collector/diagnosisBridge";
import {
  insertDiagnosisLink,
  syncDiagnosisLinkFromScanJob,
} from "../lib/collector/diagnosisLinkRepository";
import { startUrlScanJob } from "../lib/jobs/startUrlScanJob";
import {
  countInProgressScanJobs,
  findAnyCompletedScanByCacheKey,
  findRunningScanByCacheKey,
} from "../lib/jobs/scanJobQueue";
import { hashNormalizedUrl } from "../lib/utils/hash";
import { normalizeUrl } from "../lib/utils/normalizeUrl";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]?.trim()) {
        process.env[key] = value;
      }
    }
  }
}

function priorTestIds(): Set<string> {
  const path = resolve(process.cwd(), "scripts/tmp-diagnosis-enqueue-10.json");
  if (!existsSync(path)) return new Set();
  const meta = JSON.parse(readFileSync(path, "utf8"));
  return new Set(
    (meta.outcomes || []).map((o: { surveyLinkId: string }) => o.surveyLinkId),
  );
}

function cacheKeyFor(url: string): string {
  let normalized = url;
  try {
    normalized = normalizeUrl(url);
  } catch {
    /* keep */
  }
  return hashNormalizedUrl(normalized);
}

function classifyLimitedReason(text: string | null | undefined): string {
  const t = text || "";
  if (/응답이\s*종료|설문이\s*종료|종료되어|마감|closed|더\s*이상\s*응답/i.test(t)) {
    return "survey_closed";
  }
  if (/비공개|로그인|권한|접근\s*제한|private|restricted/i.test(t)) {
    return "private_or_restricted";
  }
  if (/JavaScript\s*실행\s*후|fetch\s*기반\s*추출|동적\s*로딩|문항이\s*로딩/i.test(t)) {
    return "js_questions_unavailable";
  }
  if (/시간이\s*초과|timed?\s*out|timeout/i.test(t)) {
    return "timeout";
  }
  if (/읽지\s*못했|추출|문항을\s*자동/i.test(t)) {
    return "extraction_limited";
  }
  return "other";
}

async function main() {
  loadLocalEnvFiles();
  const argv = process.argv.slice(2);
  const dryOnly = argv.includes("--dry-run");
  const doEnqueue = argv.includes("--enqueue");
  if (dryOnly === doEnqueue) {
    throw new Error("Specify exactly one of --dry-run or --enqueue");
  }

  const exclude = priorTestIds();
  const inProgress = await countInProgressScanJobs();
  const dry = await dispatchCollectorDiagnoses({ limit: 20, dryRun: true });

  const filteredOutcomes = dry.outcomes.filter(
    (o) => !exclude.has(o.surveyLinkId),
  );
  const wouldEnqueue = filteredOutcomes.filter(
    (o) => o.outcome === "would_enqueue",
  );
  const skippedDup = filteredOutcomes.filter(
    (o) => o.outcome === "skipped_duplicate",
  );

  const dryPayload = {
    inProgressScanJobs: inProgress,
    priorExcluded: exclude.size,
    eligibleBeforeDedupe: dry.eligibleBeforeDedupe,
    selectedRaw: dry.selected,
    selectedAfterPriorExclude: filteredOutcomes.length,
    wouldEnqueue: wouldEnqueue.length,
    skippedDuplicate: skippedDup.length,
    organizationDistribution: dry.organizationDistribution,
    platformDistribution: dry.platformDistribution,
    recencyDistribution: dry.recencyDistribution,
    outcomes: filteredOutcomes,
    wouldEnqueueList: wouldEnqueue.map((o) => ({
      surveyLinkId: o.surveyLinkId,
      url: o.canonicalUrl,
      platform: o.platform,
      organization: o.organization,
      recency: o.recency,
      queue: o.queue,
    })),
  };
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp-diagnosis-dryrun-new20.json"),
    JSON.stringify(dryPayload, null, 2),
  );
  console.log(JSON.stringify({ phase: "dry-run", ...dryPayload }, null, 2));

  if (dryOnly) return;

  if (inProgress > 0) {
    console.log(
      JSON.stringify({
        ok: false,
        error: "backlog_in_progress",
        inProgress,
      }),
    );
    process.exit(2);
  }

  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const targets = wouldEnqueue.slice(0, 20);
  const enqueueRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]!;
    const started = Date.now();
    const ck = cacheKeyFor(t.canonicalUrl);

    // Preflight: no running / any completed for this URL
    const running = await findRunningScanByCacheKey(ck);
    const completed = await findAnyCompletedScanByCacheKey(ck);
    if (running || completed) {
      enqueueRows.push({
        ...t,
        outcome: "skipped_preflight_duplicate",
        running: Boolean(running),
        completed: Boolean(completed),
        duration_ms: Date.now() - started,
      });
      continue;
    }

    console.log(
      JSON.stringify({
        event: "enqueue_start",
        i: i + 1,
        total: targets.length,
        surveyLinkId: t.surveyLinkId,
        platform: t.platform,
      }),
    );

    const startedJob = await startUrlScanJob({
      formUrl: t.canonicalUrl,
      trigger: "collector_auto",
      completedPolicy: "any_completed",
      processInline: true,
    });

    if (!startedJob.ok) {
      enqueueRows.push({
        ...t,
        outcome: "failed",
        error: startedJob.error,
        duration_ms: Date.now() - started,
      });
      continue;
    }

    let linkStatus:
      | "queued"
      | "completed"
      | "limited"
      | "failed_retryable"
      | "failed_final" = "queued";
    if (startedJob.alreadyCompleted) linkStatus = "completed";

    const link = await insertDiagnosisLink({
      surveyLinkId: t.surveyLinkId,
      diagnosisJobId: startedJob.scanId,
      reportId: startedJob.reportId,
      canonicalUrl: t.canonicalUrl,
      scanCacheKey: startedJob.cacheKey,
      status: linkStatus,
      skipReason: startedJob.alreadyCompleted
        ? "existing_completed_scan"
        : startedJob.reusedRunningJob
          ? "reused_running_scan"
          : null,
    });

    if (link?.id && startedJob.scanId) {
      await syncDiagnosisLinkFromScanJob(link.id, startedJob.scanId);
    }

    const { data: job } = await sb
      .from("scan_jobs")
      .select(
        "id, status, error_message, extraction_mode, browser_used, fallback_triggered, fallback_reason, extract_duration_ms, total_duration_ms, created_at, completed_at",
      )
      .eq("external_scan_id", startedJob.scanId)
      .maybeSingle();

    let report: Record<string, unknown> | null = null;
    if (job?.id) {
      const { data: rep } = await sb
        .from("scan_reports")
        .select(
          "id, score, overall_risk_level, risk_grade, diagnosis_status, report_json",
        )
        .eq("scan_job_id", job.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      report = (rep as Record<string, unknown> | null) ?? null;
    }

    const { data: linkAfter } = await sb
      .from("survey_diagnosis_links")
      .select(
        "status, report_id, extractor_key, last_error, skip_reason, diagnosis_job_id",
      )
      .eq("survey_link_id", t.surveyLinkId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const json = report?.report_json as Record<string, unknown> | null;
    let extractor: string | null =
      (linkAfter?.extractor_key as string | null) || null;
    if (!extractor && json) {
      const stack: unknown[] = [json];
      while (stack.length && !extractor) {
        const cur = stack.pop();
        if (!cur || typeof cur !== "object") continue;
        if (Array.isArray(cur)) {
          for (const v of cur) stack.push(v);
          continue;
        }
        for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
          if (/extractor/i.test(k) && typeof v === "string" && v.trim()) {
            extractor = v;
            break;
          }
          if (v && typeof v === "object") stack.push(v);
        }
      }
    }

    const failureReason =
      (linkAfter?.last_error as string | null) ||
      (job?.error_message as string | null) ||
      null;
    const limitedTaxonomy =
      (linkAfter?.status === "limited" || job?.status === "limited")
        ? classifyLimitedReason(failureReason)
        : null;

    const row = {
      survey_link_id: t.surveyLinkId,
      url: t.canonicalUrl,
      platform: t.platform,
      organization: t.organization,
      priority: t.queue,
      recency: t.recency,
      diagnosis_job_id: startedJob.scanId,
      scan_status: job?.status ?? null,
      linkage_status: linkAfter?.status ?? null,
      report_id: linkAfter?.report_id ?? report?.id ?? null,
      score: report?.score ?? null,
      risk_level: report?.overall_risk_level ?? null,
      grade: report?.risk_grade ?? null,
      extractor_key: extractor,
      browser_used: job?.browser_used ?? null,
      fallback_triggered: job?.fallback_triggered ?? null,
      fallback_reason: job?.fallback_reason ?? null,
      extract_duration_ms: job?.extract_duration_ms ?? null,
      total_duration_ms: job?.total_duration_ms ?? null,
      duration_ms: Date.now() - started,
      failure_reason: failureReason,
      limited_taxonomy: limitedTaxonomy,
      outcome: "processed",
    };
    enqueueRows.push(row);
    console.log(JSON.stringify({ event: "enqueue_done", ...row }));
  }

  // Dedupe / stuck checks
  const urls = enqueueRows
    .map((r) => String(r.url || ""))
    .filter(Boolean);
  const urlDup =
    urls.length - new Set(urls).size;
  const surveyIds = enqueueRows
    .map((r) => String(r.survey_link_id || ""))
    .filter(Boolean);
  const surveyDup = surveyIds.length - new Set(surveyIds).size;

  const byPlatform = (p: string) =>
    enqueueRows.filter((r) => r.platform === p && r.outcome === "processed");
  const statsFor = (rows: Array<Record<string, unknown>>) => {
    const dur = rows
      .map((r) => Number(r.duration_ms) || 0)
      .filter((n) => n > 0);
    return {
      n: rows.length,
      completed: rows.filter((r) => r.linkage_status === "completed" || r.scan_status === "completed").length,
      limited: rows.filter((r) => r.linkage_status === "limited" || r.scan_status === "limited").length,
      failed_retryable: rows.filter((r) => r.linkage_status === "failed_retryable").length,
      failed_final: rows.filter((r) => r.linkage_status === "failed_final").length,
      with_report: rows.filter((r) => r.report_id).length,
      avg_ms:
        dur.length > 0
          ? Math.round(dur.reduce((a, b) => a + b, 0) / dur.length)
          : null,
      max_ms: dur.length ? Math.max(...dur) : null,
    };
  };

  const processed = enqueueRows.filter((r) => r.outcome === "processed");
  const limitedTaxonomyCounts: Record<string, number> = {};
  for (const r of processed) {
    if (r.limited_taxonomy) {
      const k = String(r.limited_taxonomy);
      limitedTaxonomyCounts[k] = (limitedTaxonomyCounts[k] || 0) + 1;
    }
  }

  // System failure definition
  const systemFailures = processed.filter((r) => {
    const tax = String(r.limited_taxonomy || "");
    if (tax === "timeout") return true;
    if (r.scan_status === "failed") return true;
    if (r.linkage_status === "failed_retryable" || r.linkage_status === "failed_final") {
      return true;
    }
    // stuck
    if (
      r.scan_status === "pending" ||
      r.scan_status === "running" ||
      r.linkage_status === "queued" ||
      r.linkage_status === "running"
    ) {
      return true;
    }
    return false;
  });

  const summary = {
    dryWouldEnqueue: wouldEnqueue.length,
    enqueuedAttempted: targets.length,
    processed: processed.length,
    skippedPreflight: enqueueRows.filter(
      (r) => r.outcome === "skipped_preflight_duplicate",
    ).length,
    failedStart: enqueueRows.filter((r) => r.outcome === "failed").length,
    overall: statsFor(processed),
    google: statsFor(byPlatform("google_forms")),
    naver: statsFor(byPlatform("naver_form")),
    moaform: statsFor(byPlatform("moaform")),
    limitedTaxonomyCounts,
    systemFailureCount: systemFailures.length,
    systemFailureRate:
      processed.length > 0 ? systemFailures.length / processed.length : null,
    urlDuplicateCount: urlDup,
    surveyDuplicateCount: surveyDup,
    priorIdsExcluded: [...exclude],
    dryRunMatch: {
      dryList: wouldEnqueue.map((o) => o.surveyLinkId),
      enqueuedList: targets.map((o) => o.surveyLinkId),
      identical:
        wouldEnqueue.length === targets.length &&
        wouldEnqueue.every((o, i) => o.surveyLinkId === targets[i]?.surveyLinkId),
    },
  };

  const payload = {
    done_at: new Date().toISOString(),
    dry: dryPayload,
    summary,
    rows: enqueueRows,
    systemFailures,
  };
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp-diagnosis-validation-20.json"),
    JSON.stringify(payload, null, 2),
  );
  console.log(JSON.stringify({ phase: "enqueue-summary", summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
