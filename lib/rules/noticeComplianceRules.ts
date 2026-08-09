import type { ComplianceGap, ComplianceStatus, DataRiskLevel, ObligationKey } from "@/lib/types/analyzer";
import type { NormalizedForm } from "@/lib/types/scan";
import type { ObligationItem } from "@/lib/types/analyzer";
import { formWideNoticeCorpus } from "@/lib/analyzer/formContext";
import {
  hasDirectIdentifier,
  hasPersonalData,
  isQuasiIdentifierOnly,
} from "@/lib/rules/dataRiskRules";

const WEAK_CONSENT = /^(확인|제출|동의|ok|submit)$/i;

function hasMeaningfulText(text?: string, minLength = 8): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < minLength) return false;
  if (WEAK_CONSENT.test(trimmed)) return false;
  return true;
}

function checkField(
  text: string | undefined,
  keywords: string[],
  minLength = 8,
): ComplianceStatus {
  if (!hasMeaningfulText(text, minLength)) return "missing";
  const lower = (text ?? "").toLowerCase();
  const matched = keywords.some((k) => lower.includes(k.toLowerCase()));
  if (!matched) return "unclear";
  return "present";
}

function noticeCorpus(form: NormalizedForm): string {
  // Form-wide (title/intro/sections/questions/footer metadata) — not a local window.
  return formWideNoticeCorpus(form);
}

function fieldOrCorpus(
  form: NormalizedForm,
  structured?: string,
): string | undefined {
  const corpus = noticeCorpus(form);
  if (hasMeaningfulText(structured, 8)) {
    return `${structured}\n${corpus}`;
  }
  return hasMeaningfulText(corpus, 8) ? corpus : structured;
}

function hasPurposeHint(form: NormalizedForm): boolean {
  return /보다\s*나은\s*서비스\s*제공|관람객\s*의견\s*수렴|기초자료|기초자료\s*활용|서비스\s*개선|전시\s*개선|시설\s*개선|통계(?:적인)?\s*분석\s*목적|통계\s*분석|만족도\s*조사|고객만족도\s*조사/.test(
    noticeCorpus(form),
  );
}

function hasQuestionsAsCollectionItems(form: NormalizedForm): boolean {
  return form.questions.length > 0;
}

const FIELD_MAP: Partial<
  Record<
    ObligationKey,
    (form: NormalizedForm) => { text?: string; keywords: string[]; minLength?: number }
  >
