import { buildAnonymousCases } from "../lib/weekly/anonymousCases";

const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures.push(detail ? `${name}: ${detail}` : name);
    console.error(`FAIL  ${failures[failures.length - 1]}`);
  }
}

function main() {
  console.log("[Weekly Case Signal Count Check]");
  const personalInfoCount = 132;
  const cases = buildAnonymousCases({
    schoolCount: 7,
    publicCount: 80,
    medicalCount: 3,
    personalInfoCount,
    sensitiveCount: 11,
    highRiskCount: 9,
    publicExternalToolCount: 83,
    nameCount: 40,
    phoneCount: 50,
    emailCount: 30,
    affiliationCount: 20,
    analyzableCount: 144,
    noticeGaps: ["고지문 미흡"],
    topTool: "Google Forms",
  });
  check("has cases", cases.length >= 2);
  const sameAsPii = cases.filter((row) => row.similarCount === personalInfoCount);
  check(
    "not every case uses week-wide PII count",
    sameAsPii.length < cases.length,
    `identical=${sameAsPii.length}/${cases.length}`,
  );
  const unique = new Set(cases.map((row) => row.similarCount));
  check("similar counts are not all identical", unique.size > 1, [...unique].join(","));
  check(
    "event-application does not use personalInfoCount",
    (cases.find((row) => row.id === "event-application")?.similarCount || 0) !==
      personalInfoCount,
  );

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nweekly-case-signal-count-check PASS");
}

main();
