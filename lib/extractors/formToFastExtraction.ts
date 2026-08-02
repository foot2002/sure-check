import { detectHtmlSignals } from "@/lib/extractors/confidenceGate";
import type { FastExtractionResult } from "@/lib/extractors/fastExtractionTypes";
import type { NormalizedForm } from "@/lib/types/scan";

/**
 * Wrap a NormalizedForm from platform parsers into FastExtractionResult.
 */
export function formToFastExtractionResult(
  form: NormalizedForm,
  html = "",
  extractionMode: FastExtractionResult["extractionMode"] = "platform_parser",
): FastExtractionResult {
  const htmlSignals = detectHtmlSignals(html);
  const pages = form.pages?.length ?? 0;
  const hasMultiFromPages = pages > 1;
  const privacyText =
    form.notices?.privacyNotice ||
    form.metadata?.noticeTexts?.find((t) => /개인정보|privacy/i.test(t)) ||
    "";

  const confidence = form.confidence ?? (form.isLimited ? "none" : "medium");

  return {
    ok: !form.isLimited && form.questions.length > 0,
    platform: form.platform || "unknown",
    extractionMode: form.isLimited ? "limited" : extractionMode,
    confidence,
    title: form.title,
    operatorName: form.metadata?.operatorHint,
    description: form.notices?.description,
    privacyNoticeText: privacyText || undefined,
    questions: form.questions || [],
    limitations: [
      ...(form.limitedReason ? [form.limitedReason] : []),
      ...(form.metadata?.extractionWarnings || []),
    ],
    signals: {
      hasTitle: Boolean(form.title?.trim()),
      hasPrivacyNotice: Boolean(
        form.hasPrivacyNotice || privacyText || form.notices?.privacyNotice,
      ),
      hasRequiredMarkers: (form.questions || []).some((q) => q.required),
      hasNextButton: htmlSignals.hasNextButton,
      hasMultiPageSignal:
        htmlSignals.hasMultiPageSignal ||
        hasMultiFromPages ||
        Boolean(form.partialScan && pages > 1),
      hasBranchingSignal:
        htmlSignals.hasBranchingSignal || Boolean(form.branchDetected),
    },
    form,
  };
}
