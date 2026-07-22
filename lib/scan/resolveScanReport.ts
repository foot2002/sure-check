import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import {
  cloneReportForScan,
  DEFAULT_CACHE_TTL_MS,
  getUrlCache,
} from "@/lib/cache/inMemoryUrlCache";
import { extractGenericHtml } from "@/lib/extractors/GenericHtmlExtractor";
import { extractGoogleForms } from "@/lib/extractors/GoogleFormsExtractor";
import { extractNaverForms } from "@/lib/extractors/NaverFormsExtractor";
import {
  GOOGLE_FORMS_DIAGNOSIS_NOTICE,
  isGoogleFormsUrl,
} from "@/lib/extractors/googleFormsTypes";
import { extractMoaform } from "@/lib/extractors/MoaformExtractor";
import {
  isMoaformFinalUrl,
  isMoaformUrl,
  MOAFORM_DIAGNOSIS_NOTICE,
  MOAFORM_FAILURE_MESSAGES,
  type MoaformFailureReason,
} from "@/lib/extractors/moaformTypes";
import {
  isNaverFormsFinalUrl,
  isNaverFormsUrl,
  NAVER_FORMS_DIAGNOSIS_NOTICE,
} from "@/lib/extractors/naverFormsTypes";
import { isFixtureUrl, resolveFixtureKey } from "@/lib/fixtures/normalizedForms";
import { getFixtureByUrl } from "@/lib/fixtures/normalizedForms";
import {
  EXTRACTION_LIMITED_GUIDANCE,
  generateExtractionLimitedReport,
} from "@/lib/scan/limitedReport";
import { safeFetchHtml } from "@/lib/security/safeFetch";
import { safeUrlCheck } from "@/lib/security/urlSafety";
import type { MockReportKey, NormalizedForm, ScanReport, ScanStatus } from "@/lib/types/scan";
import type { ReportBuildContext } from "@/lib/types/debug";
import { hashNormalizedUrl } from "@/lib/utils/hash";
import { normalizeUrl } from "@/lib/utils/normalizeUrl";

export const GENERIC_BETA_NOTICE =
  "이 설문은 정밀 지원 플랫폼이 아니므로, 화면에서 자동 탐지 가능한 문항과 입력 필드를 기준으로 베타 진단했습니다. JavaScript로 동적으로 로딩되는 문항, 분기형 문항, 로그인 후 표시되는 문항은 누락될 수 있습니다.";

function scanBuildContext(formUrl: string, finalUrl?: string): ReportBuildContext {
  return {
    normalizedUrl: normalizeUrl(formUrl),
    finalUrl: finalUrl ?? formUrl,
  };
}

export function generateRestrictedReport(
  scanId: string,
  formUrl: string,
  status: Extract<ScanStatus, "failed" | "limited">,
  reasons: string[],
): ScanReport {
  const limitedReason =
    reasons[0] ??
    (status === "failed" ? "URL 안전검사에서 차단됨" : "HTML fetch 실패");
  const diagnosisStatus = status === "failed" ? "blocked" : "limited";

  return generateExtractionLimitedReport(scanId, formUrl, undefined, {
    limitedReason,
    limitationReasons: reasons.length > 0 ? reasons : [limitedReason],
    summary:
      status === "failed"
        ? `진단이 제한되었습니다. ${limitedReason}`
        : `베타 진단이 제한되었습니다. ${reasons.join(" ") || limitedReason}`,
    buildContext: scanBuildContext(formUrl),
    diagnosisStatus,
  });
}

function cacheReport(
  urlHash: string,
  report: ScanReport,
): void {
  getUrlCache().set(
    urlHash,
    { ...report, scanId: `cached_${urlHash.slice(0, 16)}` },
    DEFAULT_CACHE_TTL_MS,
  );
}

function annotateGenericReport(report: ScanReport, form: NormalizedForm): void {
  report.sections.respondentGuidance = [
    GENERIC_BETA_NOTICE,
    ...report.sections.respondentGuidance,
  ];
  report.sections.disclaimer = `${GENERIC_BETA_NOTICE} ${report.sections.disclaimer}`;

  if (form.extractedFromHtml) {
    report.findings.unshift({
      id: "beta_notice",
      category: "override",
      severity: "info",
      title: "베타 HTML 진단",
      description: GENERIC_BETA_NOTICE,
    });
  }
}

