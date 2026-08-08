/**
 * Independent A_PRIORITY quality review for org_v1.2 canary readiness.
 * Does NOT treat classifyOrganizationLowCost as ground truth.
 *
 * Usage: npx tsx scripts/review-a-priority-100.ts
 * Writes: scripts/tmp-a-priority-review.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyCanaryAbCaps,
  triageCandidate,
  type TriageResult,
} from "../lib/collector/candidateTriage";
import { COLLECTOR_CANARY, getCanaryDailyCaps } from "../lib/collector/canaryPolicy";
import {
  evidenceReviewLabel,
  fetchPageTitleSoft,
} from "../lib/collector/independentReview";
import { extractSurveyUrlsFromText } from "../lib/collector/extractLinks";
import { searchNaverEndpoint } from "../lib/collector/naverSearch";
import {
  buildCollectorSearchQueries,
  selectOrgV1PageOneQueries,
  summarizeSearchStrategy,
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
import type { CollectorOrgQualityClass } from "../lib/collector/orgQuality";

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

function platformOf(url: string): "google_forms" | "naver_form" | "moaform" | "other" {
  const u = url.toLowerCase();
  if (u.includes("docs.google.com") || u.includes("forms.gle")) return "google_forms";
  if (u.includes("naver.me") || u.includes("form.naver") || u.includes("office.naver"))
    return "naver_form";
  if (u.includes("moaform")) return "moaform";
  return "other";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
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
  triage: TriageResult;
};

function stratifiedSample<T extends { canonicalUrl: string }>(
  items: T[],
  n: number,
  keyFn: (x: T) => string,
): T[] {
  if (items.length <= n) return [...items];
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const list = buckets.get(k) || [];
    list.push(item);
    buckets.set(k, list);
  }
  // Shuffle each bucket lightly
  for (const list of buckets.values()) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
  }
  const keys = [...buckets.keys()];
  const out: T[] = [];
  const used = new Set<string>();
  let round = 0;
  while (out.length < n && round < 10_000) {
    for (const k of keys) {
      if (out.length >= n) break;
      const list = buckets.get(k)!;
      const next = list.shift();
      if (!next || used.has(next.canonicalUrl)) continue;
      used.add(next.canonicalUrl);
      out.push(next);
    }
    round += 1;
    if (keys.every((k) => (buckets.get(k) || []).length === 0)) break;
  }
  return out;
}

async function main() {
  loadLocalEnvFiles();
  const startedAt = Date.now();
  const catalog = summarizeSearchStrategy("org_v1");
  const maxApiCalls = COLLECTOR_MAX_API_CALLS;
  const deepReserve = Math.max(
    1,
    Math.floor(maxApiCalls * COLLECTOR_DEEP_SEARCH_API_SHARE),
  );
  const queries = selectOrgV1PageOneQueries(maxApiCalls, deepReserve);
  const cycle = ["blog", "cafearticle", "webkr"] as const;

  // Quality review: do not exclude known DB URLs — we need the live A pool.
  let apiCalls = 0;
  let resultsCount = 0;
  const raw: Omit<Cand, "triage">[] = [];
  const seenCanon = new Set<string>();
  const seenSources = new Set<string>();

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
        if (seenSources.has(hit.link)) continue;
        const urls = extractSurveyUrlsFromText(
          hit.link,
          hit.title,
          hit.description,
        );
        for (const rawUrl of urls) {
          if (isShortenerUrl(rawUrl)) continue;
          const norm = normalizeSurveyUrl(rawUrl);
          if (!norm.ok) continue;
          if (!validateSurveyResponseUrl(norm.canonicalUrl).ok) continue;
          if (seenCanon.has(norm.canonicalUrl)) continue;
          seenCanon.add(norm.canonicalUrl);
          raw.push({
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
        seenSources.add(hit.link);
      }
    } catch {
      /* soft fail */
    }
    await sleep(COLLECTOR_SEARCH_DELAY_MS);
  }

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
        if (seenSources.has(hit.link)) continue;
        const urls = extractSurveyUrlsFromText(
          hit.link,
          hit.title,
          hit.description,
        );
        for (const rawUrl of urls) {
          if (isShortenerUrl(rawUrl)) continue;
          const norm = normalizeSurveyUrl(rawUrl);
          if (!norm.ok) continue;
          if (!validateSurveyResponseUrl(norm.canonicalUrl).ok) continue;
          if (seenCanon.has(norm.canonicalUrl)) continue;
          seenCanon.add(norm.canonicalUrl);
          raw.push({
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
        seenSources.add(hit.link);
      }
    } catch {
      /* ignore */
    }
    await sleep(COLLECTOR_SEARCH_DELAY_MS);
  }

  const triaged: Cand[] = raw.map((c) => ({
    ...c,
    triage: triageCandidate({
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      description: c.description,
      surveyTitle: c.sourceTitle,
      searchQuery: c.searchQuery,
      sourceType: c.sourceType as "web" | "blog" | "cafe" | "unknown",
      sourcePublishedAt: c.publishedAt,
      sortMode: c.sortMode,
      firstSeenThisRun: true,
    }),
  }));

  const aAll = triaged.filter((c) => c.triage.queue === "A_PRIORITY");
  const bAll = triaged.filter((c) => c.triage.queue === "B_PRIORITY");
  const caps = getCanaryDailyCaps(true);
  const { cappedAB, counts: canaryCounts } = applyCanaryAbCaps(aAll, bAll, caps);
  const aCapped = cappedAB.filter((c) => c.triage.queue === "A_PRIORITY");
  const bCapped = cappedAB.filter((c) => c.triage.queue === "B_PRIORITY");

  const sampleSize = Math.min(100, Math.max(aCapped.length, 0));
  const aSample = stratifiedSample(aCapped, sampleSize, (x) =>
    platformOf(x.canonicalUrl),
  );

  // Fetch page titles for up to 60 samples (soft)
  const pageTitleBudget = Math.min(60, aSample.length);
  for (let i = 0; i < pageTitleBudget; i += 1) {
    const item = aSample[i]!;
    (item as Cand & { pageTitle?: string | null }).pageTitle =
      await fetchPageTitleSoft(item.canonicalUrl, 4500);
    await sleep(120);
  }

  type Reviewed = Cand & {
    pageTitle?: string | null;
    evidenceLabel: CollectorOrgQualityClass;
    evidence: string[];
    sourceIsPersonalShare: boolean;
    surveyOwnerLikelyOfficial: boolean;
    classifierOrg: CollectorOrgQualityClass;
  };

  const reviewed: Reviewed[] = aSample.map((c) => {
    const withPage = c as Cand & { pageTitle?: string | null };
    const ev = evidenceReviewLabel({
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      snippet: c.description,
      surveyTitle: c.sourceTitle,
      pageTitle: withPage.pageTitle,
      searchQuery: c.searchQuery,
    });
    return {
      ...c,
      pageTitle: withPage.pageTitle ?? null,
      evidenceLabel: ev.label,
      evidence: ev.evidence,
      sourceIsPersonalShare: ev.sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: ev.surveyOwnerLikelyOfficial,
      classifierOrg: c.triage.organization,
    };
  });

  const countLabel = (label: CollectorOrgQualityClass) =>
    reviewed.filter((r) => r.evidenceLabel === label).length;
  const n = reviewed.length || 1;
  const publicN = countLabel("public");
  const companyN = countLabel("company");
  const uniN = countLabel("university_official");
  const academicN = countLabel("individual_or_academic");
  const unknownN = countLabel("unknown");
  const officialN = publicN + companyN + uniN;

  const misclassified = reviewed.filter(
    (r) =>
      r.evidenceLabel === "individual_or_academic" ||
      r.evidenceLabel === "unknown" ||
      (["public", "company", "university_official"].includes(r.classifierOrg) &&
        r.evidenceLabel !== r.classifierOrg &&
        r.evidenceLabel !== "unknown"),
  );

  // Company 30 sample from ALL company-classified candidates (pre-cap)
  const companyPool = triaged.filter((c) => c.triage.organization === "company");
  const companySample = stratifiedSample(
    companyPool,
    Math.min(30, companyPool.length),
    (x) => platformOf(x.canonicalUrl),
  );
  const companyReviewed = companySample.map((c) => {
    const ev = evidenceReviewLabel({
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      snippet: c.description,
      surveyTitle: c.sourceTitle,
      searchQuery: c.searchQuery,
    });
    return {
      canonicalUrl: c.canonicalUrl,
      sourceUrl: c.sourceUrl,
      sourceHost: hostOf(c.sourceUrl),
      sourceTitle: c.sourceTitle,
      snippet: c.description.slice(0, 180),
      evidenceLabel: ev.label,
      evidence: ev.evidence,
      sourceIsPersonalShare: ev.sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: ev.surveyOwnerLikelyOfficial,
      activityHints: {
        brandEvent: /이벤트|경품|응모/.test(c.sourceTitle + c.description),
        csat: /만족도|고객\s*만족/.test(c.sourceTitle + c.description),
        consult: /상담\s*신청/.test(c.sourceTitle + c.description),
        service: /서비스\s*신청|체험\s*신청|회원\s*대상/.test(
          c.sourceTitle + c.description,
        ),
      },
    };
  });
  const companyOfficialOk = companyReviewed.filter(
    (c) =>
      c.evidenceLabel === "company" ||
      (c.sourceIsPersonalShare && c.surveyOwnerLikelyOfficial),
  ).length;

  const recencyInA: Record<string, number> = {
    recent_high: 0,
    recent_possible: 0,
    unknown: 0,
    likely_old: 0,
  };
  for (const a of aCapped) {
    recencyInA[a.triage.recency] = (recencyInA[a.triage.recency] || 0) + 1;
  }

  const academicPatterns = reviewed
    .filter((r) => r.evidenceLabel === "individual_or_academic")
    .map((r) => ({
      title: r.sourceTitle,
      evidence: r.evidence,
      url: r.canonicalUrl,
    }));

  const report = {
    mode: "independent A_PRIORITY review (evidence, not classifier GT)",
    catalog,
    resultsCount,
    apiCalls,
    candidateCount: raw.length,
    canaryCaps: caps,
    canaryPolicy: COLLECTOR_CANARY,
    queueCanary: canaryCounts,
    aPriorityCount: aCapped.length,
    bPriorityCount: bCapped.length,
    aSampleN: reviewed.length,
    aEvidenceDistribution: {
      public: publicN,
      company: companyN,
      university_official: uniN,
      individual_or_academic: academicN,
      unknown: unknownN,
    },
    aOfficialPct: Number(((officialN / n) * 100).toFixed(1)),
    aAcademicPct: Number(((academicN / n) * 100).toFixed(1)),
    aUnknownPct: Number(((unknownN / n) * 100).toFixed(1)),
    gates: {
      officialGe90: (officialN / n) * 100 >= 90,
      academicLe3: (academicN / n) * 100 <= 3,
      unknownLe7: (unknownN / n) * 100 <= 7,
    },
    misclassifiedExamples: misclassified.slice(0, 15).map((r) => ({
      classifierOrg: r.classifierOrg,
      evidenceLabel: r.evidenceLabel,
      evidence: r.evidence,
      sourceHost: hostOf(r.sourceUrl),
      sourceTitle: r.sourceTitle,
      pageTitle: r.pageTitle,
      snippet: r.description.slice(0, 160),
      canonicalUrl: r.canonicalUrl,
    })),
    academicInA: academicPatterns,
    companySampleN: companyReviewed.length,
    companyOfficialOk,
    companyOfficialOkPct:
      companyReviewed.length > 0
        ? Number(
            ((companyOfficialOk / companyReviewed.length) * 100).toFixed(1),
          )
        : null,
    companyPersonalShareOwnerOk: companyReviewed.filter(
      (c) => c.sourceIsPersonalShare && c.surveyOwnerLikelyOfficial,
    ).length,
    companySamples: companyReviewed.slice(0, 30),
    aRecencyDistribution: recencyInA,
    canaryDailyExpected: {
      aValidateMax: caps.maxA,
      bValidateMax: caps.maxB,
      cAutoValidate: 0,
      backlogInflow: caps.maxAb,
      backlogBatches: COLLECTOR_CANARY.proposedBacklogBatches,
      dailyBacklogCapacity: COLLECTOR_CANARY.dailyBacklogCapacity,
      netDeltaExpected: 0,
    },
    kpiPrimary: [
      "daily_search_results",
      "new_candidates",
      "new_a_priority",
      "new_b_priority",
      "new_c_archive",
      "a_official_confirm_rate",
      "a_academic_false_inflow_rate",
      "new_public_cases",
      "new_company_cases",
      "new_university_official_cases",
      "recency_high_possible_ratio",
      "backlog_net_delta",
    ],
    elapsedMs: Date.now() - startedAt,
    reviewedSamples: reviewed.map((r) => ({
      evidenceLabel: r.evidenceLabel,
      classifierOrg: r.classifierOrg,
      evidence: r.evidence,
      platform: platformOf(r.canonicalUrl),
      sourceHost: hostOf(r.sourceUrl),
      sourceTitle: r.sourceTitle,
      pageTitle: r.pageTitle,
      recency: r.triage.recency,
      canonicalUrl: r.canonicalUrl,
    })),
  };

  const path = resolve(process.cwd(), "scripts/tmp-a-priority-review.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        aSampleN: report.aSampleN,
        aOfficialPct: report.aOfficialPct,
        aAcademicPct: report.aAcademicPct,
        aUnknownPct: report.aUnknownPct,
        distribution: report.aEvidenceDistribution,
        gates: report.gates,
        companySampleN: report.companySampleN,
        companyOfficialOkPct: report.companyOfficialOkPct,
        aRecency: report.aRecencyDistribution,
        canary: report.canaryDailyExpected,
        elapsedMs: report.elapsedMs,
        wrote: path,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
