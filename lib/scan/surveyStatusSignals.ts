/**
 * Shared closed / login URL+HTML signals for Collector page validation
 * and Diagnosis extractors. Keep markers aligned — do not fork heuristics.
 */

/** Google closedform + Moaform /closed answer URLs. */
export function isClosedSurveyUrl(url: string): boolean {
  const lower = (url || "").toLowerCase();
  if (!lower) return false;
  if (/\/closedform(?:\/|$|\?|#)/i.test(lower)) return true;
  if (/answer\.moaform\.com\/answers\/[^/]+\/closed/i.test(lower)) return true;
  if (/\/closed(?:\/|$|\?|#)/i.test(lower) && /moaform/i.test(lower)) {
    return true;
  }
  if (/[?&]status=closed\b/i.test(lower) && /moaform/i.test(lower)) {
    return true;
  }
  return false;
}

/** Phrase-level closed markers (Diagnosis Naver/Moa/Google + Collector). */
export const SHARED_CLOSED_HTML_RE =
  /no longer accepting responses|this\s*form\s*is\s*no\s*longer\s*accepting|form\s*(is\s*)?closed|응답을\s*더\s*이상\s*받지|더\s*이상\s*응답|응답\s*접수.?종료|응답이\s*마감|응답이\s*종료|설문이\s*종료|응답\s*기간이?\s*종료|마감된\s*설문|종료된\s*(모아폼|설문|Google)|네이버폼\s*응답이\s*종료|모아폼\s*응답이\s*종료|closedform/i;

export function htmlLooksClosedSurvey(
  html: string,
  title: string | null | undefined,
  url = "",
): boolean {
  if (isClosedSurveyUrl(url)) return true;
  const blob = `${title || ""}\n${(html || "").slice(0, 30_000)}`;
  return SHARED_CLOSED_HTML_RE.test(blob);
}

/** Login / permission — phrase-level to avoid SPA "login" false positives. */
export function htmlLooksLoginRequired(
  html: string,
  title: string | null | undefined,
): boolean {
  const blob = `${title || ""}\n${(html || "").slice(0, 20_000)}`.toLowerCase();
  return (
    (/sign[\s-]?in|log[\s-]?in|로그인|accounts\.google\.com\/v3\/signin|nid\.naver\.com\/nidlogin/i.test(
      blob,
    ) &&
      /password|비밀번호|signin|접근\s*권한|권한이\s*필요|로그인이\s*필요/i.test(
        blob,
      )) ||
    /로그인이\s*필요|로그인\s*후\s*이용|로그인\s*또는\s*접근|접근\s*권한이\s*없/i.test(
      blob,
    )
  );
}
