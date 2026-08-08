/**
 * Compare legacy vs org_v1 collector search strategies (local only).
 * Does NOT change Production Cron. Never prints secrets.
 *
 * Usage:
 *   npx tsx scripts/test-collector-strategy-compare.ts
 *   npx tsx scripts/test-collector-strategy-compare.ts --skip-legacy  # org_v1 only
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyCollectorOrgQuality,
  isOfficialOrgQuality,
} from "../lib/collector/orgQuality";
import { runCollection } from "../lib/collector/runCollection";
import {
  summarizeSearchStrategy,
  type CollectorSearchStrategyVariant,
} from "../lib/collector/searchQueries";
import { createSupabaseServerClient } from "../lib/supabase/server";

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

type RunSummary = {
  strategy: CollectorSearchStrategyVariant;
  catalog: ReturnType<typeof summarizeSearchStrategy>;
  ok: boolean;
  error?: string;
  elapsedMs: number;
  apiCalls: number;
  resultsCount: number;
  candidateLinksCount: number;
  newSurveysCount: number;
  duplicateSurveysCount: number;
  errorCount: number;
  invalidSavedCount: number;
  unreachableCount: number;
  queriesCount: number;
  deepStatRows: number;
  topQueries: Array<{
    searchQuery: string;
    newSurveyCount: number;
    candidateCount: number;
    resultsCount: number;
  }>;
  bottomQueries: Array<{
    searchQuery: string;
    newSurveyCount: number;
    candidateCount: number;
    resultsCount: number;
  }>;
  quality: {
    sampled: number;
    public: number;
    company: number;
    university_official: number;
    individual_or_academic: number;
    unknown: number;
    officialEstimated: number;
    academicEstimated: number;
  };
  platformNew: Record<string, number>;
  candidateConversionRate: number;
  newConversionRate: number;
  runningRemaining: number;
};

async function summarizeRun(
  strategy: CollectorSearchStrategyVariant,
  result: Awaited<ReturnType<typeof runCollection>>,
  elapsedMs: number,
): Promise<RunSummary> {
  const catalog = summarizeSearchStrategy(strategy);
  const supabase = createSupabaseServerClient();
  const { count: running } = await supabase
    .from("collection_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running");

  if (!result.ok) {
    return {
      strategy,
      catalog,
      ok: false,
      error: result.error,
      elapsedMs,
      apiCalls: 0,
      resultsCount: 0,
      candidateLinksCount: 0,
      newSurveysCount: 0,
      duplicateSurveysCount: 0,
      errorCount: 1,
      invalidSavedCount: 0,
      unreachableCount: 0,
      queriesCount: 0,
      deepStatRows: 0,
      topQueries: [],
      bottomQueries: [],
      quality: {
        sampled: 0,
        public: 0,
        company: 0,
        university_official: 0,
        individual_or_academic: 0,
        unknown: 0,
        officialEstimated: 0,
        academicEstimated: 0,
      },
      platformNew: {},
      candidateConversionRate: 0,
      newConversionRate: 0,
      runningRemaining: running ?? 0,
    };
  }

  const stats = result.stats;
  const qStats = [...(stats.queryStats || [])].sort(
    (a, b) => b.newSurveyCount - a.newSurveyCount,
  );
  const deepStatRows = qStats.filter((q) =>
    q.searchQuery.includes("[deep:start="),
  ).length;

  const quality = {
    sampled: 0,
    public: 0,
    company: 0,
    university_official: 0,
    individual_or_academic: 0,
    unknown: 0,
    officialEstimated: 0,
    academicEstimated: 0,
  };

  const { data: recentLinks } = await supabase
    .from("survey_links")
    .select("id, title, platform, status, first_discovered_at")
    .gte("first_discovered_at", result.run.started_at)
    .order("first_discovered_at", { ascending: false })
    .limit(80);

  const platformNew: Record<string, number> = {};
  for (const link of recentLinks || []) {
    const cls = classifyCollectorOrgQuality({
      title: link.title,
      searchQuery: null,
    });
    quality.sampled += 1;
    quality[cls] += 1;
    if (isOfficialOrgQuality(cls)) quality.officialEstimated += 1;
    if (cls === "individual_or_academic") quality.academicEstimated += 1;
    if (link.status !== "ignored") {
      const p = String(link.platform || "unknown");
      platformNew[p] = (platformNew[p] || 0) + 1;
    }
  }

  // Enrich with source titles when available
  if (recentLinks?.length) {
    const ids = recentLinks.map((l) => l.id);
    const { data: sources } = await supabase
      .from("survey_sources")
      .select("survey_link_id, source_title, search_query")
      .in("survey_link_id", ids)
      .limit(200);
    const byLink = new Map<string, { title?: string; query?: string }>();
    for (const s of sources || []) {
      byLink.set(String(s.survey_link_id), {
        title: s.source_title || undefined,
        query: s.search_query || undefined,
      });
    }
    // Recompute with richer text for sampled links
    quality.public = 0;
    quality.company = 0;
    quality.university_official = 0;
    quality.individual_or_academic = 0;
    quality.unknown = 0;
    quality.officialEstimated = 0;
    quality.academicEstimated = 0;
    for (const link of recentLinks) {
      const extra = byLink.get(link.id);
      const cls = classifyCollectorOrgQuality({
        title: link.title || extra?.title,
        description: extra?.title,
        searchQuery: extra?.query,
      });
      quality[cls] += 1;
      if (isOfficialOrgQuality(cls)) quality.officialEstimated += 1;
      if (cls === "individual_or_academic") quality.academicEstimated += 1;
    }
  }

  const candRate =
    stats.resultsCount > 0
      ? stats.candidateLinksCount / stats.resultsCount
      : 0;
  const newRate =
    stats.candidateLinksCount > 0
      ? stats.newSurveysCount / stats.candidateLinksCount
      : 0;

  return {
    strategy,
    catalog,
    ok: true,
    elapsedMs,
    apiCalls: stats.apiCalls || 0,
    resultsCount: stats.resultsCount,
    candidateLinksCount: stats.candidateLinksCount,
    newSurveysCount: stats.newSurveysCount,
    duplicateSurveysCount: stats.duplicateSurveysCount,
    errorCount: stats.errorCount,
    invalidSavedCount: stats.invalidSavedCount || 0,
    unreachableCount: stats.unreachableCount || 0,
    queriesCount: stats.queriesCount,
    deepStatRows,
    topQueries: qStats.slice(0, 10).map((q) => ({
      searchQuery: q.searchQuery,
      newSurveyCount: q.newSurveyCount,
      candidateCount: q.candidateCount,
      resultsCount: q.resultsCount,
    })),
    bottomQueries: [...qStats]
      .sort(
        (a, b) =>
          a.newSurveyCount - b.newSurveyCount ||
          a.candidateCount - b.candidateCount,
      )
      .slice(0, 10)
      .map((q) => ({
        searchQuery: q.searchQuery,
        newSurveyCount: q.newSurveyCount,
        candidateCount: q.candidateCount,
        resultsCount: q.resultsCount,
      })),
    quality,
    platformNew,
    candidateConversionRate: candRate,
    newConversionRate: newRate,
    runningRemaining: running ?? 0,
  };
}

async function main() {
  loadLocalEnvFiles();
  const skipLegacy = process.argv.includes("--skip-legacy");
  const skipOrg = process.argv.includes("--skip-org");
  const quick = process.argv.includes("--quick");

  const report: {
    startedAt: string;
    legacy: RunSummary | null;
    org_v1: RunSummary | null;
    comparison: Record<string, number | string | boolean> | null;
    productionReady: boolean;
    productionReadyReason: string;
  } = {
    startedAt: new Date().toISOString(),
    legacy: null,
    org_v1: null,
    comparison: null,
    productionReady: false,
    productionReadyReason: "",
  };

  if (!skipLegacy) {
    const t0 = Date.now();
    const result = await runCollection({
      trigger: "admin",
      strategy: "legacy",
      maxApiCalls: quick ? 12 : undefined,
    });
    report.legacy = await summarizeRun("legacy", result, Date.now() - t0);
  }

  if (!skipOrg) {
    const t0 = Date.now();
    const result = await runCollection({
      trigger: "admin",
      strategy: "org_v1",
      maxApiCalls: quick ? 12 : undefined,
    });
    report.org_v1 = await summarizeRun("org_v1", result, Date.now() - t0);
  }

  if (report.legacy?.ok && report.org_v1?.ok) {
    const L = report.legacy;
    const O = report.org_v1;
    const newDelta =
      L.newSurveysCount === 0
        ? O.newSurveysCount > 0
          ? 100
          : 0
        : ((O.newSurveysCount - L.newSurveysCount) / L.newSurveysCount) * 100;
    const officialShare = (s: RunSummary) =>
      s.quality.sampled > 0
        ? s.quality.officialEstimated / s.quality.sampled
        : 0;
    const academicShare = (s: RunSummary) =>
      s.quality.sampled > 0
        ? s.quality.academicEstimated / s.quality.sampled
        : 0;
    const invalidRate =
      O.candidateLinksCount > 0
        ? O.invalidSavedCount / O.candidateLinksCount
        : 0;

    const betterNew = O.newSurveysCount >= L.newSurveysCount;
    const betterOfficial = officialShare(O) >= officialShare(L) - 0.02;
    const lessAcademic = academicShare(O) <= academicShare(L) + 0.05;
    const timeOk = O.elapsedMs < 115_000;
    const runningOk = O.runningRemaining === 0;
    const invalidOk = invalidRate <= 0.05;
    const apiOk = O.errorCount === 0 || O.newSurveysCount > 0;

    report.comparison = {
      newSurveysDeltaPct: Number(newDelta.toFixed(1)),
      resultsDeltaPct: Number(
        (
          ((O.resultsCount - L.resultsCount) / Math.max(1, L.resultsCount)) *
          100
        ).toFixed(1),
      ),
      officialShareLegacy: Number((officialShare(L) * 100).toFixed(1)),
      officialShareOrgV1: Number((officialShare(O) * 100).toFixed(1)),
      academicShareLegacy: Number((academicShare(L) * 100).toFixed(1)),
      academicShareOrgV1: Number((academicShare(O) * 100).toFixed(1)),
      invalidRateOrgV1Pct: Number((invalidRate * 100).toFixed(2)),
      elapsedMsLegacy: L.elapsedMs,
      elapsedMsOrgV1: O.elapsedMs,
      apiCallsLegacy: L.apiCalls,
      apiCallsOrgV1: O.apiCalls,
    };

    report.productionReady =
      betterNew &&
      betterOfficial &&
      lessAcademic &&
      timeOk &&
      runningOk &&
      invalidOk &&
      apiOk;
    report.productionReadyReason = report.productionReady
      ? "org_v1 meets compare gates vs legacy (still requires explicit human approval before Production env flip)"
      : `gates: betterNew=${betterNew} betterOfficial=${betterOfficial} lessAcademic=${lessAcademic} timeOk=${timeOk} runningOk=${runningOk} invalidOk=${invalidOk} apiOk=${apiOk}`;
  } else {
    report.productionReady = false;
    report.productionReadyReason =
      "incomplete compare (one or both strategies failed or skipped)";
  }

  const out = resolve(process.cwd(), "scripts/tmp-strategy-compare.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
