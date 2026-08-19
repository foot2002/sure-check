/**
 * Collector search strategies — single source of truth.
 *
 * Variants:
 * - legacy: current Production 24-query dual strategy (display=20)
 * - org_v1: org/company/official-form discovery + org_v1.2 triage (A/B/C)
 *
 * Env COLLECTOR_SEARCH_STRATEGY aliases for org path:
 *   org_v1 | org_v1.2 | org_v1_2 | org_v1.1 | org_v1_1 | org-v1 | v2
 * All resolve to internal variant "org_v1" → runOrgV11Collection.
 * Unset / legacy → legacy. Production stays legacy until env is set.
 */

export type CollectorSortMode = "sim" | "date";

/** legacy groups */
export type CollectorQueryGroup = "domain" | "intent";

/** org_v1 strategy buckets (API budget mix) */
export type CollectorStrategyGroup = "date_breadth" | "sim_relevance" | "deep_seed";

export type CollectorOrganizationIntent =
  | "public"
  | "company"
  | "university_official"
  | "platform_focus"
  | "mixed";

export type CollectorFormPlatform =
  | "forms.gle"
  | "docs.google.com/forms"
  | "form.naver.com"
  | "naver.me"
  | "moaform.com/q"
  | "mixed";

export type CollectorPreferredSource = "web" | "blog" | "cafe" | "auto";

export type CollectorSearchStrategyVariant = "legacy" | "org_v1";

export type CollectorSearchQuery = {
  id: string;
  /** legacy field — domain | intent */
  group: CollectorQueryGroup;
  seed: string;
  domain: string | null;
  query: string;
  /** Preferred sort; org_v1 uses this strictly. */
  preferredSort: CollectorSortMode;
  /** org_v1 metadata (optional on legacy rows) */
  strategyGroup?: CollectorStrategyGroup;
  organizationIntent?: CollectorOrganizationIntent;
  formPlatform?: CollectorFormPlatform;
  sourceType?: CollectorPreferredSource;
  sort?: CollectorSortMode;
  priority?: number;
  depthEnabled?: boolean;
};

function q(input: {
  id: string;
  query: string;
  strategyGroup: CollectorStrategyGroup;
  organizationIntent: CollectorOrganizationIntent;
  formPlatform: CollectorFormPlatform;
  preferredSort: CollectorSortMode;
  priority: number;
  depthEnabled?: boolean;
  seed?: string;
  domain?: string | null;
  sourceType?: CollectorPreferredSource;
  group?: CollectorQueryGroup;
}): CollectorSearchQuery {
  return {
    id: input.id,
    group: input.group ?? "intent",
    seed: input.seed ?? input.query,
    domain: input.domain ?? (input.formPlatform === "mixed" ? null : input.formPlatform),
    query: input.query,
    preferredSort: input.preferredSort,
    sort: input.preferredSort,
    strategyGroup: input.strategyGroup,
    organizationIntent: input.organizationIntent,
    formPlatform: input.formPlatform,
    sourceType: input.sourceType ?? "auto",
    priority: input.priority,
    depthEnabled: Boolean(input.depthEnabled),
  };
}

/* ═══════════════════════════════════════════════════════════
 * LEGACY (Production default) — do not change semantics lightly
 * ═══════════════════════════════════════════════════════════ */

export const COLLECTOR_DOMAIN_QUERIES: readonly CollectorSearchQuery[] = [
  {
    id: "dom-forms-gle",
    group: "domain",
    seed: "forms.gle",
    domain: "forms.gle",
    query: "forms.gle 설문",
    preferredSort: "date",
  },
  {
    id: "dom-naver-form",
    group: "domain",
    seed: "form.naver.com",
    domain: "form.naver.com",
    query: "form.naver.com 설문",
    preferredSort: "date",
  },
  {
    id: "dom-moaform-q",
    group: "domain",
    seed: "moaform.com/q",
    domain: "moaform.com/q",
    query: "moaform.com/q",
    preferredSort: "date",
  },
  {
    id: "dom-google-forms",
    group: "domain",
    seed: "docs.google.com/forms",
    domain: "docs.google.com/forms",
    query: "docs.google.com/forms 설문",
    preferredSort: "sim",
  },
  {
    id: "dom-naver-form-survey",
    group: "domain",
    seed: "form.naver.com",
    domain: "form.naver.com",
    query: "form.naver.com 조사",
    preferredSort: "sim",
  },
  {
    id: "dom-moaform-survey",
    group: "domain",
    seed: "moaform.com",
    domain: "moaform.com/q",
    query: "moaform.com/q 설문",
    preferredSort: "sim",
  },
  {
    id: "dom-forms-gle-join",
    group: "domain",
    seed: "forms.gle",
    domain: "forms.gle",
    query: "forms.gle 참여",
    preferredSort: "date",
  },
  {
    id: "dom-naver-me",
    group: "domain",
    seed: "naver.me",
    domain: "naver.me",
    query: "naver.me 설문",
    preferredSort: "date",
  },
] as const;

