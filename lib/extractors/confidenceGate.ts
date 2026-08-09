import type {
  ConfidenceGateDecision,
  FallbackReason,
  FastExtractionResult,
} from "@/lib/extractors/fastExtractionTypes";
import {
  isNonActionableLimitedForm,
  isRecoverableDynamicLimitedReason,
} from "@/lib/scan/nonActionableForm";

const MULTI_PAGE_RE =
  /다음|계속|다음\s*페이지|next|continue|섹션|section/i;
const BRANCH_RE = /분기|조건|해당되는|해당\s*없음|skip logic|branch/i;

/**
 * Decide whether a fast/platform parser result is safe to use without browser fallback.
 * Accuracy over speed: any uncertainty triggers fallback — except closed/private/login forms.
 */
export function evaluateConfidenceGate(
  fast: FastExtractionResult,
  baseline?: {
    questionCount?: number;
    personalInfoCount?: number;
    sensitiveCount?: number;
    highRiskCount?: number;
  },
): ConfidenceGateDecision {
  // Closed/login/private can skip browser — but JS-dynamic recoverable shells
  // must never be accepted as final (confidenceGate previously short-circuited
  // on loginRequired false-positives and blocked fallback).
  if (
    fast.form &&
    isNonActionableLimitedForm(fast.form) &&
    !isRecoverableDynamicLimitedReason(fast.form.limitedReason) &&
    !isRecoverableDynamicLimitedReason(
      [
        fast.form.limitedReason || "",
        ...(fast.form.metadata?.extractionWarnings ?? []),
        fast.form.metadata?.failureReason || "",
      ].join(" "),
    )
  ) {
    return {
      accept: true,
      fallbackTriggered: false,
      fallbackReason: undefined,
      reasons: [],
    };
  }

  const reasons: FallbackReason[] = [];
  const questions = fast.questions || [];

  if (!fast.ok || questions.length === 0) {
    reasons.push("zero_questions");
  }

  if (fast.confidence === "low" || fast.confidence === "none") {
    reasons.push("low_confidence");
  }

  // Multi-page / next-button: force fallback only when confidence is not high.
  // Platform parsers (e.g. Google FB_PUBLIC_LOAD_DATA_) often already extracted all pages.
  if (
    (fast.signals.hasMultiPageSignal || fast.signals.hasNextButton) &&
    fast.confidence !== "high"
  ) {
    reasons.push("multi_page_signal");
  }

  if (
    (fast.signals.hasBranchingSignal || fast.form?.branchDetected) &&
    fast.confidence !== "high"
  ) {
    reasons.push("branching_signal");
  }

  const privacyLikely =
    /개인정보|privacy|수집\s*이용|동의/i.test(
      `${fast.title || ""} ${fast.description || ""} ${fast.form?.metadata?.noticeTexts?.join(" ") || ""}`,
    ) || Boolean(fast.form?.hasPrivacyNotice);
  if (
    privacyLikely &&
    !fast.privacyNoticeText &&
    !fast.form?.notices?.privacyNotice &&
    !(fast.form?.metadata?.noticeTexts?.length)
  ) {
    reasons.push("missing_privacy_notice");
  }

  const optionHeavy = questions.filter((q) => {
    const labelLen = (q.label || q.questionText || "").trim().length;
    const optionLen = (q.options || []).join("").length;
    return labelLen < 2 && optionLen > 10;
  }).length;
  if (questions.length > 0 && optionHeavy / questions.length >= 0.5) {
    reasons.push("invalid_structure");
  }

  if (
    typeof baseline?.questionCount === "number" &&
    baseline.questionCount > 0 &&
    questions.length < Math.max(1, Math.floor(baseline.questionCount * 0.6))
  ) {
    reasons.push("question_count_drop");
  }

  const personal = questions.filter((q) => q.hasPersonalData).length;
  const sensitive = questions.filter((q) =>
    (q.detectedCategories || []).some((c) => String(c).startsWith("sensitive_")),
  ).length;
  const highRisk = questions.filter((q) =>
    (q.detectedCategories || []).some((c) =>
      /resident_registration|passport|driver_license|foreign_registration|financial_account|authentication_secret|unique_identifier|id_document/.test(
        String(c),
      ),
    ),
  ).length;

  if (
    (typeof baseline?.personalInfoCount === "number" &&
      baseline.personalInfoCount > 0 &&
      personal < baseline.personalInfoCount) ||
    (typeof baseline?.sensitiveCount === "number" &&
      baseline.sensitiveCount > 0 &&
      sensitive < baseline.sensitiveCount) ||
    (typeof baseline?.highRiskCount === "number" &&
      baseline.highRiskCount > 0 &&
      highRisk < baseline.highRiskCount)
  ) {
    reasons.push("risk_detection_drop");
  }

  const unique = [...new Set(reasons)];
  if (unique.length > 0) {
    return {
      accept: false,
      fallbackTriggered: true,
      fallbackReason: unique[0],
      reasons: unique,
    };
  }

  return {
    accept: true,
    fallbackTriggered: false,
    reasons: [],
  };
}

export function detectHtmlSignals(html: string): {
  hasNextButton: boolean;
  hasMultiPageSignal: boolean;
  hasBranchingSignal: boolean;
} {
  return {
    hasNextButton: MULTI_PAGE_RE.test(html),
    hasMultiPageSignal:
      MULTI_PAGE_RE.test(html) ||
      /pageBreak|page_break|section_header/i.test(html),
    hasBranchingSignal: BRANCH_RE.test(html),
  };
}
