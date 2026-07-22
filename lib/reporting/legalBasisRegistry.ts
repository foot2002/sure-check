/**
 * 운영자용 법·정책 근거 태그 레지스트리
 * 자동 진단용 짧은 태그이며 법률 자문이 아닙니다.
 */

export type LegalBasisId =
  | "PIPA_ART_15"
  | "PIPA_ART_16"
  | "PIPA_ART_21"
  | "PIPA_ART_22"
  | "PIPA_ART_23"
  | "PIPA_ART_24"
  | "PIPA_ART_26"
  | "PIPA_ART_28_8"
  | "PIPA_ART_29"
  | "CSAP_PUBLIC_CLOUD"
  | "MOIS_PUBLIC_CLOUD_NOTICE"
  | "NIS_SECURITY_REVIEW"
  | "ISMS_P"
  | "INTERNAL_ACCESS_CONTROL";

export interface LegalBasisEntry {
  id: LegalBasisId;
  label: string;
  shortTitle: string;
  description: string;
  appliesTo: string[];
}

export const LEGAL_BASIS_REGISTRY: Record<LegalBasisId, LegalBasisEntry> = {
  PIPA_ART_15: {
    id: "PIPA_ART_15",
    label: "개인정보보호법 제15조",
    shortTitle: "수집·이용 고지",
    description:
      "개인정보 수집·이용 시 수집 목적, 수집 항목, 보유·이용 기간, 동의 거부권 및 불이익을 알리는 기준입니다.",
    appliesTo: ["direct_identifier", "personal_data_collection", "notice"],
  },
  PIPA_ART_16: {
    id: "PIPA_ART_16",
    label: "개인정보보호법 제16조",
    shortTitle: "최소 수집",
    description:
      "목적에 필요한 범위에서 최소한의 개인정보만 수집하도록 하는 기준입니다.",
    appliesTo: ["minimization", "free_opinion"],
  },
  PIPA_ART_21: {
    id: "PIPA_ART_21",
    label: "개인정보보호법 제21조",
    shortTitle: "보유기간·파기",
    description:
      "개인정보가 불필요하게 되었을 때 파기해야 하는 기준입니다.",
    appliesTo: ["retention", "destruction"],
  },
  PIPA_ART_22: {
    id: "PIPA_ART_22",
    label: "개인정보보호법 제22조",
    shortTitle: "동의 방법",
    description:
      "동의는 명확히 구분된 내용으로 받고, 거부권을 알릴 수 있도록 하는 기준입니다.",
    appliesTo: ["consent"],
  },
  PIPA_ART_23: {
    id: "PIPA_ART_23",
    label: "개인정보보호법 제23조",
    shortTitle: "민감정보",
    description:
      "건강, 정치적 견해, 종교, 노동조합 가입 등 민감정보 처리 제한과 별도 동의 기준입니다.",
    appliesTo: ["sensitive_data"],
  },
  PIPA_ART_24: {
    id: "PIPA_ART_24",
    label: "개인정보보호법 제24조",
    shortTitle: "고유식별정보",
    description:
      "주민등록번호 등 고유식별정보 처리 제한과 안전조치 기준입니다.",
    appliesTo: ["unique_identifier", "high_risk"],
  },
  PIPA_ART_26: {
    id: "PIPA_ART_26",
    label: "개인정보보호법 제26조",
    shortTitle: "처리위탁",
    description:
      "개인정보 처리를 외부에 맡기는 경우 위탁 관련 기준입니다.",
    appliesTo: ["outsourcing", "external_saas"],
  },
  PIPA_ART_28_8: {
    id: "PIPA_ART_28_8",
    label: "개인정보보호법 제28조의8",
    shortTitle: "국외이전",
    description:
      "개인정보를 국외로 이전하거나 해외 서비스에 보관할 가능성이 있는 경우 확인해야 하는 기준입니다.",
    appliesTo: ["overseas_transfer", "google_forms"],
  },
  PIPA_ART_29: {
    id: "PIPA_ART_29",
    label: "개인정보보호법 제29조",
    shortTitle: "안전조치",
    description:
      "접근권한, 접속기록, 암호화 등 개인정보 안전성 확보를 위한 기준입니다.",
    appliesTo: ["security", "access_control", "raw_data_management"],
  },
  CSAP_PUBLIC_CLOUD: {
    id: "CSAP_PUBLIC_CLOUD",
    label: "클라우드컴퓨팅법 / CSAP",
    shortTitle: "공공 클라우드 보안인증",
    description:
      "공공부문에서 클라우드 서비스 보안성을 확인할 때 중요한 기준입니다.",
    appliesTo: ["public_sector", "cloud_saas", "certified_tool"],
  },
  MOIS_PUBLIC_CLOUD_NOTICE: {
    id: "MOIS_PUBLIC_CLOUD_NOTICE",
    label: "행정·공공기관 클라우드 이용 기준",
    shortTitle: "공공기관 클라우드 이용 기준",
    description:
      "행정기관 및 공공기관이 클라우드 서비스를 이용할 때 확인해야 할 기준입니다.",
    appliesTo: ["public_sector", "cloud_saas"],
  },
  NIS_SECURITY_REVIEW: {
    id: "NIS_SECURITY_REVIEW",
    label: "국정원 보안성 검토 기준",
    shortTitle: "공공 정보보안 검토",
    description:
      "공공 정보시스템 또는 공공 클라우드 이용 시 보안성 검토와 정보보안 기준 확인이 필요한 경우 참고하는 기준입니다.",
    appliesTo: ["public_sector", "security_review"],
  },
  ISMS_P: {
    id: "ISMS_P",
    label: "ISMS-P 관리체계",
    shortTitle: "개인정보보호 관리체계",
    description:
      "기업·기관이 개인정보를 안전하게 관리하기 위한 조직·기술·관리 체계를 확인하는 기준입니다.",
    appliesTo: ["private_sector", "management_system"],
  },
  INTERNAL_ACCESS_CONTROL: {
    id: "INTERNAL_ACCESS_CONTROL",
    label: "내부 관리계획 / 접근권한 관리",
    shortTitle: "접근권한 관리",
    description:
      "원자료 열람·다운로드·파기 담당 등 내부 접근권한 관리 기준입니다.",
    appliesTo: ["access_control", "employee_survey"],
  },
};

export function getLegalBasis(id: LegalBasisId): LegalBasisEntry {
  return LEGAL_BASIS_REGISTRY[id];
}

export function legalBasisLabels(ids: LegalBasisId[]): string[] {
  return ids.map((id) => LEGAL_BASIS_REGISTRY[id].label);
}