export const COLLECTOR_INTENT_QUERIES: readonly CollectorSearchQuery[] = [
  {
    id: "int-join-gle",
    group: "intent",
    seed: "설문조사 참여",
    domain: "forms.gle",
    query: "설문조사 참여 forms.gle",
    preferredSort: "date",
  },
  {
    id: "int-join-naver",
    group: "intent",
    seed: "설문조사 참여",
    domain: "form.naver.com",
    query: "설문조사 참여 form.naver.com",
    preferredSort: "sim",
  },
  {
    id: "int-satis-moa",
    group: "intent",
    seed: "만족도 조사",
    domain: "moaform.com/q",
    query: "만족도 조사 moaform.com/q",
    preferredSort: "sim",
  },
  {
    id: "int-satis-google",
    group: "intent",
    seed: "만족도 조사",
    domain: "docs.google.com/forms",
    query: "만족도 조사 docs.google.com/forms",
    preferredSort: "date",
  },
  {
    id: "int-recog-moa",
    group: "intent",
    seed: "인식조사",
    domain: "moaform.com",
    query: "인식조사 moaform.com",
    preferredSort: "date",
  },
  {
    id: "int-recog-naver",
    group: "intent",
    seed: "인식조사",
    domain: "form.naver.com",
    query: "인식조사 form.naver.com",
    preferredSort: "sim",
  },
  {
    id: "int-reality-naver",
    group: "intent",
    seed: "실태조사",
    domain: "form.naver.com",
    query: "실태조사 form.naver.com",
    preferredSort: "date",
  },
  {
    id: "int-demand-moa",
    group: "intent",
    seed: "수요조사",
    domain: "moaform.com",
    query: "수요조사 moaform.com 설문",
    preferredSort: "sim",
  },
  {
    id: "int-opinion-gle",
    group: "intent",
    seed: "의견수렴",
    domain: "forms.gle",
    query: "의견수렴 forms.gle",
    preferredSort: "date",
  },
  {
    id: "int-research-gle",
    group: "intent",
    seed: "연구 설문",
    domain: "forms.gle",
    query: "연구 설문 forms.gle",
    preferredSort: "sim",
  },
  {
    id: "int-thesis-google",
    group: "intent",
    seed: "논문 설문",
    domain: "docs.google.com/forms",
    query: "논문 설문 docs.google.com/forms",
    preferredSort: "date",
  },
  {
    id: "int-citizen-naver",
    group: "intent",
    seed: "시민 설문",
    domain: "form.naver.com",
    query: "시민 설문 form.naver.com",
    preferredSort: "sim",
  },
  {
    id: "int-edu-moa",
    group: "intent",
    seed: "교육 만족도",
    domain: "moaform.com/q",
    query: "교육 만족도 moaform.com/q",
    preferredSort: "date",
  },
  {
    id: "int-event-gle",
    group: "intent",
    seed: "행사 만족도",
    domain: "forms.gle",
    query: "행사 만족도 forms.gle",
    preferredSort: "sim",
  },
  {
    id: "int-recruit-naver",
    group: "intent",
    seed: "참여자 모집",
    domain: "form.naver.com",
    query: "참여자 모집 form.naver.com",
    preferredSort: "date",
  },
  {
    id: "int-recruit-moa",
    group: "intent",
    seed: "참여자 모집",
    domain: "moaform.com/q",
    query: "참여자 모집 moaform.com/q",
    preferredSort: "sim",
  },
] as const;

export const COLLECTOR_SEARCH_SEEDS = [
  "설문조사 참여",
  "만족도 조사",
  "인식조사",
  "실태조사",
  "수요조사",
  "의견수렴",
  "연구 설문",
  "논문 설문",
  "시민 설문",
  "교육 만족도",
  "행사 만족도",
  "참여자 모집",
] as const;

export const COLLECTOR_DOMAIN_FILTERS = [
  "forms.gle",
  "docs.google.com/forms",
  "form.naver.com",
  "naver.me",
  "moaform.com/q",
] as const;

