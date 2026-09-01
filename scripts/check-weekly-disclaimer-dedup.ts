import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WEEKLY_DISCLAIMER, WEEKLY_TOP_DISCLAIMER } from "../lib/weekly/copy";

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

function countNeedle(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function main() {
  console.log("[Weekly Disclaimer Dedup Check]");

  const detail = read("components/weekly/WeeklyDetailView.tsx");
  const panel = read("components/weekly/PrivacyIndexTrendPanel.tsx");
  const editorial = read("components/weekly/WeeklyEditorial.tsx");
  const composition = `${detail}\n${panel}`;

  check("WEEKLY_TOP_DISCLAIMER used once in detail", countNeedle(detail, "<WeeklyTopDisclaimer") === 1);
  check("WEEKLY_DISCLAIMER used in quality section", detail.includes("WEEKLY_DISCLAIMER") && detail.includes("진단 신뢰도 및 한계"));
  check("top disclaimer copy is 확정하지 않으며", WEEKLY_TOP_DISCLAIMER.includes("위법 여부를 확정하지 않으며"));
  check("bottom disclaimer copy is 확정하지 않습니다", WEEKLY_DISCLAIMER.includes("위법 여부를 확정하지 않습니다"));
  check(
    "editorial top disclaimer uses WEEKLY_TOP_DISCLAIMER",
    editorial.includes("WEEKLY_TOP_DISCLAIMER") && editorial.includes("function WeeklyTopDisclaimer"),
  );
  check(
    "PrivacyIndex panel does not import WEEKLY_PRIVACY_INDEX_DISCLAIMER",
    !panel.includes("WEEKLY_PRIVACY_INDEX_DISCLAIMER"),
  );
  check(
    "mid-body panel has no 위법 여부를 확정하지 않습니다",
    !panel.includes("위법 여부를 확정하지 않습니다"),
  );

  const phraseCount = countNeedle(composition, "위법 여부를 확정하지 않습니다");
  check(
    "detail+panel composition has the 위법 phrase at most twice",
    phraseCount <= 2,
    `found ${phraseCount}`,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:disclaimer-dedup-check PASS");
}

main();
