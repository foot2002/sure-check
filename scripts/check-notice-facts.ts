/**
 * Notice 2-pass certainty: FOUND_CONFIRMED should not escalate to strong missing.
 */
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { buildNoticeFacts } from "@/lib/analyzer/noticeFacts";
import { extractGenericHtml } from "@/lib/extractors/GenericHtmlExtractor";
import { extractGoogleForms } from "@/lib/extractors/GoogleFormsExtractor";
import { NORMALIZED_FORM_FIXTURES } from "@/lib/fixtures/normalizedForms";
import {
  buildNoticeCorpus,
  hasCollectionPurpose,
  hasDestructionRule,
  hasRetentionPeriod,
} from "@/lib/reporting/noticeCorpusChecks";
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

  const nameQ: NormalizedForm["questions"][number] = {
    id: "q1",
    label: "성명",
    type: "short_text",
    required: true,
    hasPersonalData: true,
    personalDataTypes: ["이름"],
    detectedCategories: ["name"],
    dataRiskLevel: "D3",
  };

  try {
    const mixed: NormalizedForm = {
      platform: "google_forms",
      title: "행사 참가 신청",
      url: "https://example.com/mixed-notice",
      questions: [
        nameQ,
        {
          id: "q-consent",
          label: "개인정보 수집·이용 동의",
          type: "checkbox",
          required: true,
          hasPersonalData: false,
          auxiliaryText:
            "개인정보 수집·이용 목적: 행사 운영 및 안내. 수집 항목: 성명, 연락처. 보유·이용 기간: 행사 종료 후 1년. 동의 거부 권리가 있으며 거부 시 참가가 제한될 수 있습니다. 목적 달성 후 파기합니다.",
        },
      ],
      hasPrivacyNotice: false,
      hasConsent: false,
      hasRetentionNotice: false,
      hasOverseasTransferNotice: false,
    };
    const corpus = buildNoticeCorpus(mixed);
    assert(hasCollectionPurpose(corpus), "mixed purpose");
    assert(hasRetentionPeriod(corpus), "mixed retention");
    assert(hasDestructionRule(corpus), "mixed destruction");
    const report = analyzeForm(
      mixed,
      "nf_mixed",
      mixed.url,
      "generic_unknown_warning",
    );
    const missing = missingNoticeLabels(report);
    assert(
      !missing.some((item) => /목적|보유|거부/.test(item)),
      `mixed false missing: ${missing.join(", ")}`,
    );
    console.log("mixed/mid notice: PASS");
  } catch (e) {
    failures += 1;
    console.log("mixed/mid notice: FAIL", e instanceof Error ? e.message : e);
  }

  try {
    const latePage: NormalizedForm = {
      platform: "google_forms",
      title: "주민 신청",
      url: "https://example.com/late-page-notice",
      questions: [nameQ],
      pages: [
        { id: "page_0", title: "신청 정보", questions: [] },
        {
          id: "page_1",
          title: "개인정보 수집 이용 안내",
          description:
            "수집 목적: 신청 처리. 수집 항목: 성명. 보유기간 1년. 목적 달성 후 파기. 동의 거부 시 신청이 제한될 수 있습니다.",
          questions: [],
        },
      ],
      hasPrivacyNotice: false,
      hasConsent: false,
      hasRetentionNotice: false,
      hasOverseasTransferNotice: false,
    };
    const corpus = buildNoticeCorpus(latePage);
    assert(hasCollectionPurpose(corpus), "late page purpose");
    assert(hasRetentionPeriod(corpus), "late page retention");
    const facts = buildNoticeFacts(latePage);
    const purpose = facts.find((item) => item.key === "collectionPurpose");
    assert(
      purpose?.certainty === "FOUND_CONFIRMED" ||
        purpose?.certainty === "FOUND_POSSIBLE",
      `late page fact ${purpose?.certainty}`,
    );
    console.log("late page notice: PASS");
  } catch (e) {
    failures += 1;
    console.log("late page notice: FAIL", e instanceof Error ? e.message : e);
  }

  const lateNoticeBody =
    "개인정보 수집·이용 목적: 행사 운영. 수집 항목: 성명. 보유·이용 기간: 1년. 동의 거부 시 참가가 제한될 수 있습니다. 목적 달성 후 파기합니다.";

  function googleLoadDataHtml(
    fields: unknown[],
    title = "행사 신청",
    description = "",
  ): string {
    const formInfo = [
      description,
      fields,
      null,
      null,
      null,
      null,
      null,
      null,
      title,
    ];
    return `<html><body><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, formInfo])};</script></body></html>`;
  }

  function assertExtractedNotice(form: NormalizedForm, label: string): void {
    const corpus = buildNoticeCorpus(form);
    assert(form.hasPrivacyNotice, `${label} hasPrivacyNotice`);
    assert(form.hasConsent, `${label} hasConsent`);
    assert(hasCollectionPurpose(corpus), `${label} purpose`);
    assert(hasRetentionPeriod(corpus), `${label} retention`);
    const report = analyzeForm(form, `nf_${label}`, form.url, "generic_unknown_warning");
    const missing = missingNoticeLabels(report);
    assert(
      !missing.some((item) => /목적|보유|거부/.test(item)),
      `${label} false missing: ${missing.join(", ")}`,
    );
  }

  try {
    const form = extractGoogleForms({
      html: googleLoadDataHtml([
        [1, "성명", "", 0, [[null, [], 1]]],
        [2, "", lateNoticeBody, 6, [[]]],
        [
          3,
          "개인정보 수집·이용 동의",
          "",
          2,
          [[null, [["동의합니다"], ["동의하지 않습니다"]], 1]],
        ],
      ]),
      url: "https://docs.google.com/forms/d/mid-notice",
      finalUrl: "https://docs.google.com/forms/d/mid-notice",
    });
    assert(
      !form.questions.some((question) => question.label === lateNoticeBody),
      "type 6 should not become an answerable question",
    );
    assertExtractedNotice(form, "google-mid-text-block");
    console.log("google mid text-block notice: PASS");
  } catch (e) {
    failures += 1;
    console.log(
      "google mid text-block notice: FAIL",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    const form = extractGoogleForms({
      html: googleLoadDataHtml([
        [1, "성명", "", 0, [[null, [], 1]]],
        [2, "개인정보 안내", lateNoticeBody, 8, [[]]],
      ]),
      url: "https://docs.google.com/forms/d/late-section",
      finalUrl: "https://docs.google.com/forms/d/late-section",
    });
    assertExtractedNotice(form, "google-late-section");
    console.log("google late section notice: PASS");
  } catch (e) {
    failures += 1;
    console.log(
      "google late section notice: FAIL",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    const form = extractGoogleForms({
      html: googleLoadDataHtml([
        [1, "성명", "", 0, [[null, [], 1]]],
        [2, "연락처", lateNoticeBody, 0, [[null, [], 1]]],
      ]),
      url: "https://docs.google.com/forms/d/mixed-aux",
      finalUrl: "https://docs.google.com/forms/d/mixed-aux",
    });
    assertExtractedNotice(form, "google-mixed-aux");
    console.log("google mixed question notice: PASS");
  } catch (e) {
    failures += 1;
    console.log(
      "google mixed question notice: FAIL",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    const form = extractGenericHtml({
      html: `<html><body><form>
        <p>성명</p><input name="name" />
        <h3>신청 확인</h3>
        <p>${lateNoticeBody}</p>
        <label><input type="checkbox" name="agree" /> 개인정보 수집·이용에 동의합니다</label>
      </form></body></html>`,
      url: "https://example.go.kr/apply",
      finalUrl: "https://example.go.kr/apply",
    });
    assertExtractedNotice(form, "generic-late-html");
    console.log("generic late html notice: PASS");
  } catch (e) {
    failures += 1;
    console.log(
      "generic late html notice: FAIL",
      e instanceof Error ? e.message : e,
    );
  }

  if (failures > 0) {
    console.error(`\nnotice-facts check failed: ${failures}`);
    process.exit(1);
  }
  console.log("\nnotice-facts check: OK");
}

main();
