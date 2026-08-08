/**
 * Run collector diagnosis dispatch (dry-run or enqueue).
 * Usage:
 *   npx tsx scripts/run-collector-diagnosis-dispatch.ts --dry-run --limit=20
 *   npx tsx scripts/run-collector-diagnosis-dispatch.ts --enqueue --limit=10 --inline
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchCollectorDiagnoses } from "../lib/collector/diagnosisBridge";

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

function parseArgs(argv: string[]) {
  let dryRun = false;
  let enqueue = false;
  let limit = 10;
  let processInline = false;
  let outFile: string | null = null;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--enqueue") enqueue = true;
    else if (arg === "--inline") processInline = true;
    else if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
    } else if (arg.startsWith("--out=")) {
      outFile = arg.slice("--out=".length);
    }
  }
  if (dryRun === enqueue) {
    throw new Error("Specify exactly one of --dry-run or --enqueue");
  }
  return { dryRun, limit, processInline, outFile };
}

async function main() {
  loadLocalEnvFiles();
  const { dryRun, limit, processInline, outFile } = parseArgs(
    process.argv.slice(2),
  );
  const result = await dispatchCollectorDiagnoses({
    dryRun,
    limit,
    processInline: dryRun ? false : processInline,
  });

  const quality = {
    allAPriority: result.outcomes.every((o) => o.queue === "A_PRIORITY"),
    noCArchive: result.outcomes.every((o) => o.queue !== "C_ARCHIVE"),
    noIndividualOrAcademic: result.outcomes.every(
      (o) => o.organization !== "individual_or_academic",
    ),
    orgKeys: Object.keys(result.organizationDistribution),
    wouldEnqueueUrls: result.outcomes
      .filter((o) => o.outcome === "would_enqueue" || o.outcome === "queued")
      .map((o) => ({
        surveyLinkId: o.surveyLinkId,
        url: o.canonicalUrl,
        platform: o.platform,
        organization: o.organization,
        recency: o.recency,
        diagnosisJobId: o.diagnosisJobId ?? null,
      })),
  };

  const payload = { ...result, quality };
  const text = JSON.stringify(payload, null, 2);
  console.log(text);
  if (outFile) {
    writeFileSync(resolve(process.cwd(), outFile), text, "utf8");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
