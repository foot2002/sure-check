import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatScore1 } from "../lib/weekly/privacyIndex";
import {
  groupCautionRate,
  hydratePlatformRows,
  ratesLookCopied,
} from "../lib/weekly/present";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`PASS  ${name}`);
    return;
  }
  const msg = detail ? `${name}: ${detail}` : name;
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}

function mappingBlock(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  return start >= 0 && end > start ? src.slice(start, end) : "";
}

function main() {
  console.log("[Weekly Platform Stats Check]");

  const rows = hydratePlatformRows([
    {
      platform: "Google Forms",
      surveyCount: 80,
      personalInfoCount: 70,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 4,
      sensitiveInfoRate: 5,
      highRiskInfoCount: 1,
      highRiskInfoRate: 1,
      attentionNeededCount: 66,
      attentionNeededRate: 82.6,
      avgOverallScore: 47.9,
    },
    {
      platform: "Microsoft Forms",
      surveyCount: 12,
      personalInfoCount: 6,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 0,
      sensitiveInfoRate: 0,
      highRiskInfoCount: 0,
      highRiskInfoRate: 0,
      attentionNeededCount: 3,
      attentionNeededRate: 82.6,
      avgOverallScore: 61.5,
    },
  ]);

  check(
    "two platforms of different size have different caution rates",
    rows[0].attentionNeededRate === groupCautionRate(66, 80) &&
      rows[1].attentionNeededRate === groupCautionRate(3, 12) &&
      rows[0].attentionNeededRate !== rows[1].attentionNeededRate,
  );
  check(
    "platform caution is not week-wide 82.6 for every row",
    rows.every((row) => row.attentionNeededRate !== 82.6) &&
      ratesLookCopied(rows, 82.6) === false,
  );
  check(
    "missing counts are filled from rates",
    hydratePlatformRows([
      {
        platform: "legacy",
        surveyCount: 10,
        personalInfoRate: 50,
        sensitiveInfoRate: 10,
        highRiskInfoRate: 0,
        attentionNeededRate: 40,
        avgOverallScore: 55,
      },
    ])[0].personalInfoCount === 5 &&
      hydratePlatformRows([
        {
          platform: "legacy",
          surveyCount: 10,
          personalInfoRate: 50,
          sensitiveInfoRate: 10,
          highRiskInfoRate: 0,
          attentionNeededRate: 40,
          avgOverallScore: 55,
        },
      ])[0].attentionNeededCount === 4,
  );
  check(
    "platform average score stays per-group",
    formatScore1(rows[0].avgOverallScore) !== formatScore1(rows[1].avgOverallScore),
  );

  const gen = read("lib/weekly/generateWeeklyReport.ts");
  const dash = read("lib/report/buildPublicDashboard.ts");
  const platformBlock = mappingBlock(
    gen,
    "platformStats: dash.platformStats.map",
    "organizationStats: dash.organizationTypeStats.map",
  );
  check("generate maps platform personalInfoCount", platformBlock.includes("personalInfoCount: row.personalInfoCount"));
  check(
    "generate maps platform attention from row, not week summary",
    platformBlock.includes("attentionNeededCount: row.attentionNeededCount") &&
      platformBlock.includes("attentionNeededRate: row.attentionNeededRate") &&
      !platformBlock.includes("metrics.attentionNeededRate") &&
      !platformBlock.includes("dash.summary.attentionNeededRate"),
  );
  check(
    "dashboard platform rate uses bucket counts",
    dash.includes("attentionNeededRate: rate(bucket.attentionNeededCount, bucket.surveyCount)"),
  );
  check(
    "dashboard does not assign summary.attentionNeededRate onto platforms",
    !dash.includes("attentionNeededRate: summary.attentionNeededRate"),
  );

  const ui = read("components/weekly/WeeklyDetailView.tsx");
  check("detail hydrates platform rows", ui.includes("hydratePlatformRows(snapshot.platformStats)"));
  check("detail shows platform insight cards", ui.includes("groupInsightCards(platforms)"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:platform-stats-check PASS");
}

main();