/* ═══════════════════════════════════════════════════════════
 * ORG_V1 — curated public/company/official discovery (~60)
 * Excludes thesis / personal research recruitment queries.
 * ═══════════════════════════════════════════════════════════ */

export const COLLECTOR_ORG_V1_QUERIES: readonly CollectorSearchQuery[] = [
  // A. date_breadth — recent promotion signal (~50% of run budget)
  q({
    id: "ov1-pub-gle-survey-d",
    query: "공공기관 forms.gle 설문",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 100,
    depthEnabled: true,
    group: "domain",
  }),
  q({
    id: "ov1-pub-gle-apply-d",
    query: "공공기관 forms.gle 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 98,
    depthEnabled: true,
  }),
  q({
    id: "ov1-local-gle-apply-d",
    query: "지자체 forms.gle 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 97,
    depthEnabled: true,
  }),
  q({
    id: "ov1-edu-gle-d",
    query: "교육청 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 95,
  }),
  q({
    id: "ov1-corp-gle-satis-d",
    query: "공기업 forms.gle 만족도",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 94,
    depthEnabled: true,
  }),
  q({
    id: "ov1-found-gle-apply-d",
    query: "재단 forms.gle 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 93,
  }),
  q({
    id: "ov1-promo-gle-survey-d",
    query: "진흥원 forms.gle 설문",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 92,
  }),
  q({
    id: "ov1-corp-naver-d",
    query: "공공기관 form.naver.com",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 91,
    depthEnabled: true,
    group: "domain",
  }),
  q({
    id: "ov1-local-naver-d",
    query: "지자체 form.naver.com",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 90,
  }),
  q({
    id: "ov1-corp-naver2-d",
    query: "공기업 form.naver.com",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 89,
  }),
  q({
    id: "ov1-found-naver-d",
    query: "재단 form.naver.com",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 88,
  }),
  q({
    id: "ov1-pub-moa-d",
    query: "공공기관 moaform.com/q",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "moaform.com/q",
    preferredSort: "date",
    priority: 87,
    depthEnabled: true,
    group: "domain",
  }),
  q({
    id: "ov1-local-moa-d",
    query: "지자체 moaform.com/q",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "moaform.com/q",
    preferredSort: "date",
    priority: 86,
  }),
  q({
    id: "ov1-company-gle-event-d",
    query: "기업 forms.gle 이벤트",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 85,
    depthEnabled: true,
  }),
  q({
    id: "ov1-company-gle-apply-d",
    query: "기업 forms.gle 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 84,
  }),
  q({
    id: "ov1-brand-gle-event-d",
    query: "브랜드 forms.gle 이벤트",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 83,
  }),
  q({
    id: "ov1-company-naver-event-d",
    query: "기업 form.naver.com 이벤트",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 82,
  }),
  q({
    id: "ov1-company-moa-d",
    query: "기업 moaform.com/q",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "moaform.com/q",
    preferredSort: "date",
    priority: 81,
  }),
  q({
    id: "ov1-satis-gle-d",
    query: "고객 만족도 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 80,
    depthEnabled: true,
  }),
  q({
    id: "ov1-edu-apply-gle-d",
    query: "교육 신청 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "mixed",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 79,
  }),
  q({
    id: "ov1-program-apply-naver-d",
    query: "프로그램 신청 form.naver.com",
    strategyGroup: "date_breadth",
    organizationIntent: "mixed",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 78,
  }),
  q({
    id: "ov1-event-apply-moa-d",
    query: "행사 신청 moaform.com/q",
    strategyGroup: "date_breadth",
    organizationIntent: "mixed",
    formPlatform: "moaform.com/q",
    preferredSort: "date",
    priority: 77,
  }),
  q({
    id: "ov1-seminar-gle-d",
    query: "세미나 신청 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "mixed",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 76,
  }),
  q({
    id: "ov1-consult-gle-d",
    query: "상담 신청 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 75,
  }),
  q({
    id: "ov1-city-opinion-naver-d",
    query: "시민 의견 form.naver.com",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 74,
  }),
  q({
    id: "ov1-policy-gle-d",
    query: "정책 의견수렴 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 73,
  }),
  q({
    id: "ov1-center-gle-d",
    query: "센터 forms.gle 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 72,
  }),
  q({
    id: "ov1-assoc-naver-d",
    query: "협회 form.naver.com 설문",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 71,
  }),
  q({
    id: "ov1-uni-official-gle-d",
    query: "산학협력단 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "university_official",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 70,
  }),
  q({
    id: "ov1-uni-support-naver-d",
    query: "학생지원 forms.gle 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "university_official",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 69,
  }),
  q({
    id: "ov1-naverme-pub-apply-d",
    query: "공공기관 naver.me 신청",
    strategyGroup: "date_breadth",
    organizationIntent: "public",
    formPlatform: "naver.me",
    preferredSort: "date",
    priority: 68,
  }),
  q({
    id: "ov1-prize-gle-d",
    query: "경품 응모 forms.gle",
    strategyGroup: "date_breadth",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 67,
  }),

  // B. sim_relevance — high-relevance org/forms (~30%)
  q({
    id: "ov1-pub-gle-satis-s",
    query: "공공기관 forms.gle 만족도",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 96,
    depthEnabled: true,
  }),
  q({
    id: "ov1-corp-gle-survey-s",
    query: "공단 forms.gle 만족도",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 94,
  }),
  q({
    id: "ov1-cityhall-gle-s",
    query: "시청 forms.gle 설문",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 93,
  }),
  q({
    id: "ov1-district-naver-s",
    query: "구청 form.naver.com 신청",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 92,
  }),
  q({
    id: "ov1-health-gle-s",
    query: "보건소 forms.gle",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 91,
  }),
  q({
    id: "ov1-welfare-naver-s",
    query: "복지관 form.naver.com 신청",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 90,
  }),
  q({
    id: "ov1-culture-moa-s",
    query: "문화재단 moaform.com/q",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "moaform.com/q",
    preferredSort: "sim",
    priority: 89,
  }),
  q({
    id: "ov1-sports-gle-s",
    query: "체육회 forms.gle 신청",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 88,
  }),
  q({
    id: "ov1-tourism-naver-s",
    query: "관광재단 form.naver.com",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 87,
  }),
  q({
    id: "ov1-company-gle-satis-s",
    query: "기업 forms.gle 만족도",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 86,
    depthEnabled: true,
  }),
  q({
    id: "ov1-service-satis-docs-s",
    query: "서비스 만족도 docs.google.com/forms",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "docs.google.com/forms",
    preferredSort: "sim",
    priority: 85,
  }),
  q({
    id: "ov1-csat-naver-s",
    query: "고객 만족도 form.naver.com",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 84,
  }),
  q({
    id: "ov1-event-enter-naver-s",
    query: "이벤트 응모 form.naver.com",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 83,
  }),
  q({
    id: "ov1-franchise-gle-s",
    query: "프랜차이즈 forms.gle 이벤트",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 82,
  }),
  q({
    id: "ov1-hospital-gle-s",
    query: "병원 forms.gle 만족도",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 81,
  }),
  q({
    id: "ov1-finance-naver-s",
    query: "은행 form.naver.com 이벤트",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 80,
  }),
  q({
    id: "ov1-demand-pub-gle-s",
    query: "수요조사 공공기관 forms.gle",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 79,
  }),
  q({
    id: "ov1-reality-local-naver-s",
    query: "실태조사 지자체 form.naver.com",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "sim",
    priority: 78,
  }),
  q({
    id: "ov1-opinion-gather-moa-s",
    query: "의견수렴 moaform.com/q",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "moaform.com/q",
    preferredSort: "sim",
    priority: 77,
  }),
  q({
    id: "ov1-edu-satis-moa-s",
    query: "교육 만족도 moaform.com/q",
    strategyGroup: "sim_relevance",
    organizationIntent: "mixed",
    formPlatform: "moaform.com/q",
    preferredSort: "sim",
    priority: 76,
  }),
  q({
    id: "ov1-uni-center-gle-s",
    query: "대학 센터 forms.gle 설문",
    strategyGroup: "sim_relevance",
    organizationIntent: "university_official",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 75,
  }),
  q({
    id: "ov1-apply-moa-s",
    query: "신청 moaform.com/q",
    strategyGroup: "sim_relevance",
    organizationIntent: "mixed",
    formPlatform: "moaform.com/q",
    preferredSort: "sim",
    priority: 74,
    group: "domain",
  }),
  q({
    id: "ov1-satis-moa-s",
    query: "만족도 moaform.com/q",
    strategyGroup: "sim_relevance",
    organizationIntent: "mixed",
    formPlatform: "moaform.com/q",
    preferredSort: "sim",
    priority: 73,
    group: "domain",
  }),
  q({
    id: "ov1-docs-pub-s",
    query: "공공기관 docs.google.com/forms",
    strategyGroup: "sim_relevance",
    organizationIntent: "public",
    formPlatform: "docs.google.com/forms",
    preferredSort: "sim",
    priority: 72,
    group: "domain",
  }),
  q({
    id: "ov1-naverme-company-s",
    query: "기업 naver.me 이벤트",
    strategyGroup: "sim_relevance",
    organizationIntent: "company",
    formPlatform: "naver.me",
    preferredSort: "sim",
    priority: 71,
  }),
  q({
    id: "ov1-join-phrase-gle-s",
    query: "설문에 참여해 주세요 forms.gle",
    strategyGroup: "sim_relevance",
    organizationIntent: "mixed",
    formPlatform: "forms.gle",
    preferredSort: "sim",
    priority: 70,
  }),

  // C. deep_seed markers — high-value seeds eligible for page 2–3
  // (also appear above with depthEnabled; these boost pool for deep ranking)
  q({
    id: "ov1-deep-gle-survey",
    query: "forms.gle 설문조사",
    strategyGroup: "deep_seed",
    organizationIntent: "platform_focus",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 60,
    depthEnabled: true,
    group: "domain",
  }),
  q({
    id: "ov1-deep-naver-survey",
    query: "form.naver.com 설문조사",
    strategyGroup: "deep_seed",
    organizationIntent: "platform_focus",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 59,
    depthEnabled: true,
    group: "domain",
  }),
  q({
    id: "ov1-deep-moa",
    query: "moaform.com/q 신청",
    strategyGroup: "deep_seed",
    organizationIntent: "platform_focus",
    formPlatform: "moaform.com/q",
    preferredSort: "date",
    priority: 58,
    depthEnabled: true,
    group: "domain",
  }),
  q({
    id: "ov1-deep-event-gle",
    query: "이벤트 신청 forms.gle",
    strategyGroup: "deep_seed",
    organizationIntent: "company",
    formPlatform: "forms.gle",
    preferredSort: "date",
    priority: 57,
    depthEnabled: true,
  }),
  q({
    id: "ov1-deep-pub-apply-naver",
    query: "공공기관 신청 form.naver.com",
    strategyGroup: "deep_seed",
    organizationIntent: "public",
    formPlatform: "form.naver.com",
    preferredSort: "date",
    priority: 56,
    depthEnabled: true,
  }),
] as const;

