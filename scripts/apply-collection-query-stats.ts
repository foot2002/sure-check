/**
 * Probe / instruct applying migration 006 (collection_query_stats).
 * Cannot create tables via PostgREST — run SQL in Supabase SQL Editor.
 *
 * Usage: npx tsx scripts/apply-collection-query-stats.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("collection_query_stats")
    .select("id")
    .limit(1);

  if (error) {
    console.log(
      JSON.stringify(
        {
          migration006Applied: false,
          probeError: error.message,
          action:
            "Supabase SQL Editor에서 db/migrations/006_collection_query_stats.sql 전체 실행 필요",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  console.log(
    JSON.stringify({ migration006Applied: true, table: "collection_query_stats" }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
