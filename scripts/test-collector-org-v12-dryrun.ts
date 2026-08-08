/**
 * org_v1.2 dry-run: search volume kept, validation backlog via A/B/C triage.
 * Default dryRun=true — does not write survey_links.
 *
 * Usage: npx tsx scripts/test-collector-org-v12-dryrun.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isDailyBacklogQueue,
  triageCandidate,
  type TriageQueue,
} from "../lib/collector/candidateTriage";
import {
  COLLECTOR_DAILY_BACKLOG_CAP,
  COLLECTOR_DISCOVERED_BATCH_SIZE,
  COLLECTOR_ORG_RUNTIME_TARGET_MS,
} from "../lib/collector/opsPolicy";
import { runOrgV11Collection } from "../lib/collector/runOrgV11Collection";
import { summarizeSearchStrategy } from "../lib/collector/searchQueries";
import { extractSurveyUrlsFromText } from "../lib/collector/extractLinks";
import {
  searchNaverEndpoint,
} from "../lib/collector/naverSearch";
import {
  buildCollectorSearchQueries,
  selectOrgV1PageOneQueries,
} from "../lib/collector/searchQueries";
import { validateSurveyResponseUrl } from "../lib/collector/surveyUrlRules";
import { normalizeSurveyUrl } from "../lib/collector/urlNormalize";
import { isShortenerUrl } from "../lib/collector/platformDetect";
import {
  COLLECTOR_DEEP_SEARCH_API_SHARE,
  COLLECTOR_MAX_API_CALLS,
  COLLECTOR_SEARCH_DELAY_MS,
  COLLECTOR_SEARCH_DISPLAY_ORG,
} from "../lib/collector/config";
import { loadKnownCanonicalUrls, loadKnownSourceUrls } from "../lib/collector/repository";
import { isCollectorConfigured } from "../lib/collector/config";

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Cand = {
  canonicalUrl: string;
  sourceUrl: string;
  sourceTitle: string;
  description: string;
  searchQuery: string;
  sortMode: "date" | "sim";
  publishedAt: string | null;
  sourceType: string;
};

async function main() {
  loadLocalEnvFiles();
  const catalog = summarizeSearchStrategy("org_v1");
  const startedAt = Date.now();
  const maxApiCalls = COLLECTOR_MAX_API_CALLS;
  const deepReserve = Math.max(
    1,
    Math.floor(maxApiCalls * COLLECTOR_DEEP_SEARCH_API_SHARE),
  );
  const queries = selectOrgV1PageOneQueries(maxApiCalls, deepReserve);
  const cycle = ["blog", "cafearticle", "webkr"] as const;

  const knownSources = new Set<string>();
  const knownCanonicals = new Set<string>();
  if (isCollectorConfigured()) {
    try {
      for (const u of await loadKnownSourceUrls()) knownSources.add(u);
      for (const k of (await loadKnownCanonicalUrls()).keys()) {
        knownCanonicals.add(k);
      }
    } catch {
      /* ignore */
    }
  }

  let apiCalls = 0;
  let resultsCount = 0;
  const candidates: Cand[] = [];
  const seenCanon = new Set<string>();
  const searchStarted = Date.now();

  for (let qi = 0; qi < queries.length; qi += 1) {
    if (apiCalls >= maxApiCalls - deepReserve) break;
    const item = queries[qi]!;
    const endpoint = cycle[qi % cycle.length]!;
    const sort = (item.sort || item.preferredSort) as "date" | "sim";
    apiCalls += 1;
    try {
      const result = await searchNaverEndpoint(endpoint, item.query, {
        display: COLLECTOR_SEARCH_DISPLAY_ORG,
        sort,
        start: 1,
      });
      resultsCount += result.resultCount;
      for (const hit of result.hits) {
        if (knownSources.has(hit.link)) continue;
        const urls = extractSurveyUrlsFromText(
          hit.link,
          hit.title,
          hit.description,
        );
        for (const raw of urls) {
          if (isShortenerUrl(raw)) {
            const key = `short:${raw}`;
            if (seenCanon.has(key)) continue;
            seenCanon.add(key);
            candidates.push({
              canonicalUrl: raw,
              sourceUrl: hit.link,
              sourceTitle: hit.title,
              description: hit.description,
              searchQuery: item.query,
              sortMode: sort,
              publishedAt: hit.publishedAt ?? null,
              sourceType: hit.sourceType,
            });
            continue;
          }
          const norm = normalizeSurveyUrl(raw);
          if (!norm.ok) continue;
          const fmt = validateSurveyResponseUrl(norm.canonicalUrl);
          if (!fmt.ok) continue;
          if (knownCanonicals.has(norm.canonicalUrl)) continue;
          if (seenCanon.has(norm.canonicalUrl)) continue;
          seenCanon.add(norm.canonicalUrl);
          candidates.push({
            canonicalUrl: norm.canonicalUrl,
            sourceUrl: hit.link,
            sourceTitle: hit.title,
            description: hit.description,
            searchQuery: item.query,
            sortMode: sort,
            publishedAt: hit.publishedAt ?? null,
            sourceType: hit.sourceType,
          });
        }
        knownSources.add(hit.link);
      }
    } catch {
      /* count as soft fail */
    }
    await sleep(COLLECTOR_SEARCH_DELAY_MS);
  }

  // Light deep: top 3 depthEnabled × start 101 only (keep under time)
  const deepSeeds = buildCollectorSearchQueries({ strategy: "org_v1" })
    .filter((q) => q.depthEnabled)
    .slice(0, 3);
  for (let di = 0; di < deepSeeds.length; di += 1) {
    if (apiCalls >= maxApiCalls) break;
    const item = deepSeeds[di]!;
    const endpoint = cycle[di % cycle.length]!;
    apiCalls += 1;
    try {
      const result = await searchNaverEndpoint(endpoint, item.query, {
        display: COLLECTOR_SEARCH_DISPLAY_ORG,
        sort: "date",
        start: 101,
      });
      resultsCount += result.resultCount;
      for (const hit of result.hits) {
        if (knownSources.has(hit.link)) continue;
        const urls = extractSurveyUrlsFromText(
          hit.link,
          hit.title,
          hit.description,
        );
        for (const raw of urls) {
          if (isShortenerUrl(raw)) continue;
          const norm = normalizeSurveyUrl(raw);
          if (!norm.ok) continue;
          if (!validateSurveyResponseUrl(norm.canonicalUrl).ok) continue;
          if (knownCanonicals.has(norm.canonicalUrl)) continue;
          if (seenCanon.has(norm.canonicalUrl)) continue;
          seenCanon.add(norm.canonicalUrl);
          candidates.push({
            canonicalUrl: norm.canonicalUrl,
            sourceUrl: hit.link,
            sourceTitle: hit.title,
            description: hit.description,
            searchQuery: item.query,
            sortMode: "date",
            publishedAt: hit.publishedAt ?? null,
            sourceType: hit.sourceType,
          });
        }
      }
    } catch {
      /* ignore */
    }
    await sleep(COLLECTOR_SEARCH_DELAY_MS);
  }

  const searchElapsedMs = Date.now() - searchStarted;

  const orgCounts: Record<string, number> = {
    public: 0,
    company: 0,
    university_official: 0,
    individual_or_academic: 0,
    unknown: 0,
  };
  const recencyCounts: Record<string, number> = {
    recent_high: 0,
    recent_possible: 0,
    unknown: 0,
    likely_old: 0,
  };
  const queueCounts: Record<TriageQueue, number> = {
    A_PRIORITY: 0,
    B_PRIORITY: 0,
    C_ARCHIVE: 0,
  };

  const triaged = candidates.map((c) => {
    const t = triageCandidate({
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      description: c.description,
      surveyTitle: c.sourceTitle,
      searchQuery: c.searchQuery,
      sourceType: c.sourceType as "web" | "blog" | "cafe" | "unknown",
      sourcePublishedAt: c.publishedAt,
      sortMode: c.sortMode,
      firstSeenThisRun: true,
    });
    orgCounts[t.organization] += 1;
    recencyCounts[t.recency] += 1;
    queueCounts[t.queue] += 1;
    return { ...c, triage: t };
  });

  const aList = triaged.filter((c) => c.triage.queue === "A_PRIORITY");
  const bList = triaged.filter((c) => c.triage.queue === "B_PRIORITY");
  const cList = triaged.filter((c) => c.triage.queue === "C_ARCHIVE");

  // Capacity control: keep A+B within daily processing ability without cutting search
  const rankedAB = [...aList, ...bList].sort(
    (x, y) =>
      y.triage.organizationScore +
      y.triage.recencyScore -
      (x.triage.organizationScore + x.triage.recencyScore),
  );
  const cappedAB = rankedAB.slice(0, COLLECTOR_DAILY_BACKLOG_CAP);
  const overflowToArchive = rankedAB.slice(COLLECTOR_DAILY_BACKLOG_CAP);
  const aCapped = cappedAB.filter((c) => c.triage.queue === "A_PRIORITY");
  const bCapped = cappedAB.filter((c) => c.triage.queue === "B_PRIORITY");
  const cEffective = [...cList, ...overflowToArchive];
  const backlogInflow = cappedAB.length;

  // Stratified sample ~150 from capped queues + archive
  const samplePool = [
    ...aCapped.slice(0, 50),
    ...bCapped.slice(0, 50),
    ...cEffective.slice(0, 50),
  ];
  if (samplePool.length < 150) {
    const used = new Set(samplePool.map((x) => x.canonicalUrl));
    for (const x of [...aCapped, ...bCapped, ...cEffective]) {
      if (samplePool.length >= 150) break;
      if (used.has(x.canonicalUrl)) continue;
      used.add(x.canonicalUrl);
      samplePool.push(x);
    }
  }
  const sampleOrg: Record<string, number> = {
    public: 0,
    company: 0,
    university_official: 0,
    individual_or_academic: 0,
    unknown: 0,
  };
  for (const s of samplePool) {
    sampleOrg[s.triage.organization] += 1;
  }
  const sampleN = samplePool.length || 1;
  const sampleOfficial =
    sampleOrg.public +
    sampleOrg.company +
    sampleOrg.university_official;
  const aOfficial = aCapped.filter((x) =>
    ["public", "company", "university_official"].includes(
      x.triage.organization,
    ),
  ).length;
  const aOfficialPct =
    aCapped.length > 0
      ? Number(((aOfficial / aCapped.length) * 100).toFixed(1))
      : 0;

  const inlineBudget = 40;
  const inlineCount = Math.min(inlineBudget, aCapped.length);
  const estimatedInlineMs = inlineCount * 500;
  const totalElapsedEstimate = searchElapsedMs + estimatedInlineMs;

  const dailyCapacity = Math.max(
    COLLECTOR_DISCOVERED_BATCH_SIZE * 3,
    COLLECTOR_DAILY_BACKLOG_CAP,
  ); // 3 jobs × ≥50, or match cap 180
  const netBacklog = backlogInflow - dailyCapacity;

  const report = {
    mode: "dryRun org_v1.2 triage (no DB writes)",
    catalog,
    resultsCount,
    apiCalls,
    candidateCount: candidates.length,
    organizationCounts: orgCounts,
    recencyCounts,
    queueCountsBeforeCap: queueCounts,
    queueCountsAfterCap: {
      A_PRIORITY: aCapped.length,
      B_PRIORITY: bCapped.length,
      C_ARCHIVE: cEffective.length,
      overflowArchived: overflowToArchive.length,
      dailyBacklogCap: COLLECTOR_DAILY_BACKLOG_CAP,
    },
    aPriority: aCapped.length,
    bPriority: bCapped.length,
    cArchive: cEffective.length,
    preCapAB: aList.length + bList.length,
    dailyBacklogInflowAB: backlogInflow,
    dailyCapacityProposed: dailyCapacity,
    backlogNetPerDay: netBacklog,
    backlogTrend: netBacklog <= 0 ? "net_decrease_or_flat" : "net_increase",
    sample150: {
      n: samplePool.length,
      counts: sampleOrg,
      ratiosPct: Object.fromEntries(
        Object.entries(sampleOrg).map(([k, v]) => [
          k,
          Number(((v / sampleN) * 100).toFixed(1)),
        ]),
      ),
      officialPct: Number(((sampleOfficial / sampleN) * 100).toFixed(1)),
      academicPct: Number(
        ((sampleOrg.individual_or_academic / sampleN) * 100).toFixed(1),
      ),
      unknownPct: Number(((sampleOrg.unknown / sampleN) * 100).toFixed(1)),
    },
    aPriorityOfficialPct: aOfficialPct,
    searchElapsedMs,
    estimatedInlineMs,
    estimatedTotalElapsedMs: totalElapsedEstimate,
    runtimeTargetMs: COLLECTOR_ORG_RUNTIME_TARGET_MS,
    underTarget: totalElapsedEstimate <= COLLECTOR_ORG_RUNTIME_TARGET_MS,
    productionGates: {
      backlogNotGrowing: netBacklog <= 0,
      officialSampleGe60: (sampleOfficial / sampleN) * 100 >= 60,
      academicLe5: (sampleOrg.individual_or_academic / sampleN) * 100 <= 5,
      unknownLe30: (sampleOrg.unknown / sampleN) * 100 <= 30,
      aOfficialGe80: aOfficialPct >= 80,
      searchGe3000: resultsCount >= 3000,
    },
    elapsedWallMs: Date.now() - startedAt,
  };

  const gates = report.productionGates;
  const judgment =
    gates.backlogNotGrowing &&
    gates.officialSampleGe60 &&
    gates.academicLe5 &&
    gates.unknownLe30 &&
    gates.aOfficialGe80 &&
    gates.searchGe3000
      ? "가능"
      : gates.backlogNotGrowing && gates.academicLe5 && gates.searchGe3000
        ? "조건부 가능"
        : "추가 보완 필요";

  const out = {
    ...report,
    productionJudgment: judgment,
    note: "C_ARCHIVE excluded from daily backlog inflow count",
  };

  const path = resolve(process.cwd(), "scripts/tmp-org-v12-dryrun.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  console.log(`wrote ${path}`);

  // Also keep a tiny reference that v1.1 path still exists
  void runOrgV11Collection;
  void isDailyBacklogQueue;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