/** Academic / personal intents excluded from org_v1 (kept for docs only). */
export const COLLECTOR_EXCLUDED_ACADEMIC_SEEDS = [
  "논문 설문",
  "석사논문",
  "박사논문",
  "학위논문",
  "대학원 설문",
  "연구 참여자 모집",
  "연구대상자 모집",
  "졸업논문",
  "개인 프로젝트",
  "학생 과제",
  "개인 설문",
  "졸업작품 설문",
  "연구 설문",
] as const;

export function resolveCollectorSearchStrategy(
  override?: CollectorSearchStrategyVariant | null,
): CollectorSearchStrategyVariant {
  if (override === "legacy" || override === "org_v1") return override;
  const env = process.env.COLLECTOR_SEARCH_STRATEGY?.trim().toLowerCase();
  if (
    env === "org_v1" ||
    env === "org-v1" ||
    env === "org_v1.1" ||
    env === "org_v1_1" ||
    env === "org_v1.2" ||
    env === "org_v1_2" ||
    env === "v2"
  ) {
    return "org_v1";
  }
  return "legacy";
}

/**
 * Active query set for a collection run.
 * Default: legacy (Production-safe until org_v1 is approved via env).
 */
export function buildCollectorSearchQueries(options?: {
  strategy?: CollectorSearchStrategyVariant | null;
}): CollectorSearchQuery[] {
  const strategy = resolveCollectorSearchStrategy(options?.strategy);
  if (strategy === "org_v1") {
    const year = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
    const boosted = COLLECTOR_ORG_V1_QUERIES.map((item) => {
      const yearToken = String(year);
      if (item.query.includes(yearToken)) return item;
      return {
        ...item,
        query: `${yearToken} ${item.query} 진행 중`,
      };
    });
    const freshnessExtras: CollectorSearchQuery[] = [
      q({
        id: "ov1-fresh-year-survey-d",
        query: `${year} 설문조사 forms.gle`,
        strategyGroup: "date_breadth",
        organizationIntent: "mixed",
        formPlatform: "forms.gle",
        preferredSort: "date",
        priority: 110,
      }),
      q({
        id: "ov1-fresh-year-satis-d",
        query: `${year} 만족도 조사 form.naver.com`,
        strategyGroup: "date_breadth",
        organizationIntent: "mixed",
        formPlatform: "form.naver.com",
        preferredSort: "date",
        priority: 109,
      }),
      q({
        id: "ov1-fresh-live-survey-d",
        query: "진행 중 설문조사 moaform.com/q",
        strategyGroup: "date_breadth",
        organizationIntent: "mixed",
        formPlatform: "moaform.com/q",
        preferredSort: "date",
        priority: 108,
      }),
      q({
        id: "ov1-fresh-recent-survey-d",
        query: "최근 설문조사 docs.google.com/forms",
        strategyGroup: "date_breadth",
        organizationIntent: "mixed",
        formPlatform: "docs.google.com/forms",
        preferredSort: "date",
        priority: 107,
      }),
      q({
        id: "ov1-fresh-opinion-d",
        query: `${year} 의견수렴 참여 forms.gle`,
        strategyGroup: "date_breadth",
        organizationIntent: "public",
        formPlatform: "forms.gle",
        preferredSort: "date",
        priority: 106,
      }),
    ];
    return [...freshnessExtras, ...boosted].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
  }
  return [...COLLECTOR_DOMAIN_QUERIES, ...COLLECTOR_INTENT_QUERIES];
}

