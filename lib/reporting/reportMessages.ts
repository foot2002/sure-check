import type { DetectedCategory, RiskGrade } from "@/lib/types/scan";
import type {
  DecisionSummary,
  LegalCheckSummary,
  ToolGovernanceSummary,
  VerdictType,
} from "@/lib/reporting/verdictTypes";
import {
  VERDICT_LABELS,
  VERDICT_STYLES,
} from "@/lib/reporting/verdictTypes";
import type { SafetyTypeProfile } from "@/lib/reporting/safetyType";
import type { OperatorImprovementReport } from "@/lib/reporting/buildOperatorImprovementReport";

export type {
  DecisionSummary,
  LegalCheckItem,
  LegalCheckSeverity,
  LegalCheckSummary,
  ToolGovernanceSummary,
  ToolImportanceLevel,
  VerdictType,
} from "@/lib/reporting/verdictTypes";

export type { SafetyTypeProfile, SafetyTypeId, SurveySubjectType } from "@/lib/reporting/safetyType";
export type { OperatorImprovementReport, OperatorImprovementItem, OperatorToolImprovement, CertificationExplainCard } from "@/lib/reporting/buildOperatorImprovementReport";

/** @deprecated use VerdictType */
export type RespondentDecision = VerdictType;

export type PrivacyDataType =
  | "minimal"
  | "quasi_only"
  | "direct_identifier"
  | "sensitive_or_high_risk"
  | "limited";

export type OperatorFixPriority = "required" | "recommended" | "optional";

export type OperatorFixCategory =
  | "basic_notice"
  | "retention_deletion"
  | "outsourcing"
  | "overseas_transfer"
  | "sensitive_data"
  | "public_sector"
  | "employee_survey"
  | "event_reward"
  | "marketing"
  | "anonymity";

export interface OperatorFix {
  priority: OperatorFixPriority;
  category: OperatorFixCategory;
  title: string;
  reason: string;
  action: string;
}

export interface CopyableTemplate {
  title: string;
  body: string;
}

export type VisualRiskLevel = "low" | "medium" | "high" | "critical" | "limited";

export interface RiskDimension {
  id: "data" | "tool" | "notice" | "management";
  title: string;
  level: VisualRiskLevel;
  label: string;
  description: string;
  score: number;
}

export interface KeyReason {
  id: string;
  category:
    | "data"
    | "tool"
    | "notice"
    | "context"
    | "limited"
    | "management";
  title: string;
  description: string;
  severity: VisualRiskLevel;
  evidence: string[];
  extraCount: number;
}

export interface CollectedDataSummary {
  directIdentifiers: string[];
  quasiIdentifiers: string[];
  generalOpinions: string[];
  sensitiveItems: string[];
  highRiskItems: string[];
}

export interface CertificationNotice {
  title: string;
  body: string;
  contextNote?: string;
}

export type PublicSectorCsapSeverity = "strong" | "mild" | "none";

export interface CsapExplanation {
  title: string;
  body: string;
  bullets: string[];
  disclaimer: string;
}

export interface PublicSectorCsapAssessment {
  severity: PublicSectorCsapSeverity;
  showStrongWarning: boolean;
  showMildNotice: boolean;
  title: string;
  body: string;
  strongRecommendation: string;
  platformNote?: string;
  toolStatusLabel: string;
  csapExplanation: CsapExplanation;
}

export type PrivateSectorCertSeverity = "strong" | "mild" | "none";

export interface CertificationStandardCard {
  id: "csap" | "isms_p" | "secure_collection_tool";
  title: string;
  description: string;
  privateSectorNote?: string;
  bullets: string[];
  disclaimer: string;
}

export interface PrivateSectorSecurityCertAssessment {
  severity: PrivateSectorCertSeverity;
  showStrongWarning: boolean;
  showMildNotice: boolean;
  title: string;
  body: string;
  strongRecommendation: string;
  sensitiveDataNote?: string;
  certificationDisclaimer: string;
  platformNote?: string;
  toolStatusLabel: string;
  explanationSectionTitle: string;
  certificationCards: CertificationStandardCard[];
}

export interface PrivacyDataAssessment {
  type: PrivacyDataType;
  conclusion: string;
  inclusionSummary: string;
  respondentAdvice: string;
  statusBadge: string;
  scoreEvaluation: string;
  title: string;
  action: string;
  description: string;
  quickActions: string[];
  certificationNotice?: CertificationNotice;
  highRiskNote?: string;
}

export interface AudienceReport {
  isLimited: boolean;
  privacyAssessment: PrivacyDataAssessment;
  respondentDecision: VerdictType;
  respondentDecisionTitle: string;
  respondentDecisionSummary: string;
  respondentReasons: string[];
  collectedDataSummary: CollectedDataSummary;
  respondentDoList: string[];
  respondentDontList: string[];
  operatorSummary: string;
  operatorTopFixes: OperatorFix[];
  requiredFixes: OperatorFix[];
  recommendedFixes: OperatorFix[];
  copyableTemplates: CopyableTemplate[];
  riskDimensions: RiskDimension[];
  keyReasons: KeyReason[];
  publicSectorCsapWarning?: PublicSectorCsapAssessment;
  privateSectorSecurityCertWarning?: PrivateSectorSecurityCertAssessment;
  noticeSummary: string;
  detailsSummary: string;
  decisionSummary: DecisionSummary;
  legalCheckSummary: LegalCheckSummary;
  toolGovernanceSummary: ToolGovernanceSummary;
  safetyType: SafetyTypeProfile;
  operatorImprovement: OperatorImprovementReport;
}

