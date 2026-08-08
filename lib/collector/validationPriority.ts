/**
 * Validation priority for org_v1.1 inline page checks.
 * Higher score → validate sooner. Never used as a delete filter.
 */

export type ValidationPriorityInput = {
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  searchQuery?: string | null;
  surveyTitle?: string | null;
  candidateUrl?: string | null;
};

const HIGH_PUBLIC =
  /(시청|군청|구청|도청|교육청|공단|공사|진흥원|재단|위원회|보건소|복지관|체육회|관광재단|문화재단|지자체|공공기관|공기업|행정복지)/i;
const HIGH_COMPANY =
  /(주식회사|㈜|\(주\)|브랜드|프랜차이즈|공식몰|고객센터|이벤트\s*응모)/i;
const HIGH_UNI =
  /(산학협력단|입학처|학생지원|평생교육원|대학\s*본부|공식\s*사업단)/i;
const LOW_ACADEMIC =
  /(논문|석사|박사|학위|졸업작품|연구\s*참여자|연구대상자|대학원생|개인\s*연구|과제\s*설문|지도교수|개인\s*프로젝트)/i;

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Score roughly -50…+100. Default 0.
 */
export function scoreValidationPriority(
  input: ValidationPriorityInput,
): number {
  let score = 0;
  const text = [
    input.sourceTitle,
    input.searchQuery,
    input.surveyTitle,
  ]
    .filter(Boolean)
    .join(" ");
  const host = hostOf(input.sourceUrl);

  if (host.endsWith(".go.kr") || host.includes(".go.kr.")) score += 40;
  if (host.endsWith(".or.kr") || host.includes(".or.kr.")) score += 25;
  if (host.endsWith(".ac.kr") || host.includes(".ac.kr.")) {
    // University domain — could be official or individual; slight boost only
    score += 8;
  }
  if (
    host.includes("blog.naver.com") ||
    host.includes("cafe.naver.com") ||
    host.includes("tistory.com")
  ) {
    score -= 5;
  }

  if (HIGH_PUBLIC.test(text)) score += 30;
  if (HIGH_COMPANY.test(text)) score += 20;
  if (HIGH_UNI.test(text)) score += 18;
  if (LOW_ACADEMIC.test(text) && !HIGH_UNI.test(text)) score -= 40;

  if (/forms\.gle|docs\.google\.com\/forms|form\.naver\.com|moaform\.com\/q/i.test(
    input.searchQuery || "",
  )) {
    score += 5;
  }

  return score;
}