> = {
  collection_purpose: (f) => ({
    text: fieldOrCorpus(f, f.notices?.purpose ?? f.notices?.privacyNotice),
    keywords: [
      "수집 목적",
      "수집·이용 목적",
      "이용 목적",
      "활용 목적",
      "처리 목적",
      "조사 목적",
      "경품 지급",
      "목적",
    ],
  }),
  collection_items: (f) => ({
    text: fieldOrCorpus(f, f.notices?.items ?? f.notices?.privacyNotice),
    keywords: [
      "수집 항목",
      "개인정보 항목",
      "처리 항목",
      "성명",
      "이름",
      "휴대폰",
      "연락처",
      "이메일",
      "항목",
    ],
  }),
  retention_period: (f) => ({
    text: fieldOrCorpus(f, f.notices?.retention),
    keywords: [
      "보유기간",
      "보유·이용 기간",
      "이용기간",
      "보관기간",
      "행사 종료",
      "조사 종료",
      "경품 발송 완료",
      "목적 달성",
      "보유",
      "기간",
    ],
  }),
  consent_refusal_right: (f) => ({
    text: fieldOrCorpus(f, f.notices?.refusalRight),
    keywords: ["동의 거부", "거부권", "거부할 권리", "거부 시", "거부", "거절"],
  }),
  refusal_disadvantage: (f) => ({
    text: fieldOrCorpus(f, f.notices?.refusalDisadvantage),
    keywords: ["불이익", "제한", "경품지급 제한", "경품 지급 제한", "서비스 이용 제한"],
  }),
  destruction_timing: (f) => ({
    text: fieldOrCorpus(f, f.notices?.destruction),
    keywords: ["파기", "삭제", "폐기", "지체없이", "즉시 파기"],
  }),
  processor_contact: (f) => ({
    text: fieldOrCorpus(
      f,
      f.notices?.contactDepartment ?? f.notices?.processor,
    ),
    keywords: [
      "담당부서",
      "담당자",
      "문의처",
      "개인정보 보호책임자",
      "개인정보 담당자",
      "처리자",
    ],
  }),
  trustee: (f) => ({
    text: fieldOrCorpus(f, f.notices?.trustee),
    keywords: ["수탁자", "위탁업무", "처리위탁", "위탁"],
  }),
  trustee_task: (f) => ({
    text: fieldOrCorpus(f, f.notices?.trusteeTask ?? f.notices?.trustee),
    keywords: ["위탁 업무", "처리 업무", "위탁업무", "보관", "파기"],
  }),
  trustee_oversight: (f) => ({
    text: fieldOrCorpus(f, f.notices?.trustee ?? f.notices?.privacyNotice),
    keywords: ["관리", "감독", "계약", "수탁"],
  }),
  overseas_transfer: (f) => ({
    text: fieldOrCorpus(f, f.notices?.overseasTransfer),
    keywords: ["국외이전", "국외 보관", "해외 이전", "해외 보관", "이전 국가"],
  }),
  overseas_items: (f) => ({
    text: f.notices?.overseasTransfer,
    keywords: ["항목", "이전", "개인정보"],
  }),
  overseas_country: (f) => ({
    text: f.notices?.overseasCountry ?? f.notices?.overseasTransfer,
    keywords: ["국가", "미국", "해외"],
  }),
  overseas_recipient: (f) => ({
    text: f.notices?.overseasRecipient ?? f.notices?.overseasTransfer,
    keywords: ["이전받", "수령", "google", "구글"],
  }),
  overseas_purpose: (f) => ({
    text: f.notices?.overseasTransfer,
    keywords: ["목적", "이용"],
  }),
  overseas_retention: (f) => ({
    text: f.notices?.overseasTransfer ?? f.notices?.retention,
    keywords: ["보유", "기간"],
  }),
  overseas_refusal: (f) => ({
    text: f.notices?.overseasTransfer ?? f.notices?.refusalRight,
    keywords: ["거부", "동의", "근거"],
  }),
  sensitive_consent: (f) => ({
    text: f.notices?.sensitiveConsent ?? f.notices?.consentText,
    keywords: ["민감", "별도", "동의"],
  }),
  sensitive_legal_basis: (f) => ({
    text: f.notices?.privacyNotice,
    keywords: ["근거", "법령", "필요"],
  }),
  sensitive_access_control: (f) => ({
    text: f.notices?.privacyNotice,
    keywords: ["접근", "권한", "제한"],
  }),
  anonymity_standard: (f) => ({
    text: f.notices?.anonymity,
    keywords: ["익명", "특정", "식별"],
  }),
  raw_data_scope: (f) => ({
    text: f.notices?.rawDataScope,
    keywords: ["원자료", "제공", "범위"],
  }),
  no_disadvantage: (f) => ({
    text: f.notices?.anonymity ?? f.notices?.privacyNotice,
    keywords: ["불이익", "인사", "징계"],
  }),
  small_group_privacy: (f) => ({
    text: f.notices?.smallGroupPrivacy,
    keywords: ["소수", "통계", "비공개"],
  }),
  prize_limited_collection: (f) => ({
    text: f.notices?.purpose ?? f.notices?.privacyNotice,
    keywords: ["당첨", "경품", "한정"],
  }),
  prize_destruction: (f) => ({
    text: f.notices?.prizeDestruction ?? f.notices?.destruction,
    keywords: ["파기", "경품", "발송 후"],
  }),
  prize_data_separation: (f) => ({
    text: f.notices?.prizeSeparation,
    keywords: ["분리", "경품", "응답"],
  }),
  marketing_optional_consent: (f) => ({
    text: f.notices?.marketingConsent,
    keywords: ["마케팅", "선택", "동의"],
  }),
  marketing_opt_out: (f) => ({
    text: f.notices?.marketingOptOut,
    keywords: ["수신거부", "거부", "광고"],
  }),
  public_csap_verification: (f) => ({
    text: f.notices?.privacyNotice ?? f.notices?.description,
    keywords: ["csap", "보안검증", "인증"],
  }),
  public_official_account: (f) => ({
    text: f.notices?.description,
    keywords: ["공식", "기관", "계정"],
  }),
  privacy_policy_link: (f) => ({
    text: f.notices?.privacyPolicyUrl,
    keywords: ["http", "privacy", "처리방침"],
    minLength: 5,
  }),
  contact_department: (f) => ({
    text: fieldOrCorpus(f, f.notices?.contactDepartment),
    keywords: ["담당부서", "문의처", "개인정보 보호책임자", "담당자"],
  }),
  result_disclosure_prevention: (f) => ({
    text: fieldOrCorpus(f, f.notices?.privacyNotice),
    keywords: ["공개", "방지", "비공개"],
  }),
  purpose_destruction: (f) => ({
    text: fieldOrCorpus(f, f.notices?.destruction ?? f.notices?.retention),
    keywords: ["파기", "목적 달성", "지체없이"],
  }),
};

