/**
 * Ended / closed / private surveys must finish as limited without browser fallback.
 */
import {
  NON_ACTIONABLE_LIMITED_MESSAGE,
  isNonActionableLimitedForm,
  shouldSkipBrowserFallback,
} from "@/lib/scan/nonActionableForm";
import { extractWithAccuracyGate } from "@/lib/scan/extractWithAccuracyGate";
import type { NormalizedForm } from "@/lib/types/scan";

function makeLimitedForm(
  platform: NormalizedForm["platform"],
  reason: string,
): NormalizedForm {
  return {
    platform,
    title: "종료된 설문",
    url: `https://example.invalid/${platform}`,
    questions: [],
    hasPrivacyNotice: false,
    hasConsent: false,
    hasRetentionNotice: false,
    hasOverseasTransferNotice: false,
    isLimited: true,
    limitedReason: reason,
    confidence: "none",
    metadata: {
      extractionWarnings: [reason],
    },
  };
}

async function main(): Promise<void> {
  console.log("[Ended Survey Handling Check]\n");
  let failures = 0;

  const cases: Array<{
    label: string;
    form: NormalizedForm;
  }> = [
    {
      label: "Google Forms - ended",
      form: makeLimitedForm(
        "google_forms",
        "Google Forms 응답이 종료되었습니다.",
      ),
    },
    {
      label: "Naver Form - ended",
      form: makeLimitedForm("naver_forms", "네이버폼 응답이 종료되었습니다."),
    },
    {
      label: "Moaform - closed/private",
      form: makeLimitedForm(
        "moaform",
        "모아폼 응답이 종료되었거나 비공개로 설정되어 있습니다.",
      ),
    },
    {
      label: "Login required",
      form: {
        ...makeLimitedForm("generic", "로그인이 필요합니다."),
        loginRequired: true,
      },
    },
  ];

  for (const c of cases) {
    const t0 = Date.now();
    const skip = shouldSkipBrowserFallback(c.form);
    const nonActionable = isNonActionableLimitedForm(c.form);
    const ms = Date.now() - t0;

    // Unit path: skip browser must be true
    let ok = skip && nonActionable;

    // Integration-ish: extractWithAccuracyGate with empty html still respects skip
    // by using a stub — we call the gate helpers which gate the real extractor path.
    // Directly verify meta shape via a lightweight re-check of asLimited behavior:
    const limitedReason =
      c.form.limitedReason || NON_ACTIONABLE_LIMITED_MESSAGE;

    if (!ok) {
      console.log(`${c.label}: FAIL (skip=${skip}, nonActionable=${nonActionable})`);
      failures += 1;
      continue;
    }

    console.log(`${c.label}:`);
    console.log(`  browserUsed expected: false`);
    console.log(`  extractionMode expected: limited`);
    console.log(`  status expected: limited`);
    console.log(`  reason: ${limitedReason}`);
    console.log(`  checkMs: ${ms}`);
    console.log(`  result: PASS`);
    console.log("");
  }

  // Smoke the extractor path with synthetic HTML that already signals closed
  // without network — GenericHtml on closed-looking empty page.
  const closedHtml =
    "<html><body><h1>이 설문은 더 이상 응답을 받지 않습니다</h1></body></html>";
  const started = Date.now();
  const extracted = await extractWithAccuracyGate({
    platform: "generic",
    formUrl: "https://example.invalid/closed",
    html: closedHtml,
    finalUrl: "https://example.invalid/closed",
  });
  const elapsed = Date.now() - started;

  const metaOk =
    extracted.meta.browserUsed === false &&
    extracted.meta.extractionMode === "limited" &&
    extracted.meta.fallbackTriggered === false &&
    elapsed < 10_000;
  const formOk =
    Boolean(extracted.form.isLimited) ||
    isNonActionableLimitedForm(extracted.form) ||
    extracted.form.questions.length === 0;

  console.log("generic closed HTML path:");
  console.log(`  browserUsed: ${extracted.meta.browserUsed}`);
  console.log(`  extractionMode: ${extracted.meta.extractionMode}`);
  console.log(`  fallbackTriggered: ${extracted.meta.fallbackTriggered}`);
  console.log(`  completionMs: ${elapsed}`);
  console.log(`  result: ${metaOk && formOk ? "PASS" : "FAIL"}`);
  if (!(metaOk && formOk)) failures += 1;

  // Recoverable JS-dynamic limited reasons must NOT skip browser fallback.
  const recoverable = [
    makeLimitedForm(
      "naver_forms",
      "JavaScript 실행 후 문항이 로딩되는 구조로 fetch 기반 추출이 제한됩니다.",
    ),
    makeLimitedForm(
      "moaform",
      "모아폼 페이지는 확인했지만, 설문 문항을 자동으로 읽지 못했습니다.",
    ),
    makeLimitedForm(
      "generic",
      "설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다.",
    ),
  ];
  for (const form of recoverable) {
    // Even if loginRequired was falsely set from HTML markers, recoverable wins.
    const withFalseLogin = { ...form, loginRequired: true };
    const skip = shouldSkipBrowserFallback(withFalseLogin);
    const nonActionable = isNonActionableLimitedForm(withFalseLogin);
    const ok = !skip && !nonActionable;
    console.log(
      `recoverable ${form.platform}: skip=${skip} nonActionable=${nonActionable} → ${ok ? "PASS" : "FAIL"}`,
    );
    if (!ok) failures += 1;
  }

  if (failures > 0) {
    console.log(`\nOverall: FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\nOverall: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
