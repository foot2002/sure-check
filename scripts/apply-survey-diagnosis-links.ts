/**
 * Probe migration 007 (survey_diagnosis_links).
 * Usage: npx tsx scripts/apply-survey-diagnosis-links.ts
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
  const { error } = await sb.from("survey_diagnosis_links").select("id").limit(1);
  if (error) {
    console.log(
      JSON.stringify(
        {
          migration007Applied: false,
          probeError: error.message,
          action:
            "Supabase SQL Editor에서 db/migrations/007_survey_diagnosis_links.sql 전체 실행 필요",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }
  console.log(
    JSON.stringify(
      { migration007Applied: true, table: "survey_diagnosis_links" },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
