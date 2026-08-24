/**
 * Google Forms login/cookie walls (HTTP 401 interstitial) must be diagnosed
 * as access-restricted, not a generic "could not fetch HTML" failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractGoogleForms } from "../lib/extractors/GoogleFormsExtractor";
import { parseGoogleFormsHtml } from "../lib/extractors/googleFormsParser";
import { composeAudienceReport } from "../lib/reporting/composeAudienceReport";
import { classifyLimitedOutcome } from "../lib/report/limitedOutcomeBuckets";
import { generateExtractionLimitedReport } from "../lib/scan/limitedReport";
import {
  LOGIN_RESTRICTED_HEADLINE,
  isAccessRestrictedReport,
} from "../lib/scan/nonActionableForm";

const GOOGLE_401_INTERSTITIAL = `<!DOCTYPE html>
<div class="document-root loading">
  <div class="login">
    <div class="title-text">Google 계정에 로그인하십시오.</div>
    <div class="subtitle-text">이 콘텐츠에 액세스하려면 로그인해야 합니다.</div>
    <button type="button" class="sign-in-button" data-popup-url="https://accounts.google.com/ServiceLogin?continue=https://docs.google.com/forms/d/e/example/viewform">로그인</button>
  </div>
  <div class="request-storage-access">
    <div class="title-text">Google Forms에서 필요한 쿠키에 액세스하도록 허용</div>
    <button type="button" class="accept-button">쿠키 허용</button>
  </div>
</div>`;

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function main(): void {
  console.log("[Google Forms Login Wall Check]\n");
  let failed = 0;

  function check(label: string, ok: boolean, detail?: string): void {
    if (ok) {
      console.log(`  PASS  ${label}`);
      return;
    }
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }

  const parsed = parseGoogleFormsHtml(GOOGLE_401_INTERSTITIAL);
  check("401 interstitial is loginRequired", parsed.loginRequired === true);
  check("401 interstitial has no questions", parsed.questions.length === 0);
  check(
    "401 interstitial limitedReason mentions login",
    /로그인/.test(parsed.limitedReason || ""),
  );

  const form = extractGoogleForms({
    url: "https://forms.gle/login-wall",
    html: GOOGLE_401_INTERSTITIAL,
    finalUrl:
      "https://docs.google.com/forms/d/e/example/viewform?usp=send_form",
  });
  check("extractor sets loginRequired", form.loginRequired === true);
  check("extractor stays limited", form.isLimited === true && form.questions.length === 0);

  const report = generateExtractionLimitedReport(
    "scan_login_wall",
    "https://forms.gle/login-wall",
    form,
    {
      limitedReason: form.limitedReason,
      summary:
        "Google Forms에 로그인 또는 접근 권한이 필요하여 문항을 확인하지 못했습니다.",
    },
  );
  check(
    "limited report keeps loginRequired",
    report.form.loginRequired === true,
  );
  check(
    "limited report is access-restricted",
    isAccessRestrictedReport(report) === true,
  );
  check(
    "outcome bucket is access_restricted",
    classifyLimitedOutcome({
      diagnosisStatus: report.diagnosisStatus,
      limitedReason: report.limitedReason,
      summary: report.summary,
      scanStatus: report.scanStatus,
    }) === "access_restricted",
  );

  const audience = composeAudienceReport(report);
  check(
    "audience headline is login-restricted, not HTTP 401",
    audience.privacyAssessment.conclusion === LOGIN_RESTRICTED_HEADLINE &&
      !/HTTP 401/.test(audience.privacyAssessment.conclusion) &&
      !/HTTP 401/.test(audience.respondentDecisionSummary || ""),
  );
  check(
    "audience does not pretend questions were analyzed",
    /로그인/.test(audience.privacyAssessment.inclusionSummary || ""),
  );

  const resolveSrc = source("lib/scan/resolveScanReport.ts");
  check(
    "scan path parses Google 401 HTML instead of dropping it",
    resolveSrc.includes("platforms.google && fetchResult.html") &&
      resolveSrc.includes("resolveGoogleFormsReport"),
  );
  const fetchSrc = source("lib/security/safeFetch.ts");
  check(
    "safeFetch keeps HTML on non-OK responses",
    fetchSrc.includes("ok: false") &&
      fetchSrc.includes("html,") &&
      fetchSrc.includes("status: response.status"),
  );

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main();