export function getCollectorQueryCount(
  strategy?: CollectorSearchStrategyVariant | null,
): number {
  return buildCollectorSearchQueries({ strategy }).length;
}

export function summarizeSearchStrategy(
  strategy?: CollectorSearchStrategyVariant | null,
): {
  strategy: CollectorSearchStrategyVariant;
  total: number;
  dateBreadth: number;
  simRelevance: number;
  deepSeed: number;
  depthEnabled: number;
} {
  const resolved = resolveCollectorSearchStrategy(strategy);
  const queries = buildCollectorSearchQueries({ strategy: resolved });
  if (resolved === "legacy") {
    const dateN = queries.filter((q) => q.preferredSort === "date").length;
    const simN = queries.filter((q) => q.preferredSort === "sim").length;
    return {
      strategy: resolved,
      total: queries.length,
      dateBreadth: dateN,
      simRelevance: simN,
      deepSeed: 0,
      depthEnabled: 0,
    };
  }
  return {
    strategy: resolved,
    total: queries.length,
    dateBreadth: queries.filter((q) => q.strategyGroup === "date_breadth")
      .length,
    simRelevance: queries.filter((q) => q.strategyGroup === "sim_relevance")
      .length,
    deepSeed: queries.filter((q) => q.strategyGroup === "deep_seed").length,
    depthEnabled: queries.filter((q) => q.depthEnabled).length,
  };
}

