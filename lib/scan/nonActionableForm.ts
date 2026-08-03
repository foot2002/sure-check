import type { NormalizedForm, ScanReport } from "@/lib/types/scan";

const NON_ACTIONABLE_RE =
  /종료|응답\s*기간|응답이\s*마감|더\s*이상\s*응답|설문이\s*종료|closed|private|비공개|not\s*found|로그인|권한|access\s*denied|접근\s*권한|권한\s*없음|접근이\s*제한|로그인\s*필요/i;

/** Ended / closed response window (not login/private-only). */
const ENDED_SURVEY_RE =
  /응답이\s*종료|설문이\s*종료|종료된\s*(모아폼|설문|Google)|모아폼\s*응답이\s*종료|네이버폼\s*응답이\s*종료|응답\s*기간이?\s*종료|응답이\s*마감|더\s*이상\s*응답|마감된\s*설문|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed/i;

export const NON_ACTIONABLE_LIMITED_MESSAGE =
  "이 설문은 응답이 종료되었거나 접근이 제한되어 진단이 제한되었습니다.";

export const ENDED_SURVEY_HEADLINE = "종료된 설문은 분석 대상이 아닙니다";

export function textLooksNonActionable(text: string): boolean {
  return NON_ACTIONABLE_RE.test(text || "");
}

export function textLooksEndedSurvey(text: string): boolean {
  return ENDED_SURVEY_RE.test(text || "");
}

function limitedContextText(
  form:
    | Pick<NormalizedForm, "limitedReason" | "metadata" | "loginRequired">
    | null
    | undefined,
  extra: string[] = [],
): string {
  return [
    form?.limitedReason || "",
    ...(form?.metadata?.extractionWarnings ?? []),
    form?.metadata?.failureReason || "",
    form?.metadata?.operatorHint || "",
    ...extra,
  ].join(" ");
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

  const text = limitedContextText(form, [html.slice(0, 8000)]);

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

/** True when the survey response window is closed/ended. */
export function isEndedSurveyReport(
  report: Pick<
    ScanReport,
    "limitedReason" | "summary" | "form" | "debug" | "limitationReasons"
  >,
): boolean {
  if (report.form?.loginRequired) return false;
  if (report.debug?.closedForm) return true;
  const text = limitedContextText(report.form ?? { limitedReason: "" }, [
    report.limitedReason || "",
    report.summary || "",
    ...(report.limitationReasons ?? []),
  ]);
  // Mirror buildScanDebug.detectClosedForm — any "종료" in limited reasons.
  if (/(종료)/.test(text) && !/로그인\s*필요|접근\s*권한/.test(text)) {
    return true;
  }
  return textLooksEndedSurvey(text);
}
