import type { Platform, RiskGrade } from "@/lib/types/scan";

export type DataRiskLevel = "D0" | "D1" | "D2" | "D3" | "D4" | "D5";

export type ToolRiskLevel =
  | "csap_verified"
  | "self_hosted"
  | "domestic_saas"
  | "overseas_saas"
  | "generic_limited";

export type ContextFlag =
  | "public_agency"
  | "public_sector_possible"
  | "general_company"
  | "employee_survey"
  | "event_prize"
  | "marketing"
  | "complaint_report"
  | "child_possible";

export type SubjectType =
  | "public_sector"
  | "private_company"
  | "public_contracted_private"
  | "nonprofit_or_association"
  | "education"
  | "medical"
  | "unknown"
  /** @deprecated Prefer private_company */
  | "company";

export type PublicSectorConfidence = "high" | "medium" | "low" | "none";

export interface PublicInstitutionEvidence {
  matchedName?: string;
  matchedType?: string;
  matchedRegion?: string;
  matchedBy?: string;
  evidenceText?: string;
  evidenceSource?: string;
}
export type ObligationKey =
  | "collection_purpose"
  | "collection_items"
  | "retention_period"
  | "consent_refusal_right"
  | "refusal_disadvantage"
  | "destruction_timing"
  | "processor_contact"
  | "trustee"
  | "trustee_task"
  | "trustee_oversight"
  | "overseas_transfer"
  | "overseas_items"
  | "overseas_country"
  | "overseas_recipient"
  | "overseas_purpose"
  | "overseas_retention"
  | "overseas_refusal"
  | "sensitive_consent"
  | "sensitive_legal_basis"
  | "sensitive_access_control"
  | "anonymity_standard"
  | "raw_data_scope"
  | "no_disadvantage"
  | "small_group_privacy"
  | "prize_limited_collection"
  | "prize_destruction"
  | "prize_data_separation"
  | "marketing_optional_consent"
  | "marketing_opt_out"
  | "public_csap_verification"
  | "public_official_account"
  | "privacy_policy_link"
  | "contact_department"
  | "result_disclosure_prevention"
  | "purpose_destruction";

export type ComplianceStatus = "present" | "unclear" | "missing";

export interface FormContext {
  flags: ContextFlag[];
  labels: string[];
  summary: string;
  subjectType: SubjectType;
  publicSectorDetected: boolean;
  publicSectorConfidence: PublicSectorConfidence;
  publicSectorEvidence: string[];
  publicInstitutionEvidence?: PublicInstitutionEvidence;
  detectedOrganizations: string[];
  surveyPurposeTypes: string[];
}

export interface DataRiskResult {
  level: DataRiskLevel;
  levelLabel: string;
  detectedItems: string[];
  evidenceQuestions: string[];
}

export interface ToolRiskResult {
  level: ToolRiskLevel;
  levelLabel: string;
  description: string;
  mitigated: boolean;
  mitigationReason?: string;
}

export interface ObligationItem {
  key: ObligationKey;
  label: string;
  reason: string;
}

export interface ComplianceGap {
  key: ObligationKey;
  label: string;
  status: ComplianceStatus;
  detail: string;
}

export interface ManagementCheckItem {
  label: string;
  status: "confirmed" | "missing" | "unknown";
  detail: string;
}

export interface ManagementRiskResult {
  items: ManagementCheckItem[];
  deduction: number;
  summary: string;
}

export interface GradeOverride {
  ruleId: string;
  minGrade: RiskGrade;
  reason: string;
}

export interface ScoreBreakdown {
  baseScore: number;
  dataDeduction: number;
  toolDeduction: number;
  noticeDeduction: number;
  managementDeduction: number;
  rawScore: number;
  finalScore: number;
  scoreGrade: RiskGrade;
  finalGrade: RiskGrade;
  overrides: GradeOverride[];
}

export interface AnalysisResult {
  context: FormContext;
  dataRisk: DataRiskResult;
  toolRisk: ToolRiskResult;
  obligations: ObligationItem[];
  complianceGaps: ComplianceGap[];
  management: ManagementRiskResult;
  overrides: GradeOverride[];
  score: ScoreBreakdown;
}

export const DATA_RISK_LABELS: Record<DataRiskLevel, string> = {
  D0: "개인정보 없음",
  D1: "일반 의견",
  D2: "준식별정보",
  D3: "직접식별정보",
  D4: "민감정보 또는 민감 맥락",
  D5: "고유식별·고위험정보",
};

export const TOOL_RISK_LABELS: Record<ToolRiskLevel, string> = {
  csap_verified: "CSAP 인증 또는 공공 보안검증 도구",
  self_hosted: "자체 시스템",
  domestic_saas: "국내 외부 SaaS",
  overseas_saas: "해외 외부 SaaS",
  generic_limited: "기타 Generic (분석 제한)",
};

export const CONTEXT_LABELS: Record<ContextFlag, string> = {
  public_agency: "공공부문",
  public_sector_possible: "공공부문 가능성",
  general_company: "일반 기업",
  employee_survey: "근로자/조직진단",
  event_prize: "경품/이벤트",
  marketing: "마케팅",
  complaint_report: "민원/신고/피해",
  child_possible: "아동 가능성",
};

export const PLATFORM_TOOL_MAP: Partial<Record<Platform, ToolRiskLevel>> = {
  google_forms: "overseas_saas",
  naver_forms: "domestic_saas",
  moaform: "domestic_saas",
  wiseon_csap: "csap_verified",
  generic: "generic_limited",
  unknown: "generic_limited",
};
