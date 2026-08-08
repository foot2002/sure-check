/**
 * Probe migration 008 (survey_diagnosis_links status taxonomy).
 * Usage: npx tsx scripts/apply-survey-diagnosis-link-statuses.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("supabase env missing");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { error: colErr } = await sb
    .from("survey_diagnosis_links")
    .select("id, status, extractor_key")
    .limit(1);
  if (colErr) {
    console.log(
      JSON.stringify(
        {
          migration008Applied: false,
          probeError: colErr.message,
          action:
            "Supabase SQL Editor에서 db/migrations/008_survey_diagnosis_link_statuses.sql 전체 실행 필요",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  // Probe new status values are accepted (dry: no write if already has limited/failed_retryable)
  const { count: limitedCount, error: limErr } = await sb
    .from("survey_diagnosis_links")
    .select("id", { count: "exact", head: true })
    .eq("status", "limited");
  const { count: legacyFailed, error: failErr } = await sb
    .from("survey_diagnosis_links")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed");

  console.log(
    JSON.stringify(
      {
        migration008Applied: true,
        limitedCount: limErr ? null : limitedCount,
        legacyFailedRemaining: failErr ? null : legacyFailed,
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
