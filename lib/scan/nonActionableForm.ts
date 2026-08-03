import type { NormalizedForm } from "@/lib/types/scan";

const NON_ACTIONABLE_RE =
  /종료|응답\s*기간|응답이\s*마감|더\s*이상\s*응답|설문이\s*종료|closed|private|비공개|not\s*found|로그인|권한|access\s*denied|접근\s*권한|권한\s*없음|접근이\s*제한|로그인\s*필요/i;

export const NON_ACTIONABLE_LIMITED_MESSAGE =
  "이 설문은 응답이 종료되었거나 접근이 제한되어 진단이 제한되었습니다.";

export function textLooksNonActionable(text: string): boolean {
  return NON_ACTIONABLE_RE.test(text || "");
}

/**
 * Ended / private / login-gated surveys must not trigger browser fallback.
 */
export function isNonActionableLimitedForm(
  form: Pick<
    NormalizedForm,
    "isLimited" | "limitedReason" | "loginRequired" | "metadata" | "questions"
  >,
  html = "",
): boolean {
  if (form.loginRequired) return true;

  const text = [
    form.limitedReason || "",
    ...(form.metadata?.extractionWarnings ?? []),
    form.metadata?.failureReason || "",
    form.metadata?.operatorHint || "",
    html.slice(0, 8000),
  ].join(" ");

  if (textLooksNonActionable(text)) return true;

  if (
    form.isLimited &&
    (form.questions?.length || 0) === 0 &&
    Boolean(form.limitedReason?.trim())
  ) {
    return true;
  }

  return false;
}

export function shouldSkipBrowserFallback(
  form: NormalizedForm,
  html = "",
): boolean {
  return isNonActionableLimitedForm(form, html);
}
