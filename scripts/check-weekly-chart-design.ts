import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function main() {
  console.log("[Weekly Chart Design Check]");

  const charts = read("components/weekly/WeeklyCharts.tsx");
  const editorial = read("components/weekly/WeeklyEditorial.tsx");
  const detail = read("components/weekly/WeeklyDetailView.tsx");

  check(
    "WeeklyBarList emphasizes first item by default",
    charts.includes("index === 0") && charts.includes("emphasizeLast = false"),
  );
  check(
    "WeeklyBarList does not emphasize last by default",
    /const active = emphasizeLast\s*\?\s*index === items\.length - 1\s*:\s*index === 0/.test(
      charts.replace(/\s+/g, " "),
    ),
  );
  check(
    "hero chart height is around 210, not 300",
    charts.includes("variant === \"hero\" ? 210") && !charts.includes("? 300"),
  );
  check("WeeklyKeyNumberStrip exists", editorial.includes("export function WeeklyKeyNumberStrip"));
  check("detail uses key number strip", detail.includes("<WeeklyKeyNumberStrip"));
  check(
    "TOP5 uses hint descriptions",
    detail.includes("hint: row.description") && detail.includes("자주 발견된 미흡·확인 필요 항목 TOP 5"),
  );
  check("WeeklyBarList renders hint", charts.includes("item.hint"));
  check("sample badges exist", editorial.includes("weeklySampleBadgeLabel"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:chart-design-check PASS");
}

main();
