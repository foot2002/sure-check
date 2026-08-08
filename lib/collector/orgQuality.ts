/**
 * Lightweight org/academic quality heuristics for collector KPI sampling.
 * Not a full institution classifier — title/description/query text only.
 */

export type CollectorOrgQualityClass =
  | "public"
  | "company"
  | "university_official"
  | "individual_or_academic"
  | "unknown";

const PUBLIC_RE =
  /(공공기관|공기업|지방공기업|지자체|시청|군청|구청|도청|교육청|공단|공사|진흥원|재단|위원회|보건소|복지관|체육회|관광재단|문화재단|산하기관|정부|행정복지)/i;

const COMPANY_RE =
  /(기업|주식회사|㈜|\(주\)|브랜드|프랜차이즈|쇼핑몰|이벤트\s*응모|경품|고객\s*만족|CSAT|금융|은행|카드사|회원\s*모집)/i;

const UNI_OFFICIAL_RE =
  /(산학협력단|대학\s*본부|학생지원|입학처|경력개발|교무처|연구처|공식\s*센터|사업단|평생교육원)/i;

const ACADEMIC_RE =
  /(논문|석사|박사|학위|졸업작품|연구\s*참여자|연구대상자|대학원생|개인\s*연구|과제\s*설문|졸업\s*논문|지도교수)/i;

export function classifyCollectorOrgQuality(input: {
  title?: string | null;
  description?: string | null;
  searchQuery?: string | null;
}): CollectorOrgQualityClass {
  const text = [input.title, input.description, input.searchQuery]
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) return "unknown";

  // Academic exclusion wins unless clear official-university org signal.
  if (ACADEMIC_RE.test(text) && !UNI_OFFICIAL_RE.test(text)) {
    return "individual_or_academic";
  }
  if (UNI_OFFICIAL_RE.test(text)) return "university_official";
  if (PUBLIC_RE.test(text)) return "public";
  if (COMPANY_RE.test(text)) return "company";
  return "unknown";
}

export function isOfficialOrgQuality(
  c: CollectorOrgQualityClass,
): boolean {
  return (
    c === "public" || c === "company" || c === "university_official"
  );
}
