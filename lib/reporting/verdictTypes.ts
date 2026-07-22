import type { RiskGrade } from "@/lib/types/scan";
import type { PrivacyDataType } from "@/lib/reporting/reportMessages";

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
    headline: "이 설문은 응답해도 무리가 낮습니다.",
    actionLabel: "자유의견에 개인정보만 쓰지 마세요.",
    actionDescription:
      "화면에서 확인되는 범위에서는 개인정보·민감정보 위험이 낮습니다.",
    statusBadge: "응답 가능",
    howToRespond:
      "응답해도 무리가 낮습니다. 다만 자유의견에는 개인정보를 쓰지 마세요.",
  },
  RESPOND_WITH_CAUTION: {
    headline: "이 설문은 개인정보·민감정보는 없으나, 일부 주의가 필요합니다.",
    actionLabel:
      "응답은 가능해 보입니다. 다만 개인정보를 추가로 쓰지 마세요.",
    actionDescription:
      "준식별정보 또는 일부 고지 확인이 필요할 수 있습니다.",
    statusBadge: "주의 필요",
    howToRespond:
      "응답은 가능해 보입니다. 이름, 연락처, 건강상태 같은 개인정보를 추가로 쓰지 마세요.",
  },
  CHECK_NOTICE_BEFORE_INPUT: {
    headline:
      "이 설문은 개인정보를 수집합니다. 고지문 확인 전에는 입력하지 마세요.",
    actionLabel:
      "수집 목적, 보유기간, 파기 기준, 담당자를 확인한 뒤 응답하세요.",
    actionDescription:
      "이름·연락처·이메일 등 직접식별정보가 포함되어 있습니다.",
    statusBadge: "고지 확인 후 응답",
    howToRespond:
      "개인정보를 수집합니다. 수집 목적, 보유기간, 파기 기준, 담당자를 확인한 뒤 응답하세요.",
  },
  DO_NOT_RESPOND: {
    headline: "이 설문은 응답하지 않는 것이 좋습니다.",
    actionLabel:
      "민감정보 또는 고위험 개인정보가 포함될 수 있으므로 운영기관에 먼저 확인하세요.",
    actionDescription:
      "민감정보·고위험정보 또는 식별·불이익 우려가 큰 맥락이 확인됩니다.",
    statusBadge: "응답하지 않기",
    howToRespond:
      "민감정보 또는 고위험 개인정보가 포함될 수 있습니다. 처리 기준이 명확하지 않다면 응답하지 않는 것이 좋습니다.",
  },
  REPORT_OR_INQUIRE: {
    headline: "이 설문은 운영기관 문의 또는 신고 검토가 필요합니다.",
    actionLabel:
      "개인정보 처리 기준이 불명확하면 응답하지 말고 운영기관에 문의하거나 신고를 검토하세요.",
    actionDescription:
      "민감·고위험정보 수집과 고지 부족 등이 함께 확인됩니다.",
    statusBadge: "문의·신고 검토",
    howToRespond:
      "개인정보 처리 기준이 불명확한 상태에서 민감정보 또는 고위험정보를 수집하고 있습니다. 운영기관에 문의하거나 신고를 검토하세요.",
  },
  LIMITED_DIAGNOSIS: {
    headline: "이 설문은 안전성을 판단할 수 없습니다.",
    actionLabel:
      "개인정보를 입력하기 전 설문 안내문과 운영기관을 직접 확인하세요.",
    actionDescription: "설문 문항을 자동으로 확인하지 못했습니다.",
    statusBadge: "판단 불가",
    howToRespond:
      "문항을 확인하지 못했습니다. 개인정보를 입력하기 전 운영기관과 고지문을 직접 확인하세요.",
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
  RESPOND_WITH_CAUTION: "주의 필요",
  CHECK_NOTICE_BEFORE_INPUT: "고지 확인 후 응답",
  DO_NOT_RESPOND: "응답하지 않기",
  REPORT_OR_INQUIRE: "문의·신고 검토",
  LIMITED_DIAGNOSIS: "판단 불가",
};

/** UI 비교 체크리스트용 행동 옵션 */
export const HOW_TO_RESPOND_OPTIONS: Array<{
  id: string;
  label: string;
  verdicts: VerdictType[];
}> = [
  {
    id: "just_respond",
    label: "그냥 응답 가능",
    verdicts: ["SAFE_TO_RESPOND"],
  },
  {
    id: "respond_without_pii",
    label: "개인정보를 쓰지 않고 응답",
    verdicts: ["RESPOND_WITH_CAUTION"],
  },
  {
    id: "check_notice",
    label: "고지문 확인 후 응답",
    verdicts: ["CHECK_NOTICE_BEFORE_INPUT"],
  },
  {
    id: "do_not_respond",
    label: "응답하지 않기",
    verdicts: ["DO_NOT_RESPOND"],
  },
  {
    id: "report_inquire",
    label: "운영기관 문의 또는 신고 검토",
    verdicts: ["REPORT_OR_INQUIRE"],
  },
  {
    id: "limited",
    label: "판단 불가",
    verdicts: ["LIMITED_DIAGNOSIS"],
  },
];
