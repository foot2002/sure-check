/**
 * Revalidate discovered + unreachable only (no Naver search).
 * Usage: npx tsx scripts/test-collector-revalidate.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCollectorStorageConfigured } from "../lib/collector/config";
import { revalidatePendingSurveyLinks } from "../lib/collector/revalidatePending";

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
  if (!isCollectorStorageConfigured()) {
    console.error("Supabase not configured");
    process.exit(1);
  }

  console.log("=== revalidate discovered + unreachable ===");
  const result = await revalidatePendingSurveyLinks({
    statuses: ["discovered", "unreachable"],
    concurrency: 3,
    delayMs: 300,
    maxRetries: 2,
    limit: 500,
  });

  const toActive = result.transitions.filter((t) => t.to === "active").length;
  const toClosed = result.transitions.filter((t) => t.to === "closed").length;
  const toRestricted = result.transitions.filter(
    (t) => t.to === "restricted",
  ).length;
  const toInvalid = result.transitions.filter((t) => t.to === "invalid").length;
  const toUnreachable = result.transitions.filter(
    (t) => t.to === "unreachable",
  ).length;
  const toDiscovered = result.transitions.filter(
    (t) => t.to === "discovered",
  ).length;

  const report = {
    ...result,
    transitionCounts: {
      toActive,
      toClosed,
      toRestricted,
      toInvalid,
      toUnreachable,
      toDiscovered,
      totalChanged: result.transitions.length,
    },
    // Truncate transition detail for file size
    transitionSample: result.transitions.slice(0, 40),
    transitions: undefined,
  };

  const out = resolve(process.cwd(), "scripts/tmp-revalidate-report.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
