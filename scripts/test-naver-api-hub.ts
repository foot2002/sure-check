/**
 * NAVER API HUB connection smoke test (blog / cafe / web).
 * Never prints secret values — only redacted status fields.
 *
 * Usage: npx tsx scripts/test-naver-api-hub.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isCollectorStorageConfigured,
  isNaverSearchConfigured,
} from "../lib/collector/config";
import { extractSurveyUrlsFromText } from "../lib/collector/extractLinks";
import {
  NaverSearchError,
  searchNaverEndpoint,
} from "../lib/collector/naverSearch";
import { normalizeSurveyUrl } from "../lib/collector/urlNormalize";
import {
  insertSurveySource,
  upsertSurveyLink,
} from "../lib/collector/repository";
import { createSupabaseServerClient } from "../lib/supabase/server";

function loadLocalEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
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

function maskPresent(value: string | undefined | null): string {
  if (!value?.trim()) return "missing";
  return `set(len=${value.trim().length})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type EndpointSpec = {
  label: string;
  endpoint: "blog" | "cafearticle" | "webkr";
};

const ENDPOINTS: EndpointSpec[] = [
  { label: "블로그", endpoint: "blog" },
  { label: "카페", endpoint: "cafearticle" },
  { label: "웹문서", endpoint: "webkr" },
];

const QUERY = "forms.gle OR form.naver.com OR moaform.com 설문";
const DISPLAY = 5;

async function probeDbTables(): Promise<{
  ok: boolean;
  detail: string;
}> {
  if (!isCollectorStorageConfigured()) {
    return { ok: false, detail: "SUPABASE_* missing — DB skip" };
  }
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("survey_links")
      .select("id", { count: "exact", head: true });
    if (error) {
      return {
        ok: false,
        detail: `table check failed: ${error.message} (migration 004 applied?)`,
      };
    }
    return { ok: true, detail: "survey_links reachable" };
  } catch (error) {
    return { ok: false, detail: `DB probe error: ${String(error)}` };
  }
}

async function trySaveCandidates(
  hits: Array<{ title: string; description: string; link: string; sourceType: "web" | "blog" | "cafe" | "unknown"; searchQuery: string; publishedAt: string | null }>,
): Promise<{ attempted: number; saved: number; skipped: number; error?: string }> {
  let attempted = 0;
  let saved = 0;
  let skipped = 0;

  for (const hit of hits) {
    const candidates = extractSurveyUrlsFromText(hit.title, hit.description, hit.link);
    for (const raw of candidates) {
      const normalized = normalizeSurveyUrl(raw);
      if (!normalized.ok) {
        skipped += 1;
        continue;
      }
      if (normalized.needsRedirect) {
        skipped += 1;
        continue;
      }
      attempted += 1;
      try {
        const upserted = await upsertSurveyLink({
          canonicalUrl: normalized.canonicalUrl,
          originalUrl: normalized.originalUrl,
          platform: normalized.platform,
          title: hit.title || null,
        });
        await insertSurveySource({
          surveyLinkId: upserted.link.id,
          sourceType: hit.sourceType,
          sourceUrl: hit.link,
          sourceTitle: hit.title,
          searchQuery: hit.searchQuery,
          sourcePublishedAt: hit.publishedAt,
        });
        saved += 1;
      } catch (error) {
        return {
          attempted,
          saved,
          skipped,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return { attempted, saved, skipped };
}

async function main(): Promise<void> {
  loadLocalEnvFiles();

  console.log("=== NAVER API HUB smoke test ===");
  console.log(`base: https://naverapihub.apigw.ntruss.com`);
  console.log(`auth headers: X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY`);
  console.log(`NAVER_CLIENT_ID: ${maskPresent(process.env.NAVER_CLIENT_ID)}`);
  console.log(`NAVER_CLIENT_SECRET: ${maskPresent(process.env.NAVER_CLIENT_SECRET)}`);
  console.log(`COLLECTOR_CRON_SECRET: ${maskPresent(process.env.COLLECTOR_CRON_SECRET)}`);
  console.log(`naver configured: ${isNaverSearchConfigured()}`);
  console.log(`query display<=${DISPLAY}; one call per endpoint\n`);

  if (!isNaverSearchConfigured()) {
    console.error("FAIL: Naver credentials not loaded from .env.local");
    process.exit(1);
  }

  const dbProbe = await probeDbTables();
  console.log(`DB probe: ${dbProbe.ok ? "OK" : "SKIP/FAIL"} — ${dbProbe.detail}\n`);

  for (const spec of ENDPOINTS) {
    console.log(`--- ${spec.label} (${spec.endpoint}) ---`);
    try {
      const result = await searchNaverEndpoint(spec.endpoint, QUERY, {
        display: DISPLAY,
      });
      const candidateUrls = new Set<string>();
      for (const hit of result.hits) {
        for (const u of extractSurveyUrlsFromText(hit.title, hit.description, hit.link)) {
          candidateUrls.add(u);
        }
      }

      console.log(`1. auth: success`);
      console.log(`2. HTTP status: ${result.httpStatus}`);
      console.log(`3. result count: ${result.resultCount}${result.total != null ? ` (total=${result.total})` : ""}`);
      console.log(`4. survey candidates: ${candidateUrls.size}`);

      if (!dbProbe.ok) {
        console.log(`5. DB save: skipped (${dbProbe.detail})`);
      } else if (candidateUrls.size === 0) {
        console.log(`5. DB save: skipped (no survey-link candidates in this sample)`);
      } else {
        const save = await trySaveCandidates(result.hits);
        if (save.error) {
          console.log(
            `5. DB save: failed — attempted=${save.attempted} saved=${save.saved} error=${save.error}`,
          );
        } else {
          console.log(
            `5. DB save: ok — attempted=${save.attempted} saved=${save.saved} skipped_normalize=${save.skipped}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof NaverSearchError) {
        console.log(`1. auth: ${error.kind === "auth" ? "failed" : "n/a"}`);
        console.log(`2. HTTP status: ${error.status ?? "n/a"}`);
        console.log(`3. result count: 0`);
        console.log(`4. survey candidates: 0`);
        console.log(`5. DB save: skipped`);
        console.log(`error kind=${error.kind} message=${error.message}`);
      } else {
        console.log(`unexpected error: ${String(error)}`);
      }
    }
    console.log("");
    await sleep(300);
  }
}

main().catch((error) => {
  console.error("smoke test crashed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