function annotateGoogleFormsReport(report: ScanReport): void {
  report.sections.respondentGuidance = [
    GOOGLE_FORMS_DIAGNOSIS_NOTICE,
    ...report.sections.respondentGuidance,
  ];
  report.sections.disclaimer = `${GOOGLE_FORMS_DIAGNOSIS_NOTICE} ${report.sections.disclaimer}`;
  report.findings.unshift({
    id: "google_forms_notice",
    category: "override",
    severity: "info",
    title: "Google Forms HTML 진단",
    description: GOOGLE_FORMS_DIAGNOSIS_NOTICE,
  });
}

function annotateNaverFormsReport(report: ScanReport): void {
  report.sections.respondentGuidance = [
    NAVER_FORMS_DIAGNOSIS_NOTICE,
    ...report.sections.respondentGuidance,
  ];
  report.sections.disclaimer = `${NAVER_FORMS_DIAGNOSIS_NOTICE} ${report.sections.disclaimer}`;
  report.findings.unshift({
    id: "naver_forms_notice",
    category: "override",
    severity: "info",
    title: "네이버폼 공개 응답 화면 기준 자동 진단",
    description: NAVER_FORMS_DIAGNOSIS_NOTICE,
  });
}

function annotateMoaformReport(report: ScanReport): void {
  report.sections.respondentGuidance = [
    MOAFORM_DIAGNOSIS_NOTICE,
    ...report.sections.respondentGuidance,
  ];
  report.sections.disclaimer = `${MOAFORM_DIAGNOSIS_NOTICE} ${report.sections.disclaimer}`;
  report.findings.unshift({
    id: "moaform_notice",
    category: "override",
    severity: "info",
    title: "모아폼 공개 응답 화면 기준 자동 진단",
    description: MOAFORM_DIAGNOSIS_NOTICE,
  });
}

function buildNaverLimitedReport(
  scanId: string,
  formUrl: string,
  form: NormalizedForm,
  buildContext: ReportBuildContext,
): ScanReport {
  const warnings = form.metadata?.extractionWarnings ?? [];
  const limitedReason =
    form.limitedReason ?? "네이버폼 문항을 자동으로 확인하지 못했습니다.";

  return generateExtractionLimitedReport(scanId, formUrl, form, {
    limitedReason,
    limitationReasons: [limitedReason, ...warnings, EXTRACTION_LIMITED_GUIDANCE].filter(
      (value, index, arr) => arr.indexOf(value) === index,
    ),
    summary: form.loginRequired
      ? "네이버폼에 로그인 또는 접근 권한이 필요하여 문항을 확인하지 못했습니다."
      : form.metadata?.extractionWarnings?.some((warning) => warning.includes("종료"))
        ? "네이버폼 응답이 종료되어 진단이 제한되었습니다."
        : `네이버폼 공개 HTML에서 문항을 자동으로 확인하지 못했습니다. ${limitedReason}`,
    buildContext,
  });
}

async function resolveNaverFormsReport(
  scanId: string,
  formUrl: string,
  html: string,
  finalUrl: string,
  urlHash: string,
): Promise<{ report: ScanReport; jobStatus: ScanStatus }> {
  const form = await extractNaverForms({ url: formUrl, html, finalUrl });

  const buildContext = scanBuildContext(formUrl, finalUrl);

  if (form.isLimited || form.questions.length === 0) {
    const report = buildNaverLimitedReport(scanId, formUrl, form, buildContext);
    cacheReport(urlHash, report);
    return { report, jobStatus: "limited" };
  }

  const report = analyzeForm(
    form,
    scanId,
    formUrl,
    "generic_unknown_warning" as MockReportKey,
    buildContext,
  );
  annotateNaverFormsReport(report);
  cacheReport(urlHash, report);
  return { report, jobStatus: "completed" };
}

