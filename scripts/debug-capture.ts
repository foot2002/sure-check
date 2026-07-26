/**
 * Debug runner for evidence_full_walkthrough capture.
 * Usage:
 *   npm run capture:debug:google
 *   npm run capture:debug:naver
 *   npm run capture:debug:moaform
 *   npm run capture:debug:all
 *
 * Options:
 *   --headed   run with headless:false
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { runFullWalkthroughOrchestrator } from "../lib/evidence/capture/fullWalkthrough/fullWalkthroughOrchestrator";
import { CaptureDebugSession } from "../lib/evidence/capture/fullWalkthrough/captureTrace";

const CASES = {
  google: {
    folder: "google",
    name: "Google Forms",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSfKXHdxzpD3Ug0D_WK8Q88lqY1Yq3pS7Y61G5MMx0qjljyyHA/viewform?usp=header",
  },
  naver: {
    folder: "naver",
    name: "Naver Form",
    url: "https://form.naver.com/response/G9T30OHRSSboB35bqy6pfg",
  },
  moaform: {
    folder: "moaform",
    name: "Moaform",
    url: "https://answer.moaform.com/answers/Mqy1pw",
  },
} as const;

type CaseKey = keyof typeof CASES;

async function runCase(key: CaseKey, headed: boolean) {
  const c = CASES[key];
  console.log(`\n========== ${c.name} ==========`);
  console.log(c.url);
  const session = new CaptureDebugSession(c.folder);
  const started = Date.now();
  const result = await runFullWalkthroughOrchestrator({
    surveyUrl: c.url,
    finalUrl: c.url,
    debug: session,
    debugFolder: c.folder,
    headless: !headed,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const report = {
    name: c.name,
    provider: result.captureProvider,
    expectedPageCount: result.expectedPageCount ?? null,
    capturedPageCount: result.capturedPageCount ?? result.screenshots.length,
    captureCompleteness: result.captureCompleteness,
    status: result.status,
    stopReason: result.stopReason,
    stopPage: result.stopPage,
    finalSubmitDetected: result.finalSubmitDetected,
    finalSubmitClicked: result.finalSubmitClicked,
    blockedSubmitRequestCount: result.blockedSubmitRequestCount ?? 0,
    temporaryAnswersUsed: result.temporaryAnswersUsed,
    elapsedSec: elapsed,
    limitations: result.limitations,
    debugDir: session.outDir,
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes("--headed");
  const target = (args.find((a) => !a.startsWith("--")) || "all").toLowerCase();
  const keys = (
    target === "all" ? (Object.keys(CASES) as CaseKey[]) : [target as CaseKey]
  ).filter((k) => k in CASES);

  if (keys.length === 0) {
    console.error(`Unknown target: ${target}. Use google|naver|moaform|all`);
    process.exit(1);
  }

  const results = [];
  for (const key of keys) {
    results.push(await runCase(key, headed));
  }

  const outRoot = join(process.cwd(), "tmp", "capture-debug");
  mkdirSync(outRoot, { recursive: true });
  const lines = [
    "[Capture Debug Result]",
    "",
    ...results.flatMap((r) => [
      r.name,
      `- provider: ${r.provider}`,
      `- expectedPageCount: ${r.expectedPageCount ?? "null"}`,
      `- capturedPageCount: ${r.capturedPageCount}`,
      `- captureCompleteness: ${r.captureCompleteness}`,
      `- stopReason: ${r.stopReason}`,
      `- finalSubmitClicked: ${r.finalSubmitClicked}`,
      "",
    ]),
  ];
  const text = lines.join("\n");
  writeFileSync(join(outRoot, "CAPTURE_DEBUG_RESULT.txt"), text, "utf8");
  console.log("\n" + text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
