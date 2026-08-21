/**
 * Backfill official_institution_sites seed quality.
 *
 * Dry-run by default. Apply with --apply.
 *
 *   npx tsx scripts/backfill-official-site-seed-quality.ts
 *   npx tsx scripts/backfill-official-site-seed-quality.ts --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  officialSiteHostname,
  partitionSeedUrlsByHomepageOrigin,
} from "../lib/collector/officialSiteOrigin";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function asUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

type SiteRow = {
  id: string;
  organization_name: string;
  homepage_url: string;
  seed_urls: unknown;
  seed_review_status: string | null;
  seed_review_reason: string | null;
};

type PlannedPatch = {
  id: string;
  organizationName: string;
  homepage: string;
  homepage_host: string | null;
  seed_urls: string[];
  rejected_seed_urls: string[];
  seed_review_status: "ok" | "needs_review" | "excluded";
  seed_review_reason: string | null;
  reason: string;
};

async function loadAllSites(
  supabase: ReturnType<typeof createClient>,
): Promise<SiteRow[]> {
  const rows: SiteRow[] = [];
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("official_institution_sites")
      .select(
        "id, organization_name, homepage_url, seed_urls, seed_review_status, seed_review_reason",
      )
      .order("organization_name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data || []) as SiteRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function planRow(row: SiteRow): PlannedPatch {
  const homepage = row.homepage_url || "";
  const host = officialSiteHostname(homepage);
  const partitioned = partitionSeedUrlsByHomepageOrigin(homepage, asUrls(row.seed_urls));
  if (!host) {
    return {
      id: row.id,
      organizationName: row.organization_name,
      homepage,
      homepage_host: null,
      seed_urls: [],
      rejected_seed_urls: partitioned.rejectedSeedUrls,
      seed_review_status: "excluded",
      seed_review_reason: "invalid_homepage",
      reason: "invalid_homepage",
    };
  }
  const allRejected =
    partitioned.rejectedSeedUrls.length > 0 &&
    partitioned.validSeedUrls.length === 0;
  if (allRejected) {
    return {
      id: row.id,
      organizationName: row.organization_name,
      homepage,
      homepage_host: host,
      seed_urls: [],
      rejected_seed_urls: partitioned.rejectedSeedUrls,
      seed_review_status: "excluded",
      seed_review_reason: "cross_origin_seed_url",
      reason: "cross_origin_seed_url",
    };
  }
  if (partitioned.rejectedSeedUrls.length > 0) {
    return {
      id: row.id,
      organizationName: row.organization_name,
      homepage,
      homepage_host: host,
      seed_urls: partitioned.validSeedUrls,
      rejected_seed_urls: partitioned.rejectedSeedUrls,
      seed_review_status: "needs_review",
      seed_review_reason: "cross_origin_seed_url",
      reason: "cross_origin_seed_url",
    };
  }
  const keepStatus =
    row.seed_review_status === "needs_review" || row.seed_review_status === "excluded"
      ? row.seed_review_status
      : "ok";
  return {
    id: row.id,
    organizationName: row.organization_name,
    homepage,
    homepage_host: host,
    seed_urls: partitioned.validSeedUrls,
    rejected_seed_urls: [],
    seed_review_status: keepStatus,
    seed_review_reason: keepStatus === "ok" ? null : row.seed_review_reason,
    reason: keepStatus === "ok" ? "ok" : row.seed_review_reason || "ok",
  };
}

function changed(row: SiteRow, patch: PlannedPatch): boolean {
  const currentUrls = asUrls(row.seed_urls);
  const sameUrls =
    currentUrls.length === patch.seed_urls.length &&
    currentUrls.every((url, i) => url === patch.seed_urls[i]);
  return (
    !sameUrls ||
    patch.seed_review_status !== (row.seed_review_status || "ok") ||
    patch.seed_review_reason !== (row.seed_review_reason || null) ||
    patch.rejected_seed_urls.length > 0
  );
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rows = await loadAllSites(supabase);
  const planned = rows.map(planRow);
  const dirty = planned.filter((patch, i) => changed(rows[i]!, patch));
  const needsReview = planned.filter((row) => row.seed_review_status === "needs_review");
  const excluded = planned.filter((row) => row.seed_review_status === "excluded");
  const rejectedCount = planned.reduce((n, row) => n + row.rejected_seed_urls.length, 0);
  const allRejected = planned.filter(
    (row) => row.rejected_seed_urls.length > 0 && row.seed_urls.length === 0,
  );
  const samples = dirty
    .filter((row) => row.rejected_seed_urls.length > 0)
    .slice(0, 8)
    .map((row) => ({
      organizationName: row.organizationName,
      homepage: row.homepage,
      rejected: row.rejected_seed_urls.slice(0, 6),
      reason: row.reason,
    }));

  if (apply) {
    for (let i = 0; i < dirty.length; i += 40) {
      const slice = dirty.slice(i, i + 40);
      for (const patch of slice) {
        const { error } = await supabase
          .from("official_institution_sites")
          .update({
            homepage_host: patch.homepage_host,
            seed_urls: patch.seed_urls,
            rejected_seed_urls: patch.rejected_seed_urls,
            seed_review_status: patch.seed_review_status,
            seed_review_reason: patch.seed_review_reason,
            last_error:
              patch.seed_review_status === "ok"
                ? null
                : patch.seed_review_reason,
          })
          .eq("id", patch.id);
        if (error) {
          if (/rejected_seed_urls|homepage_host|seed_review_status/i.test(error.message)) {
            console.warn(
              "[seed-quality] missing columns — apply db/migrations/014_official_site_seed_quality.sql",
            );
            const retry = await supabase
              .from("official_institution_sites")
              .update({
                seed_urls: patch.seed_urls,
                seed_review_status: patch.seed_review_status,
                seed_review_reason: patch.seed_review_reason,
              })
              .eq("id", patch.id);
            if (retry.error) throw new Error(retry.error.message);
            continue;
          }
          throw new Error(error.message);
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry_run",
        checked: rows.length,
        updated: apply ? dirty.length : 0,
        wouldUpdate: dirty.length,
        needs_review: needsReview.length,
        excluded: excluded.length,
        cross_origin_seed_urls: rejectedCount,
        all_seed_urls_rejected: allRejected.length,
        samples,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
