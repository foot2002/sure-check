/**
 * Generate and publish the latest KST weekly report snapshots.
 * Requires db/migrations/015_weekly_reports.sql to be applied.
 *
 * Usage: npx tsx scripts/generate-weekly-reports.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { generateRecentWeeklySnapshots } from "../lib/weekly/generateWeeklyReport";
import { upsertWeeklyReport } from "../lib/weekly/repository";

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

async function tableReady(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("weekly_reports").select("week_id").limit(1);
  if (!error) return null;
  return error.message;
}

async function main() {
  loadLocalEnvFiles();
  const missing = await tableReady();
  const snapshots = await generateRecentWeeklySnapshots(6);
  const preview = snapshots.map((snapshot) => ({
    weekId: snapshot.weekId,
    weekLabel: snapshot.weekLabel,
    analyzableCount: snapshot.metrics.analyzableCount,
    avgScore: snapshot.metrics.avgScore,
    attentionNeededRate: snapshot.metrics.attentionNeededRate,
    caseCount: snapshot.anonymousCases.length,
    isPartial: snapshot.isPartial,
  }));

  if (missing) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          persisted: false,
          migration015Applied: false,
          probeError: missing,
          reportCount: preview.length,
          reports: preview,
          action:
            "Supabase SQL Editor에서 db/migrations/015_weekly_reports.sql 전체를 실행한 뒤 npm run weekly:generate 를 다시 실행하세요.",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }
  const saved = [];
  for (const snapshot of snapshots) {
    const row = await upsertWeeklyReport({ snapshot, status: "published" });
    saved.push({
      weekId: row.weekId,
      weekLabel: row.weekLabel,
      status: row.status,
      analyzableCount: row.snapshot.metrics.analyzableCount,
      avgScore: row.snapshot.metrics.avgScore,
      attentionNeededRate: row.snapshot.metrics.attentionNeededRate,
      caseCount: row.snapshot.anonymousCases.length,
      isPartial: row.snapshot.isPartial,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        reportCount: saved.length,
        reports: saved,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
