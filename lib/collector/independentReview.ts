/**
 * Independent evidence review for A_PRIORITY quality gates.
 * Does NOT use classifyOrganizationLowCost as ground truth.
 */

import type { CollectorOrgQualityClass } from "@/lib/collector/orgQuality";

export type EvidenceReviewInput = {
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  snippet?: string | null;
  surveyTitle?: string | null;
  pageTitle?: string | null;
  searchQuery?: string | null;
};

export type EvidenceReviewResult = {
  label: CollectorOrgQualityClass;
  evidence: string[];
  /** Personal blog/cafe may share an official form — owner vs source */
  sourceIsPersonalShare: boolean;
  surveyOwnerLikelyOfficial: boolean;
};

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const ACADEMIC =
  /(석사|박사|학위|논문|졸업작품|졸업논문|대학원생|연구\s*참여자|연구대상자|연구\s*목적|사례비|지도교수|OO학과|개인\s*연구|학생\s*과제|(?<![가-힣])(담당\s*)?교수(?![가-힣]))/i;
const UNI_OFFICIAL =
  /(산학협력단|입학처|학생지원|평생교육원|교육혁신|대학\s*본부|공식\s*사업단|교무처|RISE\s*사업단|사업단|부속기관)/i;
const PUBLIC =
  /(시청|군청|구청|도청|교육청|공단|공사|진흥원|재단|위원회|보건소|체육회|국립|구정|시정|공공기관|공기업|행정복지|주민센터|코트라|KOTRA|공공외교|중소벤처|마사회|청년축제|지자체)/i;
/** Prefer explicit admin names — avoid matching 회원구분 → …구 */
const DISTRICT =
  /([가-힣]{1,4}(?:특별시|광역시|특별자치시|특별자치도))|([가-힣]{1,4}[시군구](?:청|의회|주민센터|만족도|설문|신청|모집))|(중랑구|동대문구|성동구|강남구|송파구|마포구|은평구|서초구|용산구|종로구|영등포구|노원구|도봉구|양천용|양천구|강서구|구로구|금천구|동작구|관악구|서대문구|성북구|강북구|광진구)/i;
const COMPANY_LEGAL = /(주식회사|㈜|\(주\)|유한회사)/i;
const COMPANY_BRAND =
  /(메가박스|CGV|롯데시네마|뱅크샐러드|산돌|카카오|네이버|쿠팡|배민|토스|신한|국민은행|현대차|삼성|LG|스타벅스|무신사|컬리|야놀자|여기어때|이마트|올리브영)/i;
const COMPANY_ACTIVITY =
  /(고객\s*만족|서비스\s*만족|상담\s*신청|체험\s*신청|이벤트\s*응모|경품|회원\s*대상|브랜드\s*설문|채용\s*박람|사전\s*등록|인턴\s*지원)/i;
const PERSONAL_SHARE_HOST =
  /(blog\.naver\.com|cafe\.naver\.com|tistory\.com|instagram\.com|facebook\.com)/i;
const PERSONAL_PLEA =
  /(도와주세요|부탁드려요|설문\s*좀|3분이면|2분이면|스터디\s*설문)/i;

/**
 * Human-facing evidence label for canary quality review.
 */
export function evidenceReviewLabel(
  input: EvidenceReviewInput,
): EvidenceReviewResult {
  const evidence: string[] = [];
  const host = hostOf(input.sourceUrl);
  const text = [
    input.pageTitle,
    input.surveyTitle,
    input.sourceTitle,
    input.snippet,
  ]
    .filter(Boolean)
    .join(" ");

  const sourceIsPersonalShare = PERSONAL_SHARE_HOST.test(host);
  if (sourceIsPersonalShare) evidence.push("source_personal_host");

  // Personal gift-card / study pleas before brand matching
  if (
    PERSONAL_PLEA.test(text) &&
    !PUBLIC.test(text) &&
    !COMPANY_LEGAL.test(text)
  ) {
    evidence.push("personal_plea");
    return {
      label: "individual_or_academic",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: false,
    };
  }

  // Academic before official unless clear uni-official
  if (ACADEMIC.test(text) && !UNI_OFFICIAL.test(text)) {
    evidence.push("academic_language");
    return {
      label: "individual_or_academic",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: false,
    };
  }

  if (host.endsWith(".go.kr") || host.includes(".go.kr.")) {
    evidence.push("host_go_kr");
    return {
      label: "public",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: true,
    };
  }

  if (host.endsWith(".ac.kr") || host.includes(".ac.kr.")) {
    if (UNI_OFFICIAL.test(text) || /수요\s*조사|사업\s*계획|재학생|입학/.test(text)) {
      evidence.push("host_ac_kr", "uni_context");
      return {
        label: "university_official",
        evidence,
        sourceIsPersonalShare,
        surveyOwnerLikelyOfficial: true,
      };
    }
  }

  if (
    host.endsWith(".or.kr") ||
    host.includes(".or.kr.") ||
    /코트라|KOTRA/i.test(text)
  ) {
    if (PUBLIC.test(text) || /사업\s*신청|설명회|무역|투자|공단|진흥/.test(text)) {
      evidence.push("public_or_kr");
      return {
        label: "public",
        evidence,
        sourceIsPersonalShare,
        surveyOwnerLikelyOfficial: true,
      };
    }
  }

  if (PUBLIC.test(text) || (DISTRICT.test(text) && /만족도|신청|설문|의견|모집/.test(text))) {
    if (PUBLIC.test(text)) evidence.push("public_title");
    if (DISTRICT.test(text)) evidence.push("district_title");
    return {
      label: "public",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: true,
    };
  }

  if (UNI_OFFICIAL.test(text)) {
    evidence.push("uni_official_title");
    return {
      label: "university_official",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: true,
    };
  }

  if (
    COMPANY_LEGAL.test(text) ||
    COMPANY_BRAND.test(text) ||
    COMPANY_ACTIVITY.test(text) ||
    /\.co\.kr$/i.test(host)
  ) {
    if (COMPANY_BRAND.test(text)) evidence.push("brand_in_title");
    if (COMPANY_LEGAL.test(text)) evidence.push("legal_entity");
    if (COMPANY_ACTIVITY.test(text)) evidence.push("company_activity");
    if (/\.co\.kr$/i.test(host)) evidence.push("host_co_kr");
    return {
      label: "company",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: true,
    };
  }

  if (host.endsWith(".or.kr") || host.includes(".or.kr.")) {
    evidence.push("host_or_kr");
    return {
      label: "unknown",
      evidence,
      sourceIsPersonalShare,
      surveyOwnerLikelyOfficial: false,
    };
  }

  evidence.push("insufficient_evidence");
  return {
    label: "unknown",
    evidence,
    sourceIsPersonalShare,
    surveyOwnerLikelyOfficial: false,
  };
}

/** Soft fetch of form page title (best-effort, short timeout). */
export async function fetchPageTitleSoft(
  url: string,
  timeoutMs = 5000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "sure-check-collector-review/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 80_000);
    const m =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m?.[1]?.replace(/\s+/g, " ").trim() || null;
  } catch {
    return null;
  }
}
