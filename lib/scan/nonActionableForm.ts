import type { NormalizedForm, ScanReport } from "@/lib/types/scan";

/** Access/closed signals — keep specific; avoid matching extractor trace noise. */
const NON_ACTIONABLE_RE =
  /응답이\s*종료|설문이\s*종료|응답\s*기간이?\s*종료|응답이\s*마감|더\s*이상\s*응답|마감된\s*설문|종료된\s*(모아폼|설문|Google)|모아폼\s*응답이\s*종료|네이버폼\s*응답이\s*종료|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed|비공개|page\s+not\s+found|찾을\s*수\s*없|로그인\s*필요|access\s*denied|접근\s*권한|권한\s*없음|접근이\s*제한|로그인이\s*필요/i;

/** Ended / closed response window (not login/private-only). */
const ENDED_SURVEY_RE =
  /응답이\s*종료|설문이\s*종료|종료된\s*(모아폼|설문|Google)|모아폼\s*응답이\s*종료|네이버폼\s*응답이\s*종료|응답\s*기간이?\s*종료|응답이\s*마감|더\s*이상\s*응답|마감된\s*설문|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed/i;

/** Generic limited copy — must not imply the survey ended. */
export const NON_ACTIONABLE_LIMITED_MESSAGE =
  "이 설문은 응답이 종료되었거나 접근이 제한되어 진단이 제한되었습니다.";

export const ENDED_SURVEY_HEADLINE = "종료된 설문은 분석 대상이 아닙니다";

export const LOGIN_RESTRICTED_HEADLINE =
  "로그인이 필요해 문항을 확인할 수 없습니다";

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
 * Platform parsers report these when static/API extraction found a shell but
 * no questions — existing browser fallback should still run. Do not let random
 * marketing/footer copy in the HTML (e.g. "찾을 수 없", "접근 제한") override.
 */
const RECOVERABLE_DYNAMIC_LIMITED_RE =
  /JavaScript\s*실행\s*후\s*문항이\s*로딩|fetch\s*기반\s*추출이\s*제한|문항을\s*자동으로\s*읽지\s*못했|문항\s*또는\s*입력\s*필드를\s*자동으로\s*확인하지\s*못했|확인하지\s*못했습니다|문항\s*후보를\s*찾지\s*못했|동적(?:으로)?\s*로딩|MOAFORM_DYNAMIC_RENDERING|MOAFORM_QUESTIONS_NOT_FOUND|구조를\s*자동으로\s*해석하지\s*못했|HTML에서\s*질문을\s*확인하지\s*못했/i;

export function isRecoverableDynamicLimitedReason(
  reason: string | null | undefined,
): boolean {
  return RECOVERABLE_DYNAMIC_LIMITED_RE.test(reason || "");
}

function formLooksRecoverableDynamic(
  form: Pick<NormalizedForm, "limitedReason" | "metadata">,
): boolean {
  if (isRecoverableDynamicLimitedReason(form.limitedReason)) return true;
  return isRecoverableDynamicLimitedReason(limitedContextText(form));
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
  const questionCount = form.questions?.length || 0;
  if (questionCount > 0 && !form.isLimited) return false;

  // Recoverable JS shells first — do not let loginRequired false-positives
  // (e.g. bare "login" in SPA bundles) or HTML chrome block browser fallback.
  if (formLooksRecoverableDynamic(form)) {
    return false;
  }

  if (form.loginRequired) return true;

  // Explicit ended/closed on the form reason — skip browser even without HTML.
  if (textLooksEndedSurvey(form.limitedReason || "")) return true;

  const text = limitedContextText(form, [html.slice(0, 8000)]);

  // Only ended / closed / private / login / permission signals skip browser.
  // Zero-question + isLimited alone is NOT enough — JS-dynamic Naver/Moaform
  // shells must reach the existing Puppeteer extract-only fallback.
  if (textLooksNonActionable(text)) return true;

  return false;
}

export function shouldSkipBrowserFallback(
  form: NormalizedForm,
  html = "",
): boolean {
  if (formLooksRecoverableDynamic(form)) {
    return false;
  }
  return isNonActionableLimitedForm(form, html);
}

/** True when the survey response window is closed/ended. */
export function isAccessRestrictedReport(
  report: Pick<
    ScanReport,
    "limitedReason" | "summary" | "form" | "limitationReasons"
  >,
): boolean {
  if (report.form?.loginRequired) return true;
  const text = [
    report.limitedReason || "",
    report.form?.limitedReason || "",
    report.summary || "",
    ...(report.limitationReasons ?? []),
  ].join(" ");
  return /로그인\s*또는\s*접근|로그인이\s*필요|로그인\s*필요|접근\s*권한이\s*필요/i.test(
    text,
  );
}

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
