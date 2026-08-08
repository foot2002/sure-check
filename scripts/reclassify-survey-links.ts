/**
 * Reclassify existing survey_links: mark invalid, refresh titles for valid ones.
 * Does not delete rows. Never prints secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { processSurveyCandidate } from "../lib/collector/processCandidate";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { titleOrNeedsConfirmation } from "../lib/collector/titleUtils";

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
  const { data, error } = await supabase
    .from("survey_links")
    .select("*")
    .order("first_discovered_at", { ascending: true });
  if (error) throw new Error(error.message);

  const results: Array<Record<string, unknown>> = [];
  for (const row of data || []) {
    const processed = await processSurveyCandidate({
      rawUrl: String(row.canonical_url),
      searchTitle: row.title,
    });

    let nextStatus = row.status as string;
    let nextTitle = row.title as string | null;
    let classification = "unresolved";
    let reason = "";

    if (processed.ok) {
      nextStatus = processed.status;
      nextTitle = processed.title;
      classification =
        processed.verdict === "confirmed_survey" ? "valid_survey" : "unresolved";
      reason = processed.reason;
    } else if (processed.stage === "format" || processed.verdict === "not_survey") {
      nextStatus = "invalid";
      nextTitle = titleOrNeedsConfirmation(
        processed.title,
        row.title !== row.canonical_url ? String(row.title) : null,
      );
      classification = "invalid_non_survey";
      reason = processed.reason;
    } else {
      nextStatus = "discovered";
      classification = "unresolved";
      reason = processed.reason;
    }

    const { error: updateError } = await supabase
      .from("survey_links")
      .update({
        status: nextStatus,
        title: nextTitle,
      })
      .eq("id", row.id);

    results.push({
      url: row.canonical_url,
      beforeStatus: row.status,
      afterStatus: nextStatus,
      classification,
      reason,
      titleUpdated: nextTitle !== row.title,
      updateOk: !updateError,
      updateError: updateError?.message || null,
    });
  }

  console.log(JSON.stringify({ count: results.length, results }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
