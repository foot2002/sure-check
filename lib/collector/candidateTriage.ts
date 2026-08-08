/**
 * org_v1.2 low-cost candidate triage (before page open).
 * Splits A_PRIORITY / B_PRIORITY / C_ARCHIVE for validation backlog control.
 */

import type { CollectorOrgQualityClass } from "@/lib/collector/orgQuality";
import type { CollectorSourceType } from "@/lib/collector/types";

export type RecencyClass =
  | "recent_high"
  | "recent_possible"
  | "unknown"
  | "likely_old";

export type TriageQueue = "A_PRIORITY" | "B_PRIORITY" | "C_ARCHIVE";

export type TriageInput = {
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  description?: string | null;
  surveyTitle?: string | null;
  searchQuery?: string | null;
  sourceType?: CollectorSourceType | null;
  sourcePublishedAt?: string | null;
  /** Whether this hit came from a date-sorted search. */
  sortMode?: "date" | "sim" | null;
  firstSeenThisRun?: boolean;
};

export type TriageResult = {
  organization: CollectorOrgQualityClass;
  organizationScore: number;
  organizationSignals: string[];
  recency: RecencyClass;
  recencyScore: number;
  recencySignals: string[];
  queue: TriageQueue;
  queueReason: string;
};

const PUBLIC_TEXT =
  /(공공기관|공기업|지방공기업|지자체|시청|군청|구청|도청|교육청|공단|공사|진흥원|재단|위원회|보건소|복지관|체육회|관광재단|문화재단|산하기관|정부|행정복지|주민센터|시의회|국립|도서관|구정|시정|군정|중소벤처|기업마당|코트라|KOTRA|공공외교)/i;

/** District / city names commonly used without "구청" suffix — avoid 회원구분 false hits */
const PUBLIC_DISTRICT =
  /([가-힣]{1,4}(?:특별시|광역시|특별자치시|특별자치도))|([가-힣]{1,4}[시군구](?:청|의회|주민센터|만족도|설문|신청|모집))|(중랑구|동대문구|성동구|강남구|서초구|송파구|마포구|용산구|종로구|영등포구|노원구|도봉구|은평구|양천구|강서구|구로구|금천구|동작구|관악구|서대문구|성북구|강북구|광진구)/i;

const COMPANY_TEXT =
  /(주식회사|㈜|\(주\)|㈜|유한회사|브랜드|프랜차이즈|쇼핑몰|공식몰|고객센터|이벤트\s*응모|경품\s*응모|금융|은행|카드사|간편결제|고객만족|CSAT|체험단|상담\s*신청|예약\s*신청|서비스\s*신청|마케팅|공식\s*채용)/i;

const COMPANY_LEGAL_ONLY = /(주식회사|㈜|\(주\)|유한회사)/i;

/** Well-known consumer brands / services often missing 주식회사 */
const COMPANY_BRAND =
  /(메가박스|CGV|롯데시네마|뱅크샐러드|산돌|카카오|네이버|쿠팡|배달의민족|배민|토스|신한|국민은행|KB|현대차|기아|삼성|LG|SK|CJ|이마트|올리브영|스타벅스|스벅|요기요|야놀자|여기어때|무신사|29CM|컬리|마켓컬리|당근|토스뱅크|카카오뱅크|라인|유튜브|넷플릭스|디즈니|렉서스|현대카드|우리은행|하나은행|기업은행)/i;

const UNI_OFFICIAL_TEXT =
  /(산학협력단|대학\s*본부|학생지원|입학처|경력개발|교무처|연구처|공식\s*센터|사업단|평생교육원|대학교\s*공식|교육혁신)/i;

const ACADEMIC_TEXT =
  /(논문|석사|박사|학위|졸업작품|연구\s*참여자|연구대상자|대학원생|개인\s*연구|과제\s*설문|졸업\s*논문|지도교수|개인\s*프로젝트|학생\s*과제|설문\s*사례비|연구\s*목적|학위논문|졸업\s*연구|[가-힣]{2,12}대학교\s*[가-힣]{2,20}학과\s*[가-힣]{2,4}\s*(입니다|입니다\.|입니다!)|OO대학교|oo대학교)/i;

/** Soft demotion when academic language coexists with weak official hints — score down, prefer not hard-delete. */
const ACADEMIC_SOFT =
  /(연구\s*참여|피험자|응답자\s*모집|익명\s*설문|학부생|석·박사|석박사)/i;

const PERSONAL_PLEA =
  /(도와주세요|부탁드려요|설문\s*좀|3분이면|2분이면|기프티콘|스터디\s*설문)/i;

