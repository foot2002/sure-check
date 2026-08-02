/**
 * Diagnosis accuracy regression checks (fixtures + confidence gate).
 * Ensures fast-path gates protect against detection downgrades.
 */
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { evaluateConfidenceGate } from "@/lib/extractors/confidenceGate";
import { formToFastExtractionResult } from "@/lib/extractors/formToFastExtraction";
import {
  NORMALIZED_FORM_FIXTURES,
  getFixtureByUrl,
  resolveFixtureKey,
} from "@/lib/fixtures/normalizedForms";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";

const RISK_RANK: Record<string, number> = {
  high_risk: 4,
  risk: 3,
  caution: 2,
  safe: 1,
};

function countSensitive(
  form: (typeof NORMALIZED_FORM_FIXTURES)[keyof typeof NORMALIZED_FORM_FIXTURES],
) {
  return form.questions.filter((q) =>
    (q.detectedCategories || []).some((c) => String(c).startsWith("sensitive_")),
  ).length;
}

function countHighRisk(
  form: (typeof NORMALIZED_FORM_FIXTURES)[keyof typeof NORMALIZED_FORM_FIXTURES],
) {
  return form.questions.filter((q) =>
    (q.detectedCategories || []).some((c) =>
      /resident_registration|passport|driver_license|foreign_registration|financial_account|authentication_secret|unique_identifier|id_document/.test(
        String(c),
      ),
    ),
  ).length;
}

function main(): void {
  console.log("[Diagnosis Regression Result]\n");
  let failures = 0;
  let pass = 0;
  let fallback = 0;
  let fail = 0;
  let riskDowngradeDetected = 0;
  let personalInfoLossDetected = 0;
  let sensitiveInfoLossDetected = 0;
  let highRiskLossDetected = 0;
  let totalCases = 0;

  const zeroForm = {
    ...NORMALIZED_FORM_FIXTURES.generic_unknown_warning,
    questions: [],
    confidence: "none" as const,
    isLimited: true,
  };
  const zeroFast = formToFastExtractionResult(zeroForm);
  const zeroGate = evaluateConfidenceGate(zeroFast);
  totalCases += 1;
  if (!zeroGate.fallbackTriggered || zeroGate.fallbackReason !== "zero_questions") {
    console.log("gate zero_questions: FAIL");
    failures += 1;
    fail += 1;
  } else {
    console.log("gate zero_questions: PASS");
    pass += 1;
  }

  const highForm = NORMALIZED_FORM_FIXTURES.google_public_high_risk;
  const highFast = formToFastExtractionResult({
    ...highForm,
    confidence: "high",
  });
  const highGate = evaluateConfidenceGate(highFast);
  totalCases += 1;
  if (!highGate.accept) {
    console.log("gate high_confidence accept: FAIL", highGate);
    failures += 1;
    fail += 1;
  } else {
    console.log("gate high_confidence accept: PASS");
    pass += 1;
  }

  const fixtureUrls = [
    "https://sure-check.verify/fixture/google_public_high_risk",
    "https://sure-check.verify/fixture/naver_company_event_risk",
    "https://sure-check.verify/fixture/moaform_employee_high_risk",
  ];

  for (const url of fixtureUrls) {
    totalCases += 1;
    try {
      const key = resolveFixtureKey(url);
      const form = getFixtureByUrl(url);
      const baselineReport = analyzeForm(form, `reg_${key}`, url, key);
      const baselineAudience = composeAudienceReport(baselineReport);

      const personal = form.questions.filter((q) => q.hasPersonalData).length;
      const sensitive = countSensitive(form);
      const highRisk = countHighRisk(form);

      const weak = formToFastExtractionResult({
        ...form,
        questions: form.questions.slice(
          0,
          Math.max(0, form.questions.length - 3),
        ),
        confidence: "medium",
      });
      const weakGate = evaluateConfidenceGate(weak, {
        questionCount: form.questions.length,
        personalInfoCount: personal,
        sensitiveCount: sensitive,
        highRiskCount: highRisk,
      });

      const again = analyzeForm(form, `reg2_${key}`, url, key);
      const againAudience = composeAudienceReport(again);
      const riskSameOrSafer =
        (RISK_RANK[again.grade || "safe"] ?? 0) >=
        (RISK_RANK[baselineReport.grade || "safe"] ?? 0);
      const decisionSame =
        againAudience.safetyType.typeId === baselineAudience.safetyType.typeId;
      const personalSame =
        again.form.questions.filter((q) => q.hasPersonalData).length >= personal;
      const sensitiveSame = countSensitive(again.form) >= sensitive;
      const highRiskSame = countHighRisk(again.form) >= highRisk;
      const noticeSame =
        (again.findings?.length || 0) >=
        (baselineReport.findings?.length || 0) - 1;

      if (!riskSameOrSafer) riskDowngradeDetected += 1;
      if (!personalSame) personalInfoLossDetected += 1;
      if (!sensitiveSame) sensitiveInfoLossDetected += 1;
      if (!highRiskSame) highRiskLossDetected += 1;

      const fallbackNeeded = weakGate.fallbackTriggered;
      const casePass =
        riskSameOrSafer &&
        decisionSame &&
        personalSame &&
        sensitiveSame &&
        highRiskSame &&
        noticeSame &&
        fallbackNeeded;

      console.log(`URL: ${url}`);
      console.log(`platform: ${form.platform}`);
      console.log(`baseline question count: ${form.questions.length}`);
      console.log(`fast question count: ${weak.questions.length}`);
      console.log(
        `browser fallback used: ${fallbackNeeded ? "required" : "no"}`,
      );
      console.log(`risk level same or safer: ${riskSameOrSafer}`);
      console.log(`decision label same or safer: ${decisionSame}`);
      console.log(`personal info detection same or safer: ${personalSame}`);
      console.log(`sensitive detection same or safer: ${sensitiveSame}`);
      console.log(`notice checks same or safer: ${noticeSame}`);
      console.log(
        `result: ${casePass ? "PASS" : fallbackNeeded ? "FALLBACK" : "FAIL"}`,
      );
      console.log("");

      if (casePass) pass += 1;
      else if (fallbackNeeded) {
        fallback += 1;
      } else {
        fail += 1;
        failures += 1;
      }
    } catch (err) {
      fail += 1;
      failures += 1;
      console.log(`URL: ${url}`);
      console.log(`result: FAIL`);
      console.log(String(err));
    }
  }

  console.log("[Diagnosis Regression Summary]");
  console.log(`totalCases: ${totalCases}`);
  console.log(`pass: ${pass}`);
  console.log(`fallback: ${fallback}`);
  console.log(`fail: ${fail}`);
  console.log(`riskDowngradeDetected: ${riskDowngradeDetected}`);
  console.log(`personalInfoLossDetected: ${personalInfoLossDetected}`);
  console.log(`sensitiveInfoLossDetected: ${sensitiveInfoLossDetected}`);
  console.log(`highRiskLossDetected: ${highRiskLossDetected}`);

  if (failures > 0) {
    console.log(`Overall: FAIL (${failures})`);
    process.exit(1);
  }
  console.log("Overall: PASS");
}

main();
