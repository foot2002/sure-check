import type { RiskGrade } from "@/lib/types/scan";
import type { PrivacyDataType } from "@/lib/reporting/reportMessages";
import type { SafetyTypeId } from "@/lib/reporting/safetyType";

/** 최종 응답 판단 등급 (일반 사용자 행동 기준) */
export type VerdictType =
  | "SAFE_TO_RESPOND"
  | "RESPOND_WITH_CAUTION"
  | "CHECK_NOTICE_BEFORE_INPUT"
  | "DO_NOT_RESPOND"
  | "REPORT_OR_INQUIRE"
  | "LIMITED_DIAGNOSIS";

/** @deprecated use VerdictType — kept for gradual migration aliases */
export type RespondentDecision = VerdictType;

export type LegalCheckSeverity =
  | "severe_suspicion"
  | "check_required"
  | "improvement"
  | "passed";

export type ToolImportanceLevel =
  | "none"
  | "reference"
  | "secondary"
  | "important"
  | "critical";

export interface DecisionSummary {
  verdictType: VerdictType;
  headline: string;
  actionLabel: string;
  actionDescription: string;
  primaryReasons: string[];
  scoreDisplay: string;
  scoreGrade?: RiskGrade;
  reportRecommendation: string;
  isReportRecommended: boolean;
  privacyDataType: PrivacyDataType;
  statusBadge: string;
}

export interface LegalCheckItem {
  id: string;
  label: string;
  severity: LegalCheckSeverity;
  detail?: string;
}

export interface LegalCheckSummary {
  severeViolationSuspicions: LegalCheckItem[];
  checkRequiredItems: LegalCheckItem[];
  improvementRecommendations: LegalCheckItem[];
  passedItems: LegalCheckItem[];
}

export interface ToolGovernanceSummary {
  toolImportanceLevel: ToolImportanceLevel;
  showSection: boolean;
  title: string;
  body: string;
  certificationRecommendation: string;
  certificationReason: string;
  isCsapStronglyRecommended: boolean;
  isIsmsPRecommended: boolean;
  isCertifiedToolRecommended: boolean;
  bullets: string[];
}

export const VERDICT_COPY: Record<
  VerdictType,
  {
    headline: string;
    actionLabel: string;
    actionDescription: string;
    statusBadge: string;
    howToRespond: string;
  }
> = {
  SAFE_TO_RESPOND: {
    headline: "이 설문은 응답해도 무리가 없습니다.",
    actionLabel: "자유의견에 개인정보만 쓰지 않으면 응답해도 괜찮습니다.",
    actionDescription:
      "이름, 연락처, 이메일처럼 개인을 직접 알아볼 수 있는 정보는 확인되지 않았습니다.",
    statusBadge: "응답 가능",
    howToRespond:
      "응답해도 무리가 없습니다. 다만 자유의견에는 개인정보를 쓰지 마세요.",
  },
  RESPOND_WITH_CAUTION: {
    headline: "응답은 가능하지만, 이름·연락처 등 개인정보는 쓰지 마세요.",
    actionLabel:
      "자유의견에는 이름, 연락처, 건강상태, 구체적인 개인 사정을 쓰지 않는 것이 좋습니다.",
    actionDescription:
      "성별, 연령대, 거주지역처럼 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.",
    statusBadge: "개인정보 없이 응답",
    howToRespond:
      "응답은 가능하지만, 이름·연락처 등 개인정보는 쓰지 마세요.",
  },
  CHECK_NOTICE_BEFORE_INPUT: {
    headline:
      "수집 목적과 보관·파기 안내가 없으면 개인정보를 입력하지 마세요.",
    actionLabel:
      "수집 목적, 보유기간, 파기 기준, 담당자 안내를 확인한 뒤 응답하세요.",
    actionDescription:
      "이 설문은 이름, 연락처, 이메일 등 개인을 직접 알아볼 수 있는 정보를 수집합니다.",
    statusBadge: "안내 없으면 입력 금지",
    howToRespond:
      "개인정보를 왜 수집하는지, 언제까지 보관하는지, 언제 파기하는지, 담당자가 누구인지 안내되어 있는지 확인하세요. 이 안내가 보이지 않으면 입력하지 않는 것이 좋습니다.",
  },
  DO_NOT_RESPOND: {
    headline: "이 설문은 응답하지 않는 것이 좋습니다.",
    actionLabel:
      "개인정보를 입력하지 말고 운영기관에 공식 처리 기준을 확인하세요.",
    actionDescription:
      "민감정보·고위험정보 또는 식별·불이익 우려가 큰 맥락이 확인됩니다.",
    statusBadge: "응답 거부·신고 검토",
    howToRespond:
      "개인정보를 입력하지 말고 운영기관에 공식 처리 기준을 확인하세요. 설명이 불충분하거나 처리 기준이 불명확하면 응답하지 말고 신고를 검토하세요.",
  },
  REPORT_OR_INQUIRE: {
    headline: "이 설문은 응답하지 않는 것이 좋습니다.",
    actionLabel:
      "개인정보를 입력하지 말고 운영기관에 문의하거나 신고를 검토하세요.",
    actionDescription:
      "개인정보 처리 기준이 불명확한 상태에서 민감정보 또는 고위험정보를 수집하고 있습니다.",
    statusBadge: "응답 거부·신고 검토",
    howToRespond:
      "개인정보를 입력하지 말고 운영기관에 공식 처리 기준을 확인하세요. 설명이 불충분하면 응답하지 말고 신고를 검토하세요.",
  },
  LIMITED_DIAGNOSIS: {
    headline: "문항 분석이 안 되어 판단이 어렵습니다.",
    actionLabel:
      "실제 설문 화면에서 운영기관, 수집 항목, 보유기간, 파기 기준, 담당자 안내를 직접 확인해 주세요.",
    actionDescription:
      "설문 페이지는 확인했지만, 실제 문항과 개인정보 고지문을 자동으로 읽지 못했습니다.",
    statusBadge: "문항 분석 불가",
    howToRespond:
      "문항 분석이 안 되어 판단이 어렵습니다. 실제 설문 화면에서 운영기관과 안내문을 직접 확인해 주세요.",
  },
};

