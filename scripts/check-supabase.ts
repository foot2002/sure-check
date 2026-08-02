import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getSupabaseServiceRoleKeyStatus,
  getSupabaseUrlStatus,
} from "@/lib/supabase/server";
import {
  assertEvidenceBucketAccessible,
  deleteEvidenceObject,
  getEvidenceBucketName,
  uploadEvidenceObject,
} from "@/lib/storage/evidenceStorage";

/** Load `.env.local` / `.env` into process.env when running via tsx (not Next). */
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

  console.log("[Supabase Check]");

  const urlStatus = getSupabaseUrlStatus();
  const keyStatus = getSupabaseServiceRoleKeyStatus();
  const bucket = getEvidenceBucketName();

  console.log(`SUPABASE_URL: ${urlStatus}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${keyStatus}`);
  console.log(`SUPABASE_EVIDENCE_BUCKET: ${bucket}`);

  if (urlStatus !== "OK" || keyStatus !== "OK") {
    console.log("Bucket access: SKIP");
    console.log("Test upload: SKIP");
    console.log("Test delete: SKIP");
    console.log("Result: FAIL");
    process.exit(1);
  }

  try {
    await assertEvidenceBucketAccessible();
    console.log("Bucket access: OK");
  } catch (error) {
    console.log("Bucket access: FAIL");
    console.error(error instanceof Error ? error.message : error);
    console.log("Test upload: SKIP");
    console.log("Test delete: SKIP");
    console.log("Result: FAIL");
    process.exit(1);
  }

  const testPath = `_healthcheck/sure-check-${Date.now()}.txt`;
  const payload = `sure-check supabase healthcheck ${new Date().toISOString()}\n`;

  try {
    await uploadEvidenceObject(testPath, payload, "text/plain; charset=utf-8");
    console.log("Test upload: OK");
  } catch (error) {
    console.log("Test upload: FAIL");
    console.error(error instanceof Error ? error.message : error);
    console.log("Test delete: SKIP");
    console.log("Result: FAIL");
    process.exit(1);
  }

  try {
    await deleteEvidenceObject(testPath);
    console.log("Test delete: OK");
  } catch (error) {
    console.log("Test delete: FAIL");
    console.error(error instanceof Error ? error.message : error);
    console.log("Result: FAIL");
    process.exit(1);
  }

  console.log("Result: PASS");
}

main().catch((error) => {
  console.error("[Supabase Check] unexpected error:", error);
  console.log("Result: FAIL");
  process.exit(1);
});
