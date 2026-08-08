/**
 * Apply status taxonomy changes that require migration 005.
 * Attempts closedform reclassification; fails clearly if CHECK not updated.
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

  // Probe new status value
  const probeId = crypto.randomUUID();
  const { error: probeError } = await supabase.from("survey_links").insert({
    id: probeId,
    canonical_url: `https://moaform.com/q/status-probe-${Date.now()}`,
    original_url: `https://moaform.com/q/status-probe-${Date.now()}`,
    platform: "moaform",
    title: "status probe",
    status: "closed",
  });

  if (probeError) {
    console.log(
      JSON.stringify(
        {
          migration005Applied: false,
          probeError: probeError.message,
          action:
            "Supabase SQL Editor에서 db/migrations/005_survey_link_status_taxonomy.sql 실행 필요",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  await supabase.from("survey_links").delete().eq("id", probeId);

  const { data: rows } = await supabase
    .from("survey_links")
    .select("id, canonical_url, status")
    .or("canonical_url.ilike.%closedform%,original_url.ilike.%closedform%");

  let updated = 0;
  for (const row of rows || []) {
    if (row.status === "closed") continue;
    const { error } = await supabase
      .from("survey_links")
      .update({ status: "closed" })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    updated += 1;
  }

  // Ensure help/api/answer root remain invalid
  const keepInvalid = [
    "%help.moaform.com%",
    "%api.moaform.com%",
  ];
  for (const pattern of keepInvalid) {
    await supabase
      .from("survey_links")
      .update({ status: "invalid" })
      .ilike("canonical_url", pattern)
      .neq("status", "invalid");
  }
  await supabase
    .from("survey_links")
    .update({ status: "invalid" })
    .in("canonical_url", [
      "https://answer.moaform.com/",
      "https://answer.moaform.com",
    ]);

  console.log(
    JSON.stringify(
      {
        migration005Applied: true,
        closedformUpdated: updated,
        closedformCandidates: (rows || []).length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