export const VERDICT_STYLES: Record<VerdictType, string> = {
  SAFE_TO_RESPOND: "border-[#c5e6d4] bg-[#edf7f1] text-[#1f6b47]",
  RESPOND_WITH_CAUTION: "border-[#f0ddb0] bg-[#fdf6e8] text-[#8a5f12]",
  CHECK_NOTICE_BEFORE_INPUT: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]",
  DO_NOT_RESPOND: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  REPORT_OR_INQUIRE: "border-[#f5c2cc] bg-[#fdf0f2] text-[#9e2a3e]",
  LIMITED_DIAGNOSIS: "border-[#cbd5e1] bg-[#f1f5f9] text-[#475569]",
};

export const VERDICT_LABELS: Record<VerdictType, string> = {
  SAFE_TO_RESPOND: "응답 가능",
  RESPOND_WITH_CAUTION: "개인정보 없이 응답",
  CHECK_NOTICE_BEFORE_INPUT: "안내 없으면 입력 금지",
  DO_NOT_RESPOND: "응답 거부·신고 검토",
  REPORT_OR_INQUIRE: "응답 거부·신고 검토",
  LIMITED_DIAGNOSIS: "문항 분석 불가",
};

/** @deprecated HOW_TO_RESPOND_OPTIONS — use SAFETY_TYPE_ACTION_OPTIONS */
export const HOW_TO_RESPOND_OPTIONS: Array<{
  id: string;
  label: string;
  verdicts: VerdictType[];
}> = [
  {
    id: "just_respond",
    label: "응답 가능",
    verdicts: ["SAFE_TO_RESPOND"],
  },
  {
    id: "respond_without_pii",
    label: "개인정보 없이 응답",
    verdicts: ["RESPOND_WITH_CAUTION"],
  },
  {
    id: "check_notice",
    label: "안내 없으면 입력 금지",
    verdicts: ["CHECK_NOTICE_BEFORE_INPUT"],
  },
  {
    id: "official_check",
    label: "공식 확인 후 응답",
    verdicts: [],
  },
  {
    id: "do_not_respond",
    label: "응답 거부·신고 검토",
    verdicts: ["DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
  },
  {
    id: "limited",
    label: "문항 분석 불가",
    verdicts: ["LIMITED_DIAGNOSIS"],
  },
];

/** 사용자용 응답 판단 6종 체크리스트 */
export const SAFETY_TYPE_ACTION_OPTIONS: Array<{
  id: string;
  label: string;
  typeIds: SafetyTypeId[];
}> = [
  {
    id: "safe_respond",
    label: "응답 가능",
    typeIds: ["SAFE_RESPOND"],
  },
  {
    id: "pii_caution",
    label: "개인정보 없이 응답",
    typeIds: ["PII_CAUTION"],
  },
  {
    id: "notice_check",
    label: "안내 없으면 입력 금지",
    typeIds: ["NOTICE_CHECK"],
  },
  {
    id: "security_check",
    label: "공식 확인 후 응답",
    typeIds: ["SECURITY_CHECK"],
  },
  {
    id: "stop_response",
    label: "응답 거부·신고 검토",
    typeIds: ["STOP_RESPONSE"],
  },
  {
    id: "judgment_unknown",
    label: "문항 분석 불가",
    typeIds: ["JUDGMENT_UNKNOWN"],
  },
];
