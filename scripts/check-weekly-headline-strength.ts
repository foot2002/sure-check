import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHeadline } from "../lib/weekly/copy";

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
  console.log("[Weekly Headline Strength Check]");

  const expected =
    "공개 온라인 설문 144건 중 132건, 개인정보 수집 신호 확인";
  check("buildHeadline(144, 132) comma style", buildHeadline(144, 132) === expected);
  check("does not use 건에서", !buildHeadline(144, 132).includes("건에서"));
  check("no 10건 중 9건 compression", !buildHeadline(144, 132).includes("10건 중"));
  check(
    "attention fallback when PII < 80% and attention >= 70%",
    buildHeadline(100, 60, 75) ===
      "공개 온라인 설문 100건 중 75건, 응답 전 주의 필요",
  );
  check(
    "PII >= 80% keeps 개인정보 수집 신호 even if attention is high",
    buildHeadline(100, 90, 95).includes("개인정보 수집 신호 확인"),
  );
  check(
    "empty week copy",
    buildHeadline(0, 0).includes("진단이 충분하지 않습니다"),
  );

  const copy = read("lib/weekly/copy.ts");
  check("copy has no 10건 중 helper", !copy.includes("10건 중") && !copy.includes("perTen"));
  check("copy uses comma template", copy.includes("건, 개인정보 수집 신호 확인"));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly:headline-strength-check PASS");
}

main();
