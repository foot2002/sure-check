/**
 * Notice 2-pass certainty: FOUND_CONFIRMED should not escalate to strong missing.
 */
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { buildNoticeFacts } from "@/lib/analyzer/noticeFacts";
import { NORMALIZED_FORM_FIXTURES } from "@/lib/fixtures/normalizedForms";
import { missingNoticeLabels } from "@/lib/reporting/respondentDecision";
import type { NormalizedForm } from "@/lib/types/scan";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main(): void {
  let failures = 0;

  const rich: NormalizedForm = {
    platform: "google_forms",
    title: "시민 의견 조사",
    url: "https://example.com/form",
    questions: [
      {
        id: "q1",
        label: "성명",
        type: "short_text",
        required: true,
        hasPersonalData: true,
        personalDataTypes: ["이름"],
        dataRiskLevel: "D3",
        detectedCategories: ["name"],
      },
    ],
    hasPrivacyNotice: true,
    hasConsent: true,
    hasRetentionNotice: true,
    hasOverseasTransferNotice: false,
    notices: {
      description:
        "본 조사는 ○○시청이 실시합니다. 수집·이용 목적: 정책 수립. 수집 항목: 성명. 보유·이용 기간: 1년. 동의 거부 권리가 있으며 거부 시 불이익이 있을 수 있습니다. 문의: 개인정보 보호책임자 02-111-2222",
      purpose: "정책 수립을 위한 의견 수렴",
      items: "성명",
      retention: "보유기간 1년",
      privacyNotice:
        "개인정보 수집·이용 목적, 항목, 보유기간, 동의 거부권 안내",
      refusalRight: "동의하지 않을 경우 설문 참여가 제한될 수 있습니다.",
      contactDepartment: "개인정보 보호책임자 02-111-2222",
    },
  };

  try {
    const facts = buildNoticeFacts(rich);
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.certainty]));
    assert(
      byKey.collectionPurpose === "FOUND_CONFIRMED",
      `purpose ${byKey.collectionPurpose}`,
    );
    assert(
      byKey.retentionPeriod === "FOUND_CONFIRMED",
      `retention ${byKey.retentionPeriod}`,
    );
    assert(
      byKey.refusalRight === "FOUND_CONFIRMED",
      `refusal ${byKey.refusalRight}`,
    );
    const report = analyzeForm(rich, "nf_rich", rich.url, "generic_unknown_warning");
    const missing = missingNoticeLabels(report);
    assert(
      !missing.some((m) => /목적|보유|거부/.test(m)),
      `false missing core notices: ${missing.join(", ")}`,
    );
    console.log("rich notices: PASS");
  } catch (e) {
    failures += 1;
    console.log("rich notices: FAIL", e instanceof Error ? e.message : e);
  }

  try {
    const thin = NORMALIZED_FORM_FIXTURES.google_public_high_risk;
    const report = analyzeForm(
      thin,
      "nf_thin",
      "https://sure-check.verify/fixture/google_public_high_risk",
      "google_public_high_risk",
    );
    const unclear = (report.debug?.missingNotices ?? []).filter(
      (g) => g.status === "unclear",
    );
    const strong = missingNoticeLabels(report);
    assert(
      !strong.some((label) =>
        (report.debug?.missingNotices ?? []).some(
          (g) => g.label === label && g.status === "unclear",
        ),
      ),
      "unclear gaps must not appear in strong missingNoticeLabels",
    );
    console.log(
      `thin form: PASS (unclear=${unclear.length}, strongMissing=${strong.length})`,
    );
  } catch (e) {
    failures += 1;
    console.log("thin form: FAIL", e instanceof Error ? e.message : e);
  }

  if (failures > 0) {
    console.error(`\nnotice-facts check failed: ${failures}`);
    process.exit(1);
  }
  console.log("\nnotice-facts check: OK");
}

main();
