import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatScore1 } from "../lib/weekly/privacyIndex";
import {
  groupCautionRate,
  hydrateOrgRows,
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
  console.log("[Weekly Organization Stats Check]");

  const rows = hydrateOrgRows([
    {
      typeLabel: "공공기관",
      surveyCount: 24,
      personalInfoCount: 20,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 2,
      sensitiveInfoRate: 8,
      highRiskInfoCount: 0,
      highRiskInfoRate: 0,
      attentionNeededCount: 18,
      attentionNeededRate: 82.6,
      avgOverallScore: 44.8,
    },
    {
      typeLabel: "학교/교육기관",
      surveyCount: 6,
      personalInfoCount: 5,
      personalInfoRate: 82.6,
      sensitiveInfoCount: 0,
      sensitiveInfoRate: 0,
      highRiskInfoCount: 0,
      highRiskInfoRate: 0,
      attentionNeededCount: 2,
      attentionNeededRate: 82.6,
      avgOverallScore: 56.3,
    },
  ]);

  check(
    "org caution rates differ by group size",
    rows[0].attentionNeededRate === groupCautionRate(18, 24) &&
      rows[1].attentionNeededRate === groupCautionRate(2, 6) &&
      rows[0].attentionNeededRate !== rows[1].attentionNeededRate,
  );
  check(
    "org caution is not a copied week-wide 82.6",
    ratesLookCopied(rows, 82.6) === false,
  );
  check(
    "org average is a number when surveyCount > 0",
    rows.every((row) => row.surveyCount > 0 && row.avgOverallScore != null) &&
      rows.every((row) => formatScore1(row.avgOverallScore) !== "-"),
  );
  check(
    "dash is only for null averages",
    formatScore1(null) === "-" && formatScore1(44.8) !== "-",
  );

  const gen = read("lib/weekly/generateWeeklyReport.ts");
  const orgBlock = mappingBlock(
    gen,
    "organizationStats: dash.organizationTypeStats.map",
    "publicSector:",
  );
  check(
    "generate maps org attention from row",
    orgBlock.includes("attentionNeededCount: row.attentionNeededCount") &&
      orgBlock.includes("attentionNeededRate: row.attentionNeededRate") &&
      !orgBlock.includes("dash.summary.attentionNeededRate"),
  );
  check(
    "generate maps org avgOverallScore from row",
    orgBlock.includes("avgOverallScore: row.avgOverallScore") &&
      !orgBlock.includes("dash.summary.avgOverallScore"),
  );

  const dash = read("lib/report/buildPublicDashboard.ts");
  check(
    "dashboard org rate uses bucket counts",
    dash.includes("attentionNeededRate: rate(bucket.attentionNeededCount, bucket.surveyCount)"),
  );
  check(
    "dashboard org average uses bucket scores",
    mappingBlock(dash, "// Organization type stats", "Diagnosis quality").includes(
      "avgOverallScore: avg(bucket.scores)",
    ),
  );

  const ui = read("components/weekly/WeeklyDetailView.tsx");
  const editorial = read("components/weekly/WeeklyEditorial.tsx");
  check("detail hydrates org rows", ui.includes("hydrateOrgRows(snapshot.organizationStats)"));
  check("org cards show formatScore1", editorial.includes("formatScore1(row.avgOverallScore)"));
  check("sample badge on group cards", editorial.includes("WeeklySampleBadge"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:organization-stats-check PASS");
}

main();