function buildMoaformLimitedReport(
  scanId: string,
  formUrl: string,
  form: NormalizedForm,
  buildContext: ReportBuildContext,
): ScanReport {
  const warnings = form.metadata?.extractionWarnings ?? [];
  const code = (form.metadata?.failureReason ??
    "MOAFORM_DYNAMIC_RENDERING") as MoaformFailureReason;
  const messages =
    code && MOAFORM_FAILURE_MESSAGES[code]
      ? MOAFORM_FAILURE_MESSAGES[code]
      : MOAFORM_FAILURE_MESSAGES.MOAFORM_DYNAMIC_RENDERING;
  const limitedReason = form.limitedReason ?? messages.limitedReason;

  return generateExtractionLimitedReport(scanId, formUrl, form, {
    limitedReason,
    limitationReasons: [
      limitedReason,
      messages.summary,
      messages.guidance,
      ...warnings,
      EXTRACTION_LIMITED_GUIDANCE,
    ].filter((value, index, arr) => arr.indexOf(value) === index),
    summary: messages.summary,
    guidance: messages.guidance,
    buildContext,
  });
}

async function resolveMoaformReport(
  scanId: string,
  formUrl: string,
  html: string,
  finalUrl: string,
  urlHash: string,
): Promise<{ report: ScanReport; jobStatus: ScanStatus }> {
  const form = await extractMoaform({ url: formUrl, html, finalUrl });

  const buildContext = scanBuildContext(formUrl, finalUrl);

  if (form.isLimited || form.questions.length === 0) {
    const report = buildMoaformLimitedReport(scanId, formUrl, form, buildContext);
    cacheReport(urlHash, report);
    return { report, jobStatus: "limited" };
  }

  const report = analyzeForm(
    form,
    scanId,
    formUrl,
    "generic_unknown_warning" as MockReportKey,
    buildContext,
  );
  annotateMoaformReport(report);
  cacheReport(urlHash, report);
  return { report, jobStatus: "completed" };
}

function isPlatformUrl(formUrl: string, finalUrl: string): {
  google: boolean;
  naver: boolean;
  moaform: boolean;
} {
  return {
    google: isGoogleFormsUrl(finalUrl) || isGoogleFormsUrl(formUrl),
    naver:
      isNaverFormsFinalUrl(finalUrl) ||
      isNaverFormsUrl(formUrl) ||
      isNaverFormsFinalUrl(formUrl),
    moaform:
      isMoaformFinalUrl(finalUrl) ||
      isMoaformUrl(formUrl) ||
      isMoaformFinalUrl(formUrl),
  };
}

function buildPlatformLimitedReport(
  scanId: string,
  formUrl: string,
  platform: NormalizedForm["platform"],
  title: string,
  limitedReason: string,
  summary: string,
  jobStatus: Extract<ScanStatus, "failed" | "limited">,
): { report: ScanReport; jobStatus: ScanStatus } {
  return {
    report: generateExtractionLimitedReport(
      scanId,
      formUrl,
      { platform, title },
      {
        limitedReason,
        limitationReasons: [limitedReason, EXTRACTION_LIMITED_GUIDANCE],
        summary,
        buildContext: scanBuildContext(formUrl),
        diagnosisStatus: jobStatus === "failed" ? "blocked" : "limited",
      },
    ),
    jobStatus,
  };
}
function buildGoogleLimitedReport(
  scanId: string,
  formUrl: string,
  form: NormalizedForm,
  buildContext: ReportBuildContext,
): ScanReport {
  const warnings = form.metadata?.extractionWarnings ?? [];
  const limitedReason =
    form.limitedReason ?? "Google Forms 문항을 자동으로 확인하지 못했습니다.";

  return generateExtractionLimitedReport(scanId, formUrl, form, {
    limitedReason,
    limitationReasons: [limitedReason, ...warnings, EXTRACTION_LIMITED_GUIDANCE].filter(
      (value, index, arr) => arr.indexOf(value) === index,
    ),
    summary: form.loginRequired
      ? "Google Forms에 로그인 또는 접근 권한이 필요하여 문항을 확인하지 못했습니다."
      : form.metadata?.extractionWarnings?.some((warning) => warning.includes("종료"))
        ? "Google Forms 응답이 종료되어 진단이 제한되었습니다."
        : `Google Forms 공개 HTML에서 문항을 자동으로 확인하지 못했습니다. ${limitedReason}`,
    buildContext,
  });
}