export function evaluateNoticeCompliance(
  form: NormalizedForm,
  obligations: ObligationItem[],
): ComplianceGap[] {
  const gaps: ComplianceGap[] = [];

  const consentOnly =
    hasMeaningfulText(form.notices?.consentText, 2) &&
    !hasMeaningfulText(form.notices?.privacyNotice, 15) &&
    !form.hasConsent;

  for (const obligation of obligations) {
    const checker = FIELD_MAP[obligation.key];
    let status: ComplianceStatus = "missing";
    let detail = `${obligation.label} 고지가 확인되지 않습니다.`;

    if (checker) {
      const { text, keywords, minLength } = checker(form);
      status = checkField(text, keywords, minLength);
      if (status === "present") {
        detail = `${obligation.label} 관련 안내가 확인됩니다.`;
      } else if (status === "unclear") {
        detail = `${obligation.label} 관련 표현이 있으나 명확성·근접성이 부족합니다.`;
      }
    }

    if (
      consentOnly &&
      ["collection_purpose", "collection_items", "retention_period"].includes(
        obligation.key,
      )
    ) {
      status = "missing";
      detail =
        "제출/확인 버튼만 있고 별도 고지·동의 문구가 확인되지 않아 미흡으로 판단합니다.";
    }

    if (obligation.key === "collection_purpose" && status === "missing" && hasPurposeHint(form)) {
      status = "unclear";
      detail =
        "조사 목적은 안내되어 있으나, 개인정보 수집·이용 고지문 형식으로 보완하면 좋습니다.";
    }

    if (
      obligation.key === "collection_items" &&
      status === "missing" &&
      hasQuestionsAsCollectionItems(form)
    ) {
      status = "unclear";
      detail =
        "수집 항목은 문항에서 확인되지만, 설문 첫 화면의 개인정보 안내문에는 별도로 정리되어 있지 않습니다.";
    }

    if (
      obligation.key.startsWith("overseas_") &&
      form.management?.domesticStorage &&
      form.management?.csapVerified
    ) {
      status = "present";
      detail = "국내 보관·CSAP 인증 환경으로 국외이전 고지 요건이 완화됩니다.";
    }

    if (
      ["trustee", "trustee_task", "trustee_oversight"].includes(obligation.key) &&
      form.management?.trusteeDisclosed
    ) {
      status = "present";
      detail = "수탁자·위탁 관련 안내가 확인됩니다.";
    }

    gaps.push({
      key: obligation.key,
      label: obligation.label,
      status,
      detail,
    });
  }

  return gaps;
}

const CORE_NOTICE_KEYS = new Set([
  "collection_purpose",
  "collection_items",
  "retention_period",
  "consent_refusal_right",
  "refusal_disadvantage",
  "destruction_timing",
  "processor_contact",
  "purpose_destruction",
]);

export function countNoticeGaps(gaps: ComplianceGap[]): number {
  return gaps.filter((gap) => gap.status !== "present").length;
}

export function countWeightedNoticeGaps(
  gaps: ComplianceGap[],
  dataLevel: DataRiskLevel,
): number {
  let weight = 0;

  for (const gap of gaps) {
    if (gap.status === "present") continue;

    const isCore = CORE_NOTICE_KEYS.has(gap.key);
    const isTrustee = gap.key.startsWith("trustee");
    const isOverseas = gap.key.startsWith("overseas");
    const isEmployeeOnly = [
      "anonymity_standard",
      "raw_data_scope",
      "no_disadvantage",
      "small_group_privacy",
    ].includes(gap.key);
    const missingWeight = gap.status === "missing" ? 1 : 0.65;

    if (isEmployeeOnly) continue;

    if (isQuasiIdentifierOnly(dataLevel)) {
      if (isCore) weight += missingWeight * 0.55;
      else if (isTrustee) weight += missingWeight * 0.45;
      else if (isOverseas) weight += missingWeight * 0.2;
      else weight += missingWeight * 0.25;
      continue;
    }

    if (hasDirectIdentifier(dataLevel)) {
      if (isCore || isTrustee || isOverseas) weight += missingWeight;
      else weight += missingWeight * 0.5;
      continue;
    }

    if (hasPersonalData(dataLevel)) {
      weight += missingWeight * 0.4;
    }
  }

  return weight;
}

export function getNoticeGapSeverity(
  gap: ComplianceGap,
  dataLevel: DataRiskLevel,
): "info" | "low" | "medium" | "high" | "critical" {
  if (gap.status === "present") return "info";

  const isCore = CORE_NOTICE_KEYS.has(gap.key);
  const isTrustee = gap.key.startsWith("trustee");
  const isOverseas = gap.key.startsWith("overseas");
  const isSensitive = gap.key.startsWith("sensitive_");

  if (isSensitive || gap.key === "overseas_transfer") {
    return gap.status === "missing" ? "critical" : "high";
  }

  if (hasDirectIdentifier(dataLevel) && (isCore || isTrustee || isOverseas)) {
    return gap.status === "missing" ? "high" : "medium";
  }

  if (isQuasiIdentifierOnly(dataLevel)) {
    if (isCore) return gap.status === "missing" ? "medium" : "low";
    if (isTrustee || isOverseas) return "medium";
    return "low";
  }

  return gap.status === "missing" ? "medium" : "low";
}
