/**
 * Fast-track Production canary verification helpers + runbook printout.
 *
 * Does NOT change Production env or deploy by itself.
 *
 * Usage:
 *   npx tsx scripts/fast-track-canary-prep.ts
 *   npx tsx scripts/fast-track-canary-prep.ts --invoke-collect   # needs PROD URL + secret
 *   npx tsx scripts/fast-track-canary-prep.ts --invoke-revalidate --mode discovered
 *
 * Env (local only, never commit):
 *   COLLECTOR_PROD_BASE_URL=https://sure-check.vercel.app
 *   COLLECTOR_CRON_SECRET=...   (or CRON_SECRET)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COLLECTOR_CANARY,
  getCanaryDailyCaps,
  isCollectorCanaryEnabled,
} from "../lib/collector/canaryPolicy";
import { resolveCollectorSearchStrategy } from "../lib/collector/searchQueries";
import { COLLECTOR_DISCOVERED_BATCH_SIZE } from "../lib/collector/opsPolicy";

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

function aliasMatrix() {
  const samples = [
    undefined,
    "",
    "legacy",
    "org_v1",
    "org_v1.2",
    "org_v1_2",
    "org_v1.1",
    "org_v1_1",
    "org-v1",
    "v2",
    "unknown_value",
  ];
  const out: Record<string, string> = {};
  for (const s of samples) {
    const prev = process.env.COLLECTOR_SEARCH_STRATEGY;
    if (s === undefined) delete process.env.COLLECTOR_SEARCH_STRATEGY;
    else process.env.COLLECTOR_SEARCH_STRATEGY = s;
    out[s === undefined ? "(unset)" : s === "" ? "(empty)" : s] =
      resolveCollectorSearchStrategy();
    if (prev === undefined) delete process.env.COLLECTOR_SEARCH_STRATEGY;
    else process.env.COLLECTOR_SEARCH_STRATEGY = prev;
  }
  return out;
}

async function invoke(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ httpStatus: number; json: unknown; elapsedMs: number }> {
  const base =
    process.env.COLLECTOR_PROD_BASE_URL?.replace(/\/$/, "") ||
    "https://sure-check.vercel.app";
  const secret =
    process.env.COLLECTOR_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("COLLECTOR_CRON_SECRET or CRON_SECRET required to invoke");
  }
  const started = Date.now();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { httpStatus: res.status, json, elapsedMs: Date.now() - started };
}

async function main() {
  loadLocalEnvFiles();
  const args = new Set(process.argv.slice(2));

  const prep = {
    mode: "fast_track_prep",
    codeFacts: {
      strategyEnvAliasesThatEnableOrgV12Path: [
        "org_v1",
        "org_v1.2",
        "org_v1_2",
        "org_v1.1",
        "org_v1_1",
        "org-v1",
        "v2",
      ],
      internalStrategyValue: "org_v1",
      collectionPath: "runOrgV11Collection (org_v1.2 triage A/B/C)",
      defaultWhenUnset: "legacy",
      aliasResolution: aliasMatrix(),
      canaryEnv: {
        var: "COLLECTOR_CANARY",
        enablesOn: ["1", "true", "yes"],
        currentlyEnabledLocally: isCollectorCanaryEnabled(),
        capsWhenEnabled: getCanaryDailyCaps(true),
        capsWhenDisabled: getCanaryDailyCaps(false),
        policy: COLLECTOR_CANARY,
      },
      cArchiveAutoPageValidate: false,
      recencyValidationOrder: [
        "recent_high",
        "recent_possible",
        "unknown",
        "likely_old",
      ],
      discoveredBatchSize: COLLECTOR_DISCOVERED_BATCH_SIZE,
      vercelMaxDurationSec: 120,
      cronUnchanged: {
        collect: "0 21 * * * UTC = 06:00 KST",
        revalidate: "0 3 * * * UTC = 12:00 KST",
      },
    },
    productionEnvToSet: {
      COLLECTOR_SEARCH_STRATEGY: "org_v1.2",
      COLLECTOR_CANARY: "1",
    },
    rollbackEnv: {
      COLLECTOR_SEARCH_STRATEGY: "legacy",
      COLLECTOR_CANARY: "0",
      note: "Or delete both variables. Cron paths stay the same.",
    },
    deployThenManualVerify: [
      "1. Commit + push org_v1.2 canary code to Production",
      "2. Vercel Production env: set COLLECTOR_SEARCH_STRATEGY=org_v1.2 and COLLECTOR_CANARY=1; Redeploy",
      "3. POST /api/internal/collector/run (Bearer CRON_SECRET) once",
      "4. Check HTTP 200, collection_runs completed, errors=0, no stuck running",
      "5. POST /api/internal/collector/revalidate mode=discovered up to 3× (~50 each), spaced",
      "6. Spot-check 30 new A_PRIORITY (official≥90%, academic≤3%)",
      "7. Decide A/B/C: full ops / keep org_v1.2 with cap tweak / rollback legacy",
    ],
    invokeEndpoints: {
      collect: "POST /api/internal/collector/run",
      revalidateDiscovered:
        'POST /api/internal/collector/revalidate  body: {"mode":"discovered"}',
    },
  };

  const outPath = resolve(process.cwd(), "scripts/tmp-fast-track-prep.json");
  writeFileSync(outPath, JSON.stringify(prep, null, 2), "utf8");
  console.log(JSON.stringify(prep, null, 2));
  console.log(`wrote ${outPath}`);

  if (args.has("--invoke-collect")) {
    console.log("\n--- invoking collect ---");
    const result = await invoke("/api/internal/collector/run");
    const collectPath = resolve(
      process.cwd(),
      "scripts/tmp-fast-track-collect.json",
    );
    writeFileSync(collectPath, JSON.stringify(result, null, 2), "utf8");
    console.log(JSON.stringify(result, null, 2));
    console.log(`wrote ${collectPath}`);
  }

  if (args.has("--invoke-revalidate")) {
    console.log("\n--- invoking revalidate discovered ---");
    const result = await invoke("/api/internal/collector/revalidate", {
      mode: "discovered",
    });
    const rvPath = resolve(
      process.cwd(),
      "scripts/tmp-fast-track-revalidate.json",
    );
    writeFileSync(rvPath, JSON.stringify(result, null, 2), "utf8");
    console.log(JSON.stringify(result, null, 2));
    console.log(`wrote ${rvPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