const PERSONAL_SHARE_HOST =
  /(blog\.naver\.com|cafe\.naver\.com|tistory\.com|instagram\.com|facebook\.com|band\.us)/i;

/** Validation order inside A_PRIORITY (likely_old last; never hard-delete by age). */
export const RECENCY_VALIDATION_ORDER: Record<RecencyClass, number> = {
  recent_high: 0,
  recent_possible: 1,
  unknown: 2,
  likely_old: 3,
};

export function compareRecencyForValidation(
  a: RecencyClass,
  b: RecencyClass,
): number {
  return RECENCY_VALIDATION_ORDER[a] - RECENCY_VALIDATION_ORDER[b];
}

const QUEUE_RANK: Record<TriageQueue, number> = {
  A_PRIORITY: 0,
  B_PRIORITY: 1,
  C_ARCHIVE: 2,
};

export function compareTriageQueue(a: TriageQueue, b: TriageQueue): number {
  return QUEUE_RANK[a] - QUEUE_RANK[b];
}

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (24 * 60 * 60 * 1000);
}

function textBlob(input: TriageInput): string {
  return [
    input.surveyTitle,
    input.sourceTitle,
    input.description,
    input.searchQuery,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Titles/snippets only — searchQuery alone must not force org labels. */
function titleBlob(input: TriageInput): string {
  return [input.surveyTitle, input.sourceTitle, input.description]
    .filter(Boolean)
    .join(" ");
}

export function classifyOrganizationLowCost(input: TriageInput): {
  organization: CollectorOrgQualityClass;
  organizationScore: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;
  const title = titleBlob(input);
  const titleOnly = [input.surveyTitle, input.sourceTitle].filter(Boolean).join(" ");
  const query = input.searchQuery || "";
  const host = hostOf(input.sourceUrl);

  if (ACADEMIC_TEXT.test(title) && !UNI_OFFICIAL_TEXT.test(title)) {
    signals.push("academic_text");
    score -= 40;
    return {
      organization: "individual_or_academic",
      organizationScore: score,
      signals,
    };
  }

  if (
    host.endsWith(".go.kr") ||
    host.includes(".go.kr.") ||
    /\.go\.kr$/.test(host)
  ) {
    signals.push("host_go_kr");
    score += 50;
    return { organization: "public", organizationScore: score, signals };
  }

  // Prefer title over description for org labels on personal share hosts.
  const orgText = PERSONAL_SHARE_HOST.test(host) ? titleOnly : title;

  if (PUBLIC_TEXT.test(orgText) || PUBLIC_DISTRICT.test(orgText)) {
    if (
      PERSONAL_SHARE_HOST.test(host) &&
      /(자격증|꿀팁|취득\s*방법|후기|스터디)/.test(titleOnly) &&
      !/(구청|시청|만족도|주민|신청\s*안내)/.test(titleOnly)
    ) {
      signals.push("personal_tip_not_org_survey");
      score -= 20;
    } else {
      if (PUBLIC_DISTRICT.test(orgText)) signals.push("district_name");
      if (PUBLIC_TEXT.test(orgText)) signals.push("public_text");
      score += 35;
      return { organization: "public", organizationScore: score, signals };
    }
  }

  if (
    (host.endsWith(".or.kr") || host.includes(".or.kr.")) &&
    PUBLIC_TEXT.test(title)
  ) {
    signals.push("host_or_kr", "public_text");
    score += 30;
    return { organization: "public", organizationScore: score, signals };
  }

  if (UNI_OFFICIAL_TEXT.test(title)) {
    signals.push("uni_official_text");
    score += 30;
    return {
      organization: "university_official",
      organizationScore: score,
      signals,
    };
  }

  if (host.endsWith(".ac.kr") || host.includes(".ac.kr.")) {
    signals.push("host_ac_kr");
    if (UNI_OFFICIAL_TEXT.test(title)) {
      score += 28;
      return {
        organization: "university_official",
        organizationScore: score,
        signals,
      };
    }
    score += 5;
  }

  // Personal gift-card / study pleas before brand matching (스벅 기프티콘 etc.)
  if (
    PERSONAL_PLEA.test(title) &&
    !PUBLIC_TEXT.test(orgText) &&
    !COMPANY_LEGAL_ONLY.test(title)
  ) {
    signals.push("personal_plea");
    score -= 25;
    return {
      organization: "individual_or_academic",
      organizationScore: score,
      signals,
    };
  }

  // Source may be personal blog/cafe; survey owner can still be a company.
  if (
    PERSONAL_SHARE_HOST.test(host) &&
    (COMPANY_BRAND.test(title) || COMPANY_TEXT.test(title))
  ) {
    signals.push("personal_source_company_owner");
    if (COMPANY_BRAND.test(title)) signals.push("company_brand");
    if (COMPANY_TEXT.test(title)) signals.push("company_text");
    score += 28;
    return { organization: "company", organizationScore: score, signals };
  }

  if (
    COMPANY_TEXT.test(title) ||
    COMPANY_BRAND.test(title) ||
    /corp\.|inc\.|\.co\.kr$/i.test(host)
  ) {
    if (COMPANY_BRAND.test(title)) signals.push("company_brand");
    if (COMPANY_TEXT.test(title)) signals.push("company_text");
    if (/\.co\.kr$/i.test(host)) signals.push("host_co_kr");
    score += 28;
    return { organization: "company", organizationScore: score, signals };
  }

  // Soft academic demotion (score down) — do not hard-delete university official.
  if (ACADEMIC_SOFT.test(title) && !UNI_OFFICIAL_TEXT.test(title)) {
    signals.push("academic_soft_demote");
    score -= 18;
  }

  // Weak query-only hints (never sole reason for official label)
  if (/공공기관|지자체|교육청|공기업|시청|구청/.test(query)) {
    signals.push("public_query_hint");
    score += 6;
  }
  if (/기업|브랜드|고객\s*만족|이벤트|상담\s*신청|체험/.test(query)) {
    signals.push("company_query_hint");
    score += 6;
  }

  if (host.endsWith(".or.kr") || host.includes(".or.kr.")) {
    signals.push("host_or_kr_alone");
    return { organization: "unknown", organizationScore: score + 8, signals };
  }

  signals.push("no_clear_org_signal");
  return { organization: "unknown", organizationScore: score, signals };
}

export function classifyRecencyLowCost(input: TriageInput): {
  recency: RecencyClass;
  recencyScore: number;
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;
  const text = textBlob(input);
  const ageDays = daysSince(input.sourcePublishedAt);

  if (ageDays != null) {
    if (ageDays <= 60) {
      signals.push("published_within_60d");
      score += 40;
    } else if (ageDays <= 180) {
      signals.push("published_within_180d");
      score += 15;
    } else if (ageDays > 365) {
      signals.push("published_over_1y");
      score -= 25;
    }
  }

  if (input.sortMode === "date") {
    signals.push("found_via_date_sort");
    score += 20;
  }

  if (input.firstSeenThisRun) {
    signals.push("first_seen_this_run");
    score += 10;
  }

  const year = new Date().getFullYear();
  const yearRe = new RegExp(String(year));
  const prevYearRe = new RegExp(String(year - 1));
  if (yearRe.test(text)) {
    signals.push("mentions_current_year");
    score += 15;
  } else if (prevYearRe.test(text) && !yearRe.test(text)) {
    signals.push("mentions_prev_year_only");
    score -= 5;
  }

  // Clear old year markers
  if (/202[0-3]년|202[0-3]\s*하반기|2021|2022|2020/.test(text) && !yearRe.test(text)) {
    signals.push("legacy_year_marker");
    score -= 20;
  }

  if (/마감|종료된\s*설문|closed|조사\s*종료/.test(text)) {
    signals.push("closed_language");
    score -= 15;
  }

  let recency: RecencyClass;
  if (score >= 35) recency = "recent_high";
  else if (score >= 15) recency = "recent_possible";
  else if (score <= -15) recency = "likely_old";
  else recency = "unknown";

  return { recency, recencyScore: score, signals };
}

function isOfficialOrg(o: CollectorOrgQualityClass): boolean {
  return (
    o === "public" || o === "company" || o === "university_official"
  );
}

/**
 * Assign A / B / C validation queues.
 * C_ARCHIVE is not invalid — excluded from daily page-validate backlog only.
 * Rediscovery from a stronger official source can promote C → A/B (recompute triage).
 *
 * A_PRIORITY is intentionally strict so daily backlog stays ≤~150–200.
 * likely_old is never a hard delete; if A via strong host, validation order puts it last.
 */
export function assignTriageQueue(
  organization: CollectorOrgQualityClass,
  organizationScore: number,
  recency: RecencyClass,
): { queue: TriageQueue; reason: string } {
  if (organization === "individual_or_academic") {
    return {
      queue: "C_ARCHIVE",
      reason:
        "individual_or_academic — daily backlog skip (promotable on rediscovery)",
    };
  }

  if (recency === "likely_old" && organizationScore < 30) {
    return {
      queue: "C_ARCHIVE",
      reason: "likely_old + insufficient org strength",
    };
  }

  // A: clear official org from title/host (score≥28) AND recent signal
  if (
    isOfficialOrg(organization) &&
    organizationScore >= 28 &&
    (recency === "recent_high" || recency === "recent_possible")
  ) {
    return {
      queue: "A_PRIORITY",
      reason: "strong official org + recent",
    };
  }

  // A: very strong host (.go.kr) even if recency unknown
  if (organization === "public" && organizationScore >= 45) {
    return {
      queue: "A_PRIORITY",
      reason: "host_go_kr / strong public",
    };
  }

  if (
    organization === "unknown" &&
    organizationScore < 12 &&
    (recency === "likely_old" || recency === "unknown")
  ) {
    return {
      queue: "C_ARCHIVE",
      reason: "weak org + weak/old recency",
    };
  }

  // B: official but weak recency, or mid signals, or recent-unknown
  if (isOfficialOrg(organization) && organizationScore >= 20) {
    return {
      queue: "B_PRIORITY",
      reason: "official org, backlog",
    };
  }

  if (
    (recency === "recent_high" || recency === "recent_possible") &&
    organizationScore >= 6
  ) {
    return {
      queue: "B_PRIORITY",
      reason: "recent + weak org hint — backlog",
    };
  }

  if (organizationScore >= 12) {
    return {
      queue: "B_PRIORITY",
      reason: "mid org score — backlog",
    };
  }

  return {
    queue: "C_ARCHIVE",
    reason: "default archive — insufficient org/recency",
  };
}

export function triageCandidate(input: TriageInput): TriageResult {
  const org = classifyOrganizationLowCost(input);
  const rec = classifyRecencyLowCost(input);
  const q = assignTriageQueue(
    org.organization,
    org.organizationScore,
    rec.recency,
  );
  return {
    organization: org.organization,
    organizationScore: org.organizationScore,
    organizationSignals: org.signals,
    recency: rec.recency,
    recencyScore: rec.recencyScore,
    recencySignals: rec.signals,
    queue: q.queue,
    queueReason: q.reason,
  };
}

/** Whether a discovered row should enter the daily page-validate backlog. */
export function isDailyBacklogQueue(queue: TriageQueue): boolean {
  return queue === "A_PRIORITY" || queue === "B_PRIORITY";
}

/**
 * Pick the best (highest-priority) triage across multiple sources for one survey.
 * Enables C_ARCHIVE → A/B promotion when an official source rediscovers the same form.
 */
export function bestTriageAcrossSources(inputs: TriageInput[]): TriageResult {
  if (inputs.length === 0) {
    return triageCandidate({});
  }
  let best = triageCandidate(inputs[0]!);
  for (let i = 1; i < inputs.length; i += 1) {
    const t = triageCandidate(inputs[i]!);
    const qCmp = compareTriageQueue(t.queue, best.queue);
    if (
      qCmp < 0 ||
      (qCmp === 0 &&
        t.organizationScore + t.recencyScore >
          best.organizationScore + best.recencyScore)
    ) {
      best = t;
    }
  }
  return best;
}

/** Apply canary A/B daily caps (A first by recency, then B). Overflow → C_ARCHIVE. */
export function applyCanaryAbCaps<T extends { triage: TriageResult }>(
  aItems: T[],
  bItems: T[],
  caps: { maxA: number; maxB: number; maxAb: number },
): { cappedAB: T[]; overflow: T[]; counts: Record<TriageQueue, number> } {
  const aSorted = [...aItems].sort((x, y) => {
    const r = compareRecencyForValidation(x.triage.recency, y.triage.recency);
    if (r !== 0) return r;
    return (
      y.triage.organizationScore +
      y.triage.recencyScore -
      (x.triage.organizationScore + x.triage.recencyScore)
    );
  });
  const bSorted = [...bItems].sort(
    (x, y) =>
      y.triage.organizationScore +
      y.triage.recencyScore -
      (x.triage.organizationScore + x.triage.recencyScore),
  );

  const aTake = aSorted.slice(0, caps.maxA);
  const remaining = Math.max(0, caps.maxAb - aTake.length);
  const bTake = bSorted.slice(0, Math.min(caps.maxB, remaining));
  const cappedAB = [...aTake, ...bTake];
  const taken = new Set(cappedAB);
  const overflow = [...aSorted, ...bSorted].filter((x) => !taken.has(x));
  return {
    cappedAB,
    overflow,
    counts: {
      A_PRIORITY: aTake.length,
      B_PRIORITY: bTake.length,
      C_ARCHIVE: 0,
    },
  };
}
