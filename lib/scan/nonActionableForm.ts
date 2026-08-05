import type { NormalizedForm, ScanReport } from "@/lib/types/scan";

/** Access/closed signals — keep specific; avoid matching extractor trace noise. */
const NON_ACTIONABLE_RE =
  /응답이\s*종료|설문이\s*종료|응답\s*기간이?\s*종료|응답이\s*마감|더\s*이상\s*응답|마감된\s*설문|종료된\s*(모아폼|설문|Google)|모아폼\s*응답이\s*종료|네이버폼\s*응답이\s*종료|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed|비공개|page\s+not\s+found|찾을\s*수\s*없|로그인\s*필요|access\s*denied|접근\s*권한|권한\s*없음|접근이\s*제한|로그인이\s*필요/i;

/** Ended / closed response window (not login/private-only). */
const ENDED_SURVEY_RE =
  /응답이\s*종료|설문이\s*종료|종료된\s*(모아폼|설문|Google)|모아폼\s*응답이\s*종료|네이버폼\s*응답이\s*종료|응답\s*기간이?\s*종료|응답이\s*마감|더\s*이상\s*응답|마감된\s*설문|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed/i;

/** Generic limited copy — must not imply the survey ended. */
export const NON_ACTIONABLE_LIMITED_MESSAGE =
  "이 설문은 접근이 제한되어 진단이 제한되었습니다.";

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
    ...extra,
  ].join(" ");
}

/**
 * Ended / private / login-gated surveys must not trigger browser fallback.
 * Forms with extracted questions (and not limited) are always actionable.
 */
export function isNonActionableLimitedForm(
  form: Pick<
    NormalizedForm,
    "isLimited" | "limitedReason" | "loginRequired" | "metadata" | "questions"
  >,
  html = "",
): boolean {
  if (form.loginRequired) return true;

  const questionCount = form.questions?.length || 0;
  if (questionCount > 0 && !form.isLimited) return false;

  const text = limitedContextText(form, [html.slice(0, 8000)]);

  if (textLooksNonActionable(text)) return true;

  if (
    form.isLimited &&
    questionCount === 0 &&
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
  // Extracted questions mean the response window is still open for diagnosis.
  if ((report.form?.questions?.length || 0) > 0) return false;

  const text = limitedContextText(report.form ?? { limitedReason: "" }, [
    report.limitedReason || "",
    report.summary || "",
    ...(report.limitationReasons ?? []),
  ]);
  return textLooksEndedSurvey(text);
}
