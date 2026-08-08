/**
 * Dual search strategy for public survey discovery.
 * Keep query definitions here — do not hardcode elsewhere.
 *
 * Active set: 24 queries, executed with selective sources so a run stays
 * within COLLECTOR_MAX_API_CALLS (36) — same budget as the mid-scale baseline.
 * Order interleaves Google / Naver / Moaform so early runtime cuts stay balanced.
 */

export type CollectorSortMode = "sim" | "date";

export type CollectorQueryGroup = "domain" | "intent";

export type CollectorSearchQuery = {
  id: string;
  group: CollectorQueryGroup;
  seed: string;
  domain: string | null;
  query: string;
  /** Preferred sort; runCollection may still alternate for coverage. */
  preferredSort: CollectorSortMode;
};

/** A. Platform domain focus — interleaved platforms. */
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

/**
 * B. Intent × one platform domain (not full cartesian).
 * Platforms rotate so Google / Naver / Moaform stay balanced.
 */
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

/** Legacy seed list (intent vocabulary) for docs/tests. */
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

/**
 * Efficient active set (20–40 range): 8 domain + 16 intent = 24 queries.
 * Endpoint selection in runCollection keeps API calls ≤ 36.
 */
export function buildCollectorSearchQueries(): CollectorSearchQuery[] {
  return [...COLLECTOR_DOMAIN_QUERIES, ...COLLECTOR_INTENT_QUERIES];
}

export function getCollectorQueryCount(): number {
  return buildCollectorSearchQueries().length;
}
