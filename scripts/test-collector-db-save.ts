/**
 * Limited DB save + duplicate integration test for survey link collector.
 * Calls blog / cafe / webkr once each with display<=5. Never prints secrets.
 *
 * Usage: npx tsx scripts/test-collector-db-save.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isCollectorConfigured,
  isCollectorStorageConfigured,
  isNaverSearchConfigured,
} from "../lib/collector/config";
import { extractSurveyUrlsFromText } from "../lib/collector/extractLinks";
import {
  NaverSearchError,
  searchNaverEndpoint,
} from "../lib/collector/naverSearch";
import { isShortenerUrl, toCollectorPlatform } from "../lib/collector/platformDetect";
import { resolveShortSurveyUrl } from "../lib/collector/safeRedirect";
import { normalizeSurveyUrl } from "../lib/collector/urlNormalize";
import {
  finishCollectionRun,
  insertSurveySource,
  tryStartCollectionRun,
  upsertSurveyLink,
} from "../lib/collector/repository";
import { createSupabaseServerClient } from "../lib/supabase/server";
import type { CollectionRunRow, CollectorPlatform } from "../lib/collector/types";

const QUERY = "forms.gle OR form.naver.com OR moaform.com 설문";
const DISPLAY = 5;
const ENDPOINTS = ["blog", "cafearticle", "webkr"] as const;

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mask(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) return `${name}=missing`;
  return `${name}=set(len=${v.length})`;
}

type PassStats = {
  label: string;
  run: CollectionRunRow | null;
  status: string;
  resultsCount: number;
  candidateLinksCount: number;
  newSurveysCount: number;
  duplicateSurveysCount: number;
  sourcesInserted: number;
  sourcesSkippedDup: number;
  errorCount: number;
  errors: string[];
  platforms: Record<string, number>;
  snapshotBefore: Snapshot;
  snapshotAfter: Snapshot;
};

type Snapshot = {
  links: number;
  sources: number;
  runningRuns: number;
  byPlatform: Record<string, number>;
  linkMeta: Array<{
    id: string;
    canonical_url: string;
    discovery_count: number;
    last_discovered_at: string;
  }>;
};

async function takeSnapshot(): Promise<Snapshot> {
  const supabase = createSupabaseServerClient();
  const [linksRes, sourcesRes, runningRes, allLinks] = await Promise.all([
    supabase.from("survey_links").select("id", { count: "exact", head: true }),
    supabase.from("survey_sources").select("id", { count: "exact", head: true }),
    supabase
      .from("collection_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running"),
    supabase
      .from("survey_links")
      .select("id, canonical_url, platform, discovery_count, last_discovered_at"),
  ]);

  if (linksRes.error) throw new Error(`links count: ${linksRes.error.message}`);
  if (sourcesRes.error) throw new Error(`sources count: ${sourcesRes.error.message}`);
  if (runningRes.error) throw new Error(`running count: ${runningRes.error.message}`);
  if (allLinks.error) throw new Error(`links list: ${allLinks.error.message}`);

  const byPlatform: Record<string, number> = {};
  const linkMeta: Snapshot["linkMeta"] = [];
  for (const row of allLinks.data || []) {
    const p = String(row.platform);
    byPlatform[p] = (byPlatform[p] || 0) + 1;
    linkMeta.push({
      id: String(row.id),
      canonical_url: String(row.canonical_url),
      discovery_count: Number(row.discovery_count),
      last_discovered_at: String(row.last_discovered_at),
    });
  }

  return {
    links: linksRes.count ?? 0,
    sources: sourcesRes.count ?? 0,
    runningRuns: runningRes.count ?? 0,
    byPlatform,
    linkMeta,
  };
}

async function assertFkIntegrity(): Promise<{ ok: boolean; detail: string }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_sources")
    .select("id, survey_link_id, survey_links!inner(id)")
    .limit(200);
  if (error) {
    // fallback: manual check
    const sources = await supabase.from("survey_sources").select("id, survey_link_id");
    if (sources.error) return { ok: false, detail: sources.error.message };
    const links = await supabase.from("survey_links").select("id");
    if (links.error) return { ok: false, detail: links.error.message };
    const ids = new Set((links.data || []).map((r) => String(r.id)));
    const orphans = (sources.data || []).filter(
      (s) => !ids.has(String(s.survey_link_id)),
    );
    return {
      ok: orphans.length === 0,
      detail:
        orphans.length === 0
          ? `fk ok (${sources.data?.length ?? 0} sources)`
          : `orphan sources=${orphans.length}`,
    };
  }
  return { ok: true, detail: `fk ok (${data?.length ?? 0} joined)` };
}

async function assertNoDuplicateCanonical(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_links")
    .select("canonical_url");
  if (error) return { ok: false, detail: error.message };
  const urls = (data || []).map((r) => String(r.canonical_url));
  const set = new Set(urls);
  return {
    ok: set.size === urls.length,
    detail: `unique=${set.size} total=${urls.length}`,
  };
}

async function assertNoDuplicateSources(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("survey_sources")
    .select("survey_link_id, source_url");
  if (error) return { ok: false, detail: error.message };
  const keys = (data || []).map(
    (r) => `${r.survey_link_id}||${r.source_url}`,
  );
  const set = new Set(keys);
  return {
    ok: set.size === keys.length,
    detail: `unique=${set.size} total=${keys.length}`,
  };
}

async function runLimitedPass(label: string): Promise<PassStats> {
  const snapshotBefore = await takeSnapshot();
  const lock = await tryStartCollectionRun("admin");
  if (!lock.ok) {
    throw new Error(`${label}: lock failed: ${lock.reason}`);
  }

  const stats = {
    resultsCount: 0,
    candidateLinksCount: 0,
    newSurveysCount: 0,
    duplicateSurveysCount: 0,
    sourcesInserted: 0,
    sourcesSkippedDup: 0,
    errorCount: 0,
    errors: [] as string[],
    platforms: {} as Record<string, number>,
  };

  try {
    for (const endpoint of ENDPOINTS) {
      try {
        const result = await searchNaverEndpoint(endpoint, QUERY, {
          display: DISPLAY,
        });
        stats.resultsCount += result.resultCount;

        for (const hit of result.hits) {
          const candidates = extractSurveyUrlsFromText(
            hit.link,
            hit.title,
            hit.description,
          );
          for (const candidate of candidates) {
            stats.candidateLinksCount += 1;
            try {
              let canonicalUrl: string;
              let originalUrl = candidate;
              let platform: CollectorPlatform | null = toCollectorPlatform(candidate);

              if (isShortenerUrl(candidate)) {
                const resolved = await resolveShortSurveyUrl(candidate);
                if (!resolved.ok) {
                  stats.errorCount += 1;
                  stats.errors.push(`${candidate}: ${resolved.reason}`);
                  continue;
                }
                canonicalUrl = resolved.canonicalUrl;
                originalUrl = candidate;
                platform = resolved.platform;
              } else {
                const normalized = normalizeSurveyUrl(candidate);
                if (!normalized.ok) continue;
                canonicalUrl = normalized.canonicalUrl;
                platform = toCollectorPlatform(canonicalUrl);
                if (!platform) continue;
              }

              const upserted = await upsertSurveyLink({
                canonicalUrl,
                originalUrl,
                platform,
                title: hit.title || null,
              });
              if (upserted.isNew) {
                stats.newSurveysCount += 1;
                stats.platforms[platform] = (stats.platforms[platform] || 0) + 1;
              } else {
                stats.duplicateSurveysCount += 1;
              }

              const source = await insertSurveySource({
                surveyLinkId: upserted.link.id,
                sourceType: hit.sourceType,
                sourceUrl: hit.link,
                sourceTitle: hit.title,
                searchQuery: hit.searchQuery,
                sourcePublishedAt: hit.publishedAt ?? null,
              });
              if (source.inserted) stats.sourcesInserted += 1;
              else stats.sourcesSkippedDup += 1;
            } catch (error) {
              stats.errorCount += 1;
              stats.errors.push(
                `${candidate}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
      } catch (error) {
        stats.errorCount += 1;
        const msg =
          error instanceof NaverSearchError
            ? `[${endpoint}/${error.kind}/${error.status ?? "?"}] ${error.message}`
            : `[${endpoint}] ${String(error)}`;
        stats.errors.push(msg);
      }
      await sleep(300);
    }

    const status =
      stats.errorCount === 0
        ? "completed"
        : stats.newSurveysCount + stats.duplicateSurveysCount > 0
          ? "partial"
          : "failed";

    const finished = await finishCollectionRun({
      runId: lock.run.id,
      status,
      queriesCount: ENDPOINTS.length,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.errorCount,
      errorSummary:
        stats.errors.length > 0
          ? stats.errors.slice(0, 30).join("\n").slice(0, 4000)
          : null,
    });

    const snapshotAfter = await takeSnapshot();
    return {
      label,
      run: finished,
      status: finished?.status || status,
      ...stats,
      snapshotBefore,
      snapshotAfter,
    };
  } catch (error) {
    await finishCollectionRun({
      runId: lock.run.id,
      status: "failed",
      queriesCount: ENDPOINTS.length,
      resultsCount: stats.resultsCount,
      candidateLinksCount: stats.candidateLinksCount,
      newSurveysCount: stats.newSurveysCount,
      duplicateSurveysCount: stats.duplicateSurveysCount,
      errorCount: stats.errorCount + 1,
      errorSummary: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function printPass(p: PassStats): void {
  console.log(`\n=== ${p.label} ===`);
  console.log(`run_id: ${p.run?.id ?? "n/a"}`);
  console.log(`status: ${p.status}`);
  console.log(`results: ${p.resultsCount}`);
  console.log(`candidates: ${p.candidateLinksCount}`);
  console.log(`new_surveys: ${p.newSurveysCount}`);
  console.log(`duplicate_surveys: ${p.duplicateSurveysCount}`);
  console.log(`sources_inserted: ${p.sourcesInserted}`);
  console.log(`sources_skipped_dup: ${p.sourcesSkippedDup}`);
  console.log(`error_count: ${p.errorCount}`);
  if (p.errors.length) {
    console.log(`errors_sample: ${p.errors.slice(0, 5).join(" | ")}`);
  }
  console.log(
    `db_links: ${p.snapshotBefore.links} -> ${p.snapshotAfter.links}`,
  );
  console.log(
    `db_sources: ${p.snapshotBefore.sources} -> ${p.snapshotAfter.sources}`,
  );
  console.log(`running_left: ${p.snapshotAfter.runningRuns}`);
  console.log(`platforms_new_this_pass: ${JSON.stringify(p.platforms)}`);
}

async function main(): Promise<void> {
  loadLocalEnvFiles();
  console.log("=== collector DB save integration ===");
  console.log(mask("NAVER_CLIENT_ID"));
  console.log(mask("NAVER_CLIENT_SECRET"));
  console.log(mask("SUPABASE_URL"));
  console.log(mask("SUPABASE_SERVICE_ROLE_KEY"));
  console.log(`naver=${isNaverSearchConfigured()} storage=${isCollectorStorageConfigured()} configured=${isCollectorConfigured()}`);
  console.log(`query display<=${DISPLAY}; endpoints=${ENDPOINTS.join(",")}`);

  if (!isCollectorConfigured()) {
    throw new Error("collector not configured");
  }

  // Clear any stuck running lock from prior aborted tests
  {
    const supabase = createSupabaseServerClient();
    const { data: stuck } = await supabase
      .from("collection_runs")
      .select("id")
      .eq("status", "running");
    if (stuck && stuck.length > 0) {
      for (const row of stuck) {
        await finishCollectionRun({
          runId: String(row.id),
          status: "failed",
          queriesCount: 0,
          resultsCount: 0,
          candidateLinksCount: 0,
          newSurveysCount: 0,
          duplicateSurveysCount: 0,
          errorCount: 1,
          errorSummary: "cleared stuck running lock before integration test",
        });
      }
      console.log(`cleared stuck running runs: ${stuck.length}`);
    }
  }

  const pass1 = await runLimitedPass("PASS1");
  printPass(pass1);

  await sleep(500);
  const pass2 = await runLimitedPass("PASS2");
  printPass(pass2);

  const fk = await assertFkIntegrity();
  const uniqLinks = await assertNoDuplicateCanonical();
  const uniqSources = await assertNoDuplicateSources();
  const finalSnap = await takeSnapshot();

  // Verify last_discovered_at / discovery_count updates for overlapping URLs
  const beforeMap = new Map(
    pass1.snapshotAfter.linkMeta.map((r) => [r.canonical_url, r]),
  );
  let updatedLast = 0;
  let increasedCount = 0;
  for (const after of pass2.snapshotAfter.linkMeta) {
    const before = beforeMap.get(after.canonical_url);
    if (!before) continue;
    if (after.last_discovered_at > before.last_discovered_at) updatedLast += 1;
    if (after.discovery_count > before.discovery_count) increasedCount += 1;
  }

  console.log("\n=== VERIFICATION ===");
  console.log(`fk: ${fk.ok ? "OK" : "FAIL"} — ${fk.detail}`);
  console.log(`unique_canonical: ${uniqLinks.ok ? "OK" : "FAIL"} — ${uniqLinks.detail}`);
  console.log(`unique_sources: ${uniqSources.ok ? "OK" : "FAIL"} — ${uniqSources.detail}`);
  console.log(`pass2_new_should_be_low: ${pass2.newSurveysCount}`);
  console.log(`pass2_duplicates: ${pass2.duplicateSurveysCount}`);
  console.log(`links_with_newer_last_discovered: ${updatedLast}`);
  console.log(`links_with_higher_discovery_count: ${increasedCount}`);
  console.log(`final_platform_counts: ${JSON.stringify(finalSnap.byPlatform)}`);
  console.log(`final_links=${finalSnap.links} sources=${finalSnap.sources} running=${finalSnap.runningRuns}`);

  // Machine-readable summary for the completion report
  console.log("\n=== REPORT_JSON ===");
  console.log(
    JSON.stringify(
      {
        pass1: {
          newSurveys: pass1.newSurveysCount,
          sourcesInserted: pass1.sourcesInserted,
          status: pass1.status,
          duplicates: pass1.duplicateSurveysCount,
          errors: pass1.errorCount,
          platforms: pass1.platforms,
        },
        pass2: {
          newSurveys: pass2.newSurveysCount,
          sourcesInserted: pass2.sourcesInserted,
          sourcesSkippedDup: pass2.sourcesSkippedDup,
          status: pass2.status,
          duplicates: pass2.duplicateSurveysCount,
          errors: pass2.errorCount,
        },
        dedupeOk: uniqLinks.ok && uniqSources.ok,
        lastDiscoveredUpdated: updatedLast,
        discoveryCountIncreased: increasedCount,
        finalByPlatform: finalSnap.byPlatform,
        fkOk: fk.ok,
        runningLeft: finalSnap.runningRuns,
        runNewMatchesDbDelta:
          pass1.snapshotAfter.links - pass1.snapshotBefore.links ===
          pass1.newSurveysCount,
        pass2RunDupRecorded: pass2.duplicateSurveysCount,
      },
      null,
      2,
    ),
  );

  if (!fk.ok || !uniqLinks.ok || !uniqSources.ok || finalSnap.runningRuns > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("TEST_CRASH:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