function resolveGoogleFormsReport(
  scanId: string,
  formUrl: string,
  html: string,
  finalUrl: string,
  urlHash: string,
): { report: ScanReport; jobStatus: ScanStatus } {
  const form = extractGoogleForms({ url: formUrl, html, finalUrl });

  const buildContext = scanBuildContext(formUrl, finalUrl);

  if (form.isLimited || form.questions.length === 0) {
    const report = buildGoogleLimitedReport(scanId, formUrl, form, buildContext);
    cacheReport(urlHash, report);
    return { report, jobStatus: "limited" };
  }

  const report = analyzeForm(
    form,
    scanId,
    formUrl,
    "generic_unknown_warning" as MockReportKey,
    buildContext,
  );
  annotateGoogleFormsReport(report);
  cacheReport(urlHash, report);
  return { report, jobStatus: "completed" };
}

function resolveGenericHtmlReport(
  scanId: string,
  formUrl: string,
  html: string,
  finalUrl: string,
  urlHash: string,
): { report: ScanReport; jobStatus: ScanStatus } {
  const form = extractGenericHtml({ url: formUrl, html, finalUrl });

  const buildContext = scanBuildContext(formUrl, finalUrl);

  if (form.questions.length === 0) {
    const report = generateExtractionLimitedReport(scanId, formUrl, form, {
      buildContext,
    });
    cacheReport(urlHash, report);
    return { report, jobStatus: "limited" };
  }

  const report = analyzeForm(
    form,
    scanId,
    formUrl,
    "generic_unknown_warning" as MockReportKey,
    buildContext,
  );
  annotateGenericReport(report, form);
  cacheReport(urlHash, report);
  return { report, jobStatus: "completed" };
}

function resolveFetchFailure(
  scanId: string,
  formUrl: string,
  fetchResult: Awaited<ReturnType<typeof safeFetchHtml>>,
): { report: ScanReport; jobStatus: ScanStatus } {
  const platforms = isPlatformUrl(formUrl, formUrl);

  if (fetchResult.failedReason) {
    if (platforms.google) {
      return buildPlatformLimitedReport(
        scanId,
        formUrl,
        "google_forms",
        "Google Forms",
        fetchResult.failedReason,
        `Google Forms 진단이 제한되었습니다. ${fetchResult.failedReason}`,
        "failed",
      );
    }
    if (platforms.naver) {
      return buildPlatformLimitedReport(
        scanId,
        formUrl,
        "naver_forms",
        "네이버폼",
        fetchResult.failedReason,
        `네이버폼 진단이 제한되었습니다. ${fetchResult.failedReason}`,
        "failed",
      );
    }
    if (platforms.moaform) {
      return buildPlatformLimitedReport(
        scanId,
        formUrl,
        "moaform",
        "모아폼",
        fetchResult.failedReason,
        `모아폼 진단이 제한되었습니다. ${fetchResult.failedReason}`,
        "failed",
      );
    }
    return {
      report: generateRestrictedReport(scanId, formUrl, "failed", [
        fetchResult.failedReason,
      ]),
      jobStatus: "failed",
    };
  }

  const reasons: string[] = [];
  if (fetchResult.limitedReason) reasons.push(fetchResult.limitedReason);
  if (fetchResult.limitedReason?.includes("HTML이 아닌")) {
    reasons.push("HTML이 아닌 콘텐츠");
  }
  if (fetchResult.limitedReason?.includes("시간 초과")) {
    reasons.push("응답 시간 초과");
  }
  if (reasons.length === 0) reasons.push("HTML fetch 실패");

  if (platforms.google) {
    return buildPlatformLimitedReport(
      scanId,
      formUrl,
      "google_forms",
      "Google Forms",
      reasons[0],
      `Google Forms 진단이 제한되었습니다. ${reasons.join(" ")}`,
      "limited",
    );
  }
  if (platforms.naver) {
    return buildPlatformLimitedReport(
      scanId,
      formUrl,
      "naver_forms",
      "네이버폼",
      reasons[0],
      `네이버폼 진단이 제한되었습니다. ${reasons.join(" ")}`,
      "limited",
    );
  }
  if (platforms.moaform) {
    return buildPlatformLimitedReport(
      scanId,
      formUrl,
      "moaform",
      "모아폼",
      reasons[0],
      `모아폼 진단이 제한되었습니다. ${reasons.join(" ")}`,
      "limited",
    );
  }

  return {
    report: generateRestrictedReport(scanId, formUrl, "limited", reasons),
    jobStatus: "limited",
  };
}

