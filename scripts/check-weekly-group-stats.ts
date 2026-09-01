import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  groupCautionRate,
  hydrateOrgRows,
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
  console.log("[Weekly Group Stats Check]");

  const small = groupCautionRate(8, 10);
  const large = groupCautionRate(10, 50);
  check("per-group rates differ by size", small === 80 && large === 20);
  check("does not reuse a week-wide 82.6", small !== 82.6 && large !== 82.6);

  const platforms = hydratePlatformRows([
    {
      platform: "Google Forms",
      surveyCount: 10,
      personalInfoCount: 9,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 1,
      sensitiveInfoRate: 10,
      highRiskInfoCount: 0,
      highRiskInfoRate: 0,
      attentionNeededCount: 8,
      attentionNeededRate: 82.6,
      avgOverallScore: 41.2,
    },
    {
      platform: "Naver Form",
      surveyCount: 50,
      personalInfoCount: 20,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 2,
      sensitiveInfoRate: 4,
      highRiskInfoCount: 1,
      highRiskInfoRate: 2,
      attentionNeededCount: 10,
      attentionNeededRate: 82.6,
      avgOverallScore: 62.4,
    },
  ]);
  check(
    "hydrate recomputes platform caution from group counts",
    platforms[0].attentionNeededRate === 80 &&
      platforms[1].attentionNeededRate === 20,
  );
  check(
    "hydrated platform rates are not a copied week-wide constant",
    ratesLookCopied(platforms, 82.6) === false,
  );

  const orgs = hydrateOrgRows([
    {
      typeLabel: "공공기관",
      surveyCount: 12,
      personalInfoCount: 10,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 1,
      sensitiveInfoRate: 8,
      highRiskInfoCount: 0,
      highRiskInfoRate: 0,
      attentionNeededCount: 9,
      attentionNeededRate: 82.6,
      avgOverallScore: 44.1,
    },
    {
      typeLabel: "민간기업",
      surveyCount: 40,
      personalInfoCount: 22,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 2,
      sensitiveInfoRate: 5,
      highRiskInfoCount: 0,
      highRiskInfoRate: 0,
      attentionNeededCount: 8,
      attentionNeededRate: 82.6,
      avgOverallScore: 58.8,
    },
  ]);
  check(
    "hydrate recomputes org caution from group counts",
    orgs[0].attentionNeededRate === 75 && orgs[1].attentionNeededRate === 20,
  );
  check(
    "hydrated org rates are not a copied week-wide constant",
    ratesLookCopied(orgs, 82.6) === false,
  );

  const gen = read("lib/weekly/generateWeeklyReport.ts");
  const dash = read("lib/report/buildPublicDashboard.ts");
  check(
    "generate does not stamp metrics.attentionNeededRate onto groups",
    !gen.includes("attentionNeededRate: metrics.attentionNeededRate"),
  );
  const platformBlock = mappingBlock(
    gen,
    "platformStats: dash.platformStats.map",
    "organizationStats: dash.organizationTypeStats.map",
  );
  const orgBlock = mappingBlock(
    gen,
    "organizationStats: dash.organizationTypeStats.map",
    "publicSector:",
  );
  check(
    "platform map uses row.attentionNeededRate",
    platformBlock.includes("attentionNeededRate: row.attentionNeededRate") &&
      !platformBlock.includes("dash.summary.attentionNeededRate"),
  );
  check(
    "org map uses row.attentionNeededRate",
    orgBlock.includes("attentionNeededRate: row.attentionNeededRate") &&
      !orgBlock.includes("dash.summary.attentionNeededRate"),
  );
  check(
    "dashboard computes group caution as count/total",
    dash.includes("attentionNeededRate: rate(bucket.attentionNeededCount, bucket.surveyCount)"),
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:group-stats-check PASS");
}

main();
