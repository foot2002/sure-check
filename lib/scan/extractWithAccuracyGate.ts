import { fetchHtmlWithExtractBrowser } from "@/lib/extractors/browserExtractFallback";
import { evaluateConfidenceGate } from "@/lib/extractors/confidenceGate";
import type { ScanExtractionMeta } from "@/lib/extractors/fastExtractionTypes";
import { formToFastExtractionResult } from "@/lib/extractors/formToFastExtraction";
import { extractGenericHtml } from "@/lib/extractors/GenericHtmlExtractor";
import { extractGoogleForms } from "@/lib/extractors/GoogleFormsExtractor";
import { extractMoaform } from "@/lib/extractors/MoaformExtractor";
import { extractNaverForms } from "@/lib/extractors/NaverFormsExtractor";
import type { NormalizedForm } from "@/lib/types/scan";

export type PlatformKind = "google" | "naver" | "moaform" | "generic";

async function extractOnce(
  platform: PlatformKind,
  formUrl: string,
  html: string,
  finalUrl: string,
): Promise<NormalizedForm> {
  if (platform === "google") {
    return extractGoogleForms({ url: formUrl, html, finalUrl });
  }
  if (platform === "naver") {
    return extractNaverForms({ url: formUrl, html, finalUrl });
  }
  if (platform === "moaform") {
    return extractMoaform({ url: formUrl, html, finalUrl });
  }
  return extractGenericHtml({ url: formUrl, html, finalUrl });
}

function countPersonal(form: NormalizedForm): number {
  return (form.questions || []).filter((q) => q.hasPersonalData).length;
}

/**
 * Platform parser first → confidence gate → optional extract-only browser fallback.
 * Never drops to a weaker question set when fallback returns fewer questions.
 */
export async function extractWithAccuracyGate(params: {
  platform: PlatformKind;
  formUrl: string;
  html: string;
  finalUrl: string;
  baseline?: {
    questionCount?: number;
    personalInfoCount?: number;
    sensitiveCount?: number;
    highRiskCount?: number;
  };
}): Promise<{ form: NormalizedForm; meta: ScanExtractionMeta; html: string; finalUrl: string }> {
  const extractStarted = Date.now();
  const first = await extractOnce(
    params.platform,
    params.formUrl,
    params.html,
    params.finalUrl,
  );

  const fast = formToFastExtractionResult(
    first,
    params.html,
    params.platform === "generic" ? "fast_static" : "platform_parser",
  );
  const gate = evaluateConfidenceGate(fast, params.baseline);

  const meta: ScanExtractionMeta = {
    extractionMode: fast.extractionMode === "limited" ? "limited" : fast.extractionMode,
    browserUsed: false,
    browserReason: null,
    fastExtractorConfidence: fast.confidence,
    fallbackTriggered: gate.fallbackTriggered,
    fallbackReason: gate.fallbackReason ?? null,
    extractDurationMs: Date.now() - extractStarted,
  };

  if (gate.accept) {
    return {
      form: first,
      meta,
      html: params.html,
      finalUrl: params.finalUrl,
    };
  }

  const browser = await fetchHtmlWithExtractBrowser(params.finalUrl || params.formUrl);
  if (!browser.ok) {
    meta.browserUsed = true;
    meta.browserReason = `fallback_failed:${browser.reason}`;
    meta.extractionMode =
      first.questions.length > 0 ? meta.extractionMode : "limited";
    meta.extractDurationMs = Date.now() - extractStarted;
    return {
      form: first,
      meta,
      html: params.html,
      finalUrl: params.finalUrl,
    };
  }

  const second = await extractOnce(
    params.platform,
    params.formUrl,
    browser.html,
    browser.finalUrl,
  );
  meta.browserUsed = true;
  meta.browserReason = gate.fallbackReason || "confidence_gate";
  meta.extractionMode = "browser_fallback";
  meta.extractDurationMs = Date.now() - extractStarted;

  // Accuracy: never accept a weaker extraction than the fast path.
  const preferSecond =
    second.questions.length > first.questions.length ||
    (second.questions.length === first.questions.length &&
      countPersonal(second) >= countPersonal(first) &&
      !second.isLimited);

  return {
    form: preferSecond ? second : first,
    meta: preferSecond
      ? meta
      : {
          ...meta,
          browserReason: `${meta.browserReason}|kept_fast_richer`,
          extractionMode:
            first.questions.length > 0
              ? params.platform === "generic"
                ? "fast_static"
                : "platform_parser"
              : "browser_fallback",
        },
    html: preferSecond ? browser.html : params.html,
    finalUrl: preferSecond ? browser.finalUrl : params.finalUrl,
  };
}