export async function resolveScanReport(
  scanId: string,
  formUrl: string,
): Promise<{ report: ScanReport; jobStatus: ScanStatus }> {
  if (isFixtureUrl(formUrl)) {
    const mockKey = resolveFixtureKey(formUrl);
    const form = getFixtureByUrl(formUrl);
    const normalized = normalizeUrl(formUrl);
    const report = analyzeForm(form, scanId, formUrl, mockKey, {
      normalizedUrl: normalized,
      finalUrl: form.url,
    });
    return { report, jobStatus: "completed" };
  }

  const normalized = normalizeUrl(formUrl);
  const urlHash = hashNormalizedUrl(normalized);
  const cache = getUrlCache();
  const cached = cache.get(urlHash);
  if (cached) {
    const report = cloneReportForScan(cached, scanId, formUrl);
    return { report, jobStatus: report.scanStatus ?? "completed" };
  }

  const safety = await safeUrlCheck(formUrl);
  if (!safety.safe) {
    const platforms = isPlatformUrl(formUrl, formUrl);
    if (platforms.google) {
      return buildPlatformLimitedReport(
        scanId,
        formUrl,
        "google_forms",
        "Google Forms",
        safety.reason ?? "URL 안전검사에서 차단됨",
        `Google Forms 진단이 제한되었습니다. ${safety.reason ?? "URL 안전검사에서 차단됨"}`,
        "failed",
      );
    }
    if (platforms.naver) {
      return buildPlatformLimitedReport(
        scanId,
        formUrl,
        "naver_forms",
        "네이버폼",
        safety.reason ?? "URL 안전검사에서 차단됨",
        `네이버폼 진단이 제한되었습니다. ${safety.reason ?? "URL 안전검사에서 차단됨"}`,
        "failed",
      );
    }
    if (platforms.moaform) {
      return buildPlatformLimitedReport(
        scanId,
        formUrl,
        "moaform",
        "모아폼",
        safety.reason ?? "URL 안전검사에서 차단됨",
        `모아폼 진단이 제한되었습니다. ${safety.reason ?? "URL 안전검사에서 차단됨"}`,
        "failed",
      );
    }

    const report = generateRestrictedReport(scanId, formUrl, "failed", [
      safety.reason ?? "URL 안전검사에서 차단됨",
    ]);
    return { report, jobStatus: "failed" };
  }

  const fetchResult = await safeFetchHtml(formUrl);
  if (!fetchResult.ok) {
    return resolveFetchFailure(scanId, formUrl, fetchResult);
  }

  const finalUrl = fetchResult.finalUrl ?? formUrl;
  const html = fetchResult.html!;
  const platforms = isPlatformUrl(formUrl, finalUrl);

  if (platforms.google) {
    return resolveGoogleFormsReport(scanId, formUrl, html, finalUrl, urlHash);
  }

  if (platforms.naver) {
    return resolveNaverFormsReport(scanId, formUrl, html, finalUrl, urlHash);
  }

  if (platforms.moaform) {
    return resolveMoaformReport(scanId, formUrl, html, finalUrl, urlHash);
  }

  return resolveGenericHtmlReport(scanId, formUrl, html, finalUrl, urlHash);
}
