/**
 * Verify scan/capture queue columns and claim RPCs from migrations 002/003.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAPTURE_JOB_QUEUE_COLUMNS,
  QUEUE_RPC_FUNCTIONS,
  SCAN_JOB_QUEUE_COLUMNS,
  checkQueueSchema,
} from "@/lib/jobs/queueSchema";

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

async function main(): Promise<void> {
  loadLocalEnvFiles();
  console.log("[Queue Schema Check]\n");

  const report = await checkQueueSchema({ bypassCache: true });

  console.log("scan_jobs queue columns:");
  for (const col of SCAN_JOB_QUEUE_COLUMNS) {
    console.log(`- ${col}: ${report.scanJobColumns[col] ? "OK" : "MISSING"}`);
  }

  console.log("\ncapture_jobs queue columns:");
  for (const col of CAPTURE_JOB_QUEUE_COLUMNS) {
    console.log(
      `- ${col}: ${report.captureJobColumns[col] ? "OK" : "MISSING"}`,
    );
  }

  console.log("\nRPC functions:");
  for (const name of QUEUE_RPC_FUNCTIONS) {
    console.log(`- ${name}: ${report.rpcFunctions[name] ? "OK" : "MISSING"}`);
  }

  if (!report.ok) {
    console.log("\nmissing:");
    for (const m of report.missing) console.log(`- ${m}`);
    console.log("\nresult: FAIL");
    console.log(
      "Apply db/migrations/002_scan_job_queue.sql and 003_scan_extraction_metadata.sql in Supabase.",
    );
    process.exit(1);
  }

  console.log("\nresult: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
