import type {
  ContextFlag,
  DataRiskLevel,
  ObligationItem,
  ObligationKey,
  ToolRiskLevel,
} from "@/lib/types/analyzer";
import {
  hasDirectIdentifier,
  hasPersonalData,
  hasSensitiveData,
} from "@/lib/rules/dataRiskRules";
import { claimsAnonymityInNotices } from "@/lib/rules/personalDataDetection";
import {
  isDomesticOrOverseasSaaS,
  isOverseasSaaS,
} from "@/lib/rules/toolRouteRules";
import type { NormalizedForm } from "@/lib/types/scan";

const OBLIGATION_LABELS: Record<ObligationKey, string> = {
  collection_purpose: "수집·이용 목적",
  collection_items: "수집 항목",
  retention_period: "보유 및 이용기간",
  consent_refusal_right: "동의 거부권",
  refusal_disadvantage: "거부 시 불이익",
  destruction_timing: "파기 시점",
  processor_contact: "개인정보처리자 또는 담당자",
  trustee: "수탁자",
  trustee_task: "위탁업무 내용",
  trustee_oversight: "수탁자 관리·감독 또는 위탁계약 체계",
  overseas_transfer: "국외이전 여부",
  overseas_items: "이전되는 개인정보 항목",
  overseas_country: "이전 국가",
  overseas_recipient: "이전받는 자",
  overseas_purpose: "이전받는 자의 이용 목적",
  overseas_retention: "보유기간",
  overseas_refusal: "거부 방법 또는 법적 근거",
  sensitive_consent: "민감정보 별도 동의",
  sensitive_legal_basis: "법령상 근거 또는 수집 필요성",
  sensitive_access_control: "접근권한 및 원자료 제한",
  anonymity_standard: "익명성 기준",
  raw_data_scope: "원자료 제공 범위",
  no_disadvantage: "불이익 없음",
  small_group_privacy: "소수집단 통계 비공개 기준",
  prize_limited_collection: "당첨자 한정 수집",
  prize_destruction: "경품 발송 후 파기",
  prize_data_separation: "설문응답과 경품정보 분리",
  marketing_optional_consent: "마케팅 별도 선택동의",
  marketing_opt_out: "광고성 정보 수신 동의와 수신거부 방법",
  public_csap_verification: "CSAP 또는 공공부문 보안검증 여부",
  public_official_account: "기관 공식 계정 또는 기관 관리·통제",
  privacy_policy_link: "개인정보처리방침 링크",
  contact_department: "담당부서 또는 문의처",
  result_disclosure_prevention: "결과 공개 방지",
  purpose_destruction: "목적 달성 후 파기",
};

function add(
  items: ObligationItem[],
  key: ObligationKey,
  reason: string,
): void {
  if (items.some((i) => i.key === key)) return;
  items.push({ key, label: OBLIGATION_LABELS[key], reason });
}

export function buildRequiredObligations(
  flags: ContextFlag[],
  dataLevel: DataRiskLevel,
  toolLevel: ToolRiskLevel,
  form?: NormalizedForm,
): ObligationItem[] {
  const items: ObligationItem[] = [];
  const collectsPersonal = hasPersonalData(dataLevel);
  const collectsDirectIdentifier = hasDirectIdentifier(dataLevel);

  if (collectsPersonal) {
    add(items, "collection_purpose", "개인정보 수집 시 필수 고지");
    add(items, "collection_items", "개인정보 수집 시 필수 고지");
    add(items, "retention_period", "개인정보 수집 시 필수 고지");
    add(items, "consent_refusal_right", "개인정보 수집 시 필수 고지");
    add(items, "refusal_disadvantage", "개인정보 수집 시 필수 고지");
    add(items, "destruction_timing", "개인정보 수집 시 필수 고지");
    add(items, "processor_contact", "개인정보 수집 시 필수 고지");
    add(items, "purpose_destruction", "개인정보 수집 시 필수 고지");
  }

  if (collectsPersonal && isDomesticOrOverseasSaaS(toolLevel)) {
    add(items, "trustee", "외부 SaaS 이용 시 위탁 고지 필요");
    add(items, "trustee_task", "외부 SaaS 이용 시 위탁 고지 필요");
    add(items, "trustee_oversight", "외부 SaaS 이용 시 위탁 고지 필요");
  }

  if (collectsDirectIdentifier && isOverseasSaaS(toolLevel)) {
    add(items, "overseas_transfer", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
    add(items, "overseas_items", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
    add(items, "overseas_country", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
    add(items, "overseas_recipient", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
    add(items, "overseas_purpose", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
    add(items, "overseas_retention", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
    add(items, "overseas_refusal", "해외 SaaS + D3 이상 개인정보 국외이전 고지 필요");
  } else if (collectsPersonal && !collectsDirectIdentifier && isOverseasSaaS(toolLevel)) {
    add(items, "overseas_transfer", "D2 + 해외 SaaS 국외이전 확인 필요");
  }

  if (hasSensitiveData(dataLevel)) {
    add(items, "sensitive_consent", "민감정보 수집 시 별도 동의 필요");
    add(items, "sensitive_legal_basis", "민감정보 수집 시 법적 근거 고지 필요");
    add(items, "sensitive_access_control", "민감정보 수집 시 접근 통제 고지 필요");
  }

  const needsAnonymityObligations =
    flags.includes("employee_survey") ||
    (form ? claimsAnonymityInNotices(form) : false);

  if (flags.includes("employee_survey")) {
    add(items, "anonymity_standard", "직원/조직진단 설문 고지 필요");
    add(items, "raw_data_scope", "직원/조직진단 설문 고지 필요");
    add(items, "no_disadvantage", "직원/조직진단 설문 고지 필요");
    add(items, "small_group_privacy", "직원/조직진단 설문 고지 필요");
  } else if (needsAnonymityObligations) {
    add(items, "anonymity_standard", "익명 안내가 있는 설문 고지 필요");
  }

  if (flags.includes("event_prize")) {
    add(items, "prize_limited_collection", "경품/이벤트 설문 고지 필요");
    add(items, "prize_destruction", "경품/이벤트 설문 고지 필요");
    add(items, "prize_data_separation", "경품/이벤트 설문 고지 필요");
  }

  if (flags.includes("marketing")) {
    add(items, "marketing_optional_consent", "마케팅 활용 시 별도 선택동의 필요");
    add(items, "marketing_opt_out", "마케팅 활용 시 수신거부 방법 고지 필요");
  }

  if (flags.includes("public_agency")) {
    add(items, "public_csap_verification", "공공기관 설문 고지 필요");
    add(items, "public_official_account", "공공기관 설문 고지 필요");
    add(items, "privacy_policy_link", "공공기관 설문 고지 필요");
    add(items, "contact_department", "공공기관 설문 고지 필요");
    add(items, "result_disclosure_prevention", "공공기관 설문 고지 필요");
    add(items, "purpose_destruction", "공공기관 설문 고지 필요");
  }

  return items;
}

export { OBLIGATION_LABELS };