export const RESPONDENT_DECISION_LABELS = VERDICT_LABELS;
export const RESPONDENT_DECISION_STYLES = VERDICT_STYLES;

export const CATEGORY_LABELS: Record<DetectedCategory, string> = {
  name: "이름",
  phone: "연락처",
  email: "이메일",
  address: "상세주소",
  birthdate: "생년월일",
  affiliation: "소속",
  organization_identifier: "직장/기관 식별정보",
  gender: "성별",
  respondent_age: "연령대",
  age_range: "연령대",
  child_age_range: "자녀 연령대",
  residence_area: "거주권역",
  department: "부서",
  position: "직급",
  tenure: "근속연수",
  quasi_identifier: "준식별정보",
  sensitive_health: "건강정보",
  sensitive_belief_union: "신념·노조 등 민감정보",
  sensitive_complaint: "고충·괴롭힘 등 민감 맥락",
  sensitive_political: "정치적 견해",
  sensitive_religion: "종교·신앙",
  unique_identifier: "고유식별정보",
  financial: "금융정보",
  resident_registration_number: "주민등록번호",
  passport_number: "여권번호",
  driver_license_number: "운전면허번호",
  foreign_registration_number: "외국인등록번호",
  id_document: "신분증",
  financial_account: "계좌번호",
  authentication_secret: "비밀번호/인증번호",
  program_preference: "프로그램 주제",
  policy_opinion: "정책 방향",
  service_feedback: "서비스 의견",
  visit_purpose: "방문/이용 목적",
  satisfaction: "만족도",
  preference: "선호도",
  improvement_opinion: "개선사항",
  general_opinion: "일반 의견",
};

export const GRADE_STRENGTH: Record<RiskGrade, number> = {
  safe: 0,
  caution: 1,
  risk: 2,
  high_risk: 3,
};

export const TEMPLATE_BASIC_NOTICE: CopyableTemplate = {
  title: "기본 개인정보 수집·이용 안내 문구",
  body: "본 설문은 [조사 목적]을 위해 필요한 최소한의 개인정보를 수집합니다. 수집 항목은 [수집 항목]이며, 수집된 정보는 [보유기간] 동안 보관 후 지체 없이 파기됩니다. 응답자는 개인정보 수집·이용에 동의하지 않을 권리가 있으며, 동의하지 않는 경우 [불이익 또는 제한사항]이 있을 수 있습니다.",
};

export const TEMPLATE_GOOGLE_FORMS: CopyableTemplate = {
  title: "Google Forms 국외 보관·이전 안내 문구",
  body: "본 설문은 Google Forms를 통해 수집되며, 수집된 정보의 처리 위치와 국외 보관·이전 가능성을 확인할 수 있습니다. 국외 이전 국가, 수탁자, 이전 목적, 보유기간 및 거부권은 본 안내에 따라 확인할 수 있습니다.",
};

export const TEMPLATE_DOMESTIC_SAAS: CopyableTemplate = {
  title: "네이버폼/모아폼 외부 설문 시스템 안내 문구",
  body: "본 설문은 외부 설문 시스템을 통해 수집되며, 해당 시스템은 설문 응답 저장 및 관리 업무를 처리합니다. 수탁자, 위탁업무 내용, 보유기간 및 파기 기준은 본 안내에 따라 확인할 수 있습니다.",
};

export const TEMPLATE_EVENT_REWARD: CopyableTemplate = {
  title: "경품 설문 안내 문구",
  body: "경품 발송을 위한 연락처 정보는 당첨자 확인 및 경품 발송 목적으로만 이용되며, 경품 발송 완료 후 [기간] 이내 파기됩니다. 설문 응답 내용과 경품 발송 정보는 분리하여 관리합니다.",
};

export const TEMPLATE_EMPLOYEE_SURVEY: CopyableTemplate = {
  title: "직원 설문 안내 문구",
  body: "본 설문은 조직진단을 위한 목적으로 활용되며, 개인별 원자료는 관리자에게 제공하지 않습니다. 결과는 통계적으로 집계하여 활용하며, 소수 집단에서 개인이 식별될 수 있는 결과는 공개하지 않습니다.",
};

export const TEMPLATE_PUBLIC_SECTOR: CopyableTemplate = {
  title: "공공기관 외부 설문 시스템 안내 문구",
  body: "본 설문은 외부 설문 시스템을 통해 수집되며, 수집된 정보는 기관의 관리·통제 하에 조사 목적 범위 내에서만 처리됩니다. 개인정보 처리 위탁 여부, 보유기간, 파기 기준, 담당부서 및 문의처는 본 안내에 따라 확인할 수 있습니다.",
};