/**
 * Pick page-1 queries for org_v1 within API budget (excl. deep reserve).
 * Targets ~50% date / ~30% sim of total budget; deep (~20%) is separate.
 */
export function selectOrgV1PageOneQueries(
  maxApiCalls: number,
  deepReserve: number,
): CollectorSearchQuery[] {
  const breadthBudget = Math.max(1, maxApiCalls - deepReserve);
  const dateTarget = Math.max(1, Math.round(maxApiCalls * 0.5));
  const simTarget = Math.max(1, Math.round(maxApiCalls * 0.3));
  const all = buildCollectorSearchQueries({ strategy: "org_v1" });
  const datePool = all.filter(
    (q) =>
      q.strategyGroup === "date_breadth" || q.strategyGroup === "deep_seed",
  );
  const simPool = all.filter((q) => q.strategyGroup === "sim_relevance");
  const selected: CollectorSearchQuery[] = [];
  const used = new Set<string>();
  for (const item of datePool) {
    if (selected.length >= Math.min(dateTarget, breadthBudget)) break;
    if (used.has(item.id)) continue;
    selected.push(item);
    used.add(item.id);
  }
  for (const item of simPool) {
    if (selected.length >= breadthBudget) break;
    const simCount = selected.filter(
      (q) => q.strategyGroup === "sim_relevance",
    ).length;
    if (simCount >= simTarget && selected.length >= dateTarget) break;
    if (used.has(item.id)) continue;
    selected.push(item);
    used.add(item.id);
  }
  // Fill remaining breadth slots from leftover pools by priority
  for (const item of all) {
    if (selected.length >= breadthBudget) break;
    if (used.has(item.id)) continue;
    selected.push(item);
    used.add(item.id);
  }
  return selected;
}
