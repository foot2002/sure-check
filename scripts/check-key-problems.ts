/**
 * Hero TOP3 / audience keyProblems regression + legal wording safety.
 */
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { NORMALIZED_FORM_FIXTURES, resolveFixtureKey } from "@/lib/fixtures/normalizedForms";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { buildKeyProblems } from "@/lib/reporting/buildKeyProblems";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const FORBIDDEN =
  /개인정보보호법을\s*위반|불법\s*설문|기관이\s*법을\s*어겼|법\s*위반입니다/;

function main(): void {
  let failures = 0;
  const urls = [
    "https://sure-check.verify/fixture/google_public_high_risk",
    "https://sure-check.verify/fixture/naver_company_event_risk",
    "https://sure-check.verify/fixture/moaform_employee_high_risk",
  ];

  for (const url of urls) {
    try {
      const key = resolveFixtureKey(url);
      const form =
        NORMALIZED_FORM_FIXTURES[
          key as keyof typeof NORMALIZED_FORM_FIXTURES
        ];
      assert(form, `missing fixture ${key}`);
      const report = analyzeForm(form, `kp_${key}`, url, key);
      const audience = composeAudienceReport(report);
      assert(Array.isArray(audience.keyProblems), "keyProblems missing");
      assert(audience.keyProblems.length <= 3, "keyProblems > 3");
      for (const problem of audience.keyProblems) {
        assert(problem.headline?.length > 8, "weak headline");
        assert(!FORBIDDEN.test(problem.headline), `forbidden legal claim: ${problem.headline}`);
        assert(!FORBIDDEN.test(problem.fact), `forbidden legal claim in fact`);
        assert(!FORBIDDEN.test(problem.why), `forbidden legal claim in why`);
      }
      const direct = buildKeyProblems(report, audience.collectedDataSummary);
      assert(direct.length === audience.keyProblems.length, "compose mismatch");
      console.log(`${key}: PASS (top=${audience.keyProblems.length})`);
    } catch (e) {
      failures += 1;
      console.log(
        `${url}: FAIL`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (failures > 0) {
    console.error(`\nkey-problems check failed: ${failures}`);
    process.exit(1);
  }
  console.log("\nkey-problems check: OK");
}

main();
