/**
 * Rule-assisted review of ≥100 survey samples (source_title/url/title).
 * Labels are NOT claimed accuracy — method=rule_assisted_source_review.
 *
 * Usage: npx tsx scripts/sample-org-quality-100.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewOrgSample } from "../lib/collector/orgSampleReview";
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

async function main() {
  loadLocalEnvFiles();
  const sb = createSupabaseServerClient();

  // Prefer recently discovered / newly inserted links
  const { data: links } = await sb
    .from("survey_links")
    .select("id, canonical_url, title, platform, status, first_discovered_at")
    .order("first_discovered_at", { ascending: false })
    .limit(250);

  const ids = (links || []).map((l) => l.id);
  const { data: sources } = await sb
    .from("survey_sources")
    .select("survey_link_id, source_url, source_title, search_query")
    .in("survey_link_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .limit(800);

  const byLink = new Map<
    string,
    { source_url?: string; source_title?: string; search_query?: string }
  >();
  for (const s of sources || []) {
    if (!byLink.has(String(s.survey_link_id))) {
      byLink.set(String(s.survey_link_id), {
        source_url: s.source_url || undefined,
        source_title: s.source_title || undefined,
        search_query: s.search_query || undefined,
      });
    }
  }

  const reviewed = [];
  const counts: Record<string, number> = {
    public: 0,
    company: 0,
    university_official: 0,
    individual_or_academic: 0,
    unknown: 0,
  };

  for (const link of links || []) {
    if (reviewed.length >= 100) break;
    const src = byLink.get(link.id) || {};
    const review = reviewOrgSample({
      surveyTitle: link.title,
      sourceTitle: src.source_title,
      sourceUrl: src.source_url,
      searchQuery: src.search_query,
      canonicalUrl: link.canonical_url,
    });
    counts[review.label] = (counts[review.label] || 0) + 1;
    reviewed.push({
      id: link.id,
      platform: link.platform,
      status: link.status,
      surveyTitle: link.title,
      sourceTitle: src.source_title || null,
      sourceUrl: src.source_url || null,
      searchQuery: src.search_query || null,
      label: review.label,
      signals: review.signals,
      method: review.method,
    });
  }

  const n = reviewed.length || 1;
  const ratios = Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [
      k,
      Number(((v / n) * 100).toFixed(1)),
    ]),
  );
  const official =
    counts.public + counts.company + counts.university_official;

  const report = {
    disclaimer:
      "규칙 기반 표본 검토(source_url/title). 정밀도/정확도 측정이 아님.",
    sampleSize: reviewed.length,
    counts,
    ratiosPct: ratios,
    officialCombined: {
      count: official,
      pct: Number(((official / n) * 100).toFixed(1)),
    },
    individualOrAcademic: {
      count: counts.individual_or_academic,
      pct: ratios.individual_or_academic,
    },
    targets: {
      academicMaxPct: 5,
      officialMinPct: 60,
      academicOk: ratios.individual_or_academic <= 5,
      officialOk: (official / n) * 100 >= 60,
    },
    samples: reviewed,
  };

  const out = resolve(process.cwd(), "scripts/tmp-org-sample-100.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        disclaimer: report.disclaimer,
        sampleSize: report.sampleSize,
        counts: report.counts,
        ratiosPct: report.ratiosPct,
        officialCombined: report.officialCombined,
        individualOrAcademic: report.individualOrAcademic,
        targets: report.targets,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
