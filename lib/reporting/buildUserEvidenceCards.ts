import type { CollectedDataSummary } from "@/lib/reporting/reportMessages";
import {
  classifyPrivacyDataType,
  missingNoticeLabels,
} from "@/lib/reporting/respondentDecision";
import {
  classifySurveySubject,
  isPublicLikeSubject,
  type SafetyTypeId,
} from "@/lib/reporting/safetyType";
import { getToolCsapProfile } from "@/lib/reporting/toolRegistry";
import type { ScanReport } from "@/lib/types/scan";

export type UserEvidenceCardKind =
  | "public_external_tool"
  | "sensitive_high_risk"
  | "direct_identifiers"
  | "retention_destruction"
  | "overseas_transfer"
  | "outsourcing_notice"
  | "operator_unclear"
  | "free_opinion_caution"
  | "limited_analysis"
  | "limited_data_unknown"
  | "limited_manual_check";

export interface UserEvidenceCard {
  id: UserEvidenceCardKind;
  title: string;
  /** 현재 확인된 사실 */
  fact: string;
  /** 왜 문제인지 */
  whyProblem: string;
  /** 관련 기준 (chip용) */
  basisLabels: string[];
  /** 확인 또는 조치 필요사항 */
  action: string;
  /** 실제 탐지된 수집 항목 칩 */
  detectedItems?: string[];
  /** 써야 할 도구 vs 현재 도구 */
  toolCompare?: {
    shouldUse: string;
    currentlyUses: string;
  };
  priority: number;
}

const MAX_USER_EVIDENCE_CARDS = 4;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function hasRetentionGap(report: ScanReport): boolean {
  return missingNoticeLabels(report).some((label) =>
    /보유|파기|이용\s*기간/.test(label),
  );
}

function hasFreeOpinion(report: ScanReport, summary: CollectedDataSummary): boolean {
  if (summary.generalOpinions.some((item) => /자유|의견|건의/.test(item))) {
    return true;
  }
  return report.form.questions.some((question) =>
    /자유\s*의견|기타\s*의견|건의|의견|불편\s*사항|개선\s*사항/.test(
      question.label,
    ),
  );
}

function buildLimitedCards(): UserEvidenceCard[] {
  return [
    {
      id: "limited_analysis",
      title: "문항 자동 분석 실패",
      fact: "설문 페이지는 확인했지만 실제 문항을 자동으로 읽지 못했습니다.",
      whyProblem:
        "문항을 확인하지 못하면 개인정보·민감정보 수집 여부와 법적 위험을 확정할 수 없습니다.",
      basisLabels: [],
      action: "위험 판단을 확정하지 않으며, 분석 한계로 안내합니다.",
      priority: 1,
    },
    {
      id: "limited_data_unknown",
      title: "수집정보 판단 불가",
      fact: "문항을 확인하지 못했기 때문에 개인정보나 민감정보 수집 여부를 판단할 수 없습니다.",
      whyProblem: "수집 항목이 확인되지 않으면 응답 판단을 구체화하기 어렵습니다.",
      basisLabels: [],
      action: "실제 설문 화면의 문항과 안내문을 직접 확인하세요.",
      priority: 2,
    },
    {
      id: "limited_manual_check",
      title: "직접 확인 필요",
      fact: "자동 진단만으로는 운영기관과 고지 내용을 충분히 확인하지 못했습니다.",
      whyProblem: "응답 전에 수집·보관·담당자 안내가 있는지 사람이 확인해야 합니다.",
      basisLabels: [],
      action:
        "실제 설문 화면에서 운영기관, 수집 항목, 보유기간, 파기 기준, 담당자 안내를 확인해 주세요.",
      priority: 3,
    },
  ];
}

function buildPublicExternalToolCard(
  toolLabel: string,
  isOverseas: boolean,
): UserEvidenceCard {
  return {
    id: "public_external_tool",
    title: "공공기관 개인정보 설문에 부적절한 외부도구 사용",
    fact: `이 설문은 공공기관이 개인정보를 수집하면서 ${toolLabel} 등 외부 설문도구를 사용하고 있습니다.`,
    whyProblem: isOverseas
      ? "공공기관이 개인정보를 클라우드 기반 도구로 수집할 때는 도구의 보안성, 접근권한, 국외 보관 가능성, 보유·파기, 위탁 관리가 확인되어야 합니다."
      : "공공기관이 개인정보를 외부 설문도구로 수집할 경우 보안성, 접근권한, 위탁, 보유·파기 기준이 확인되어야 합니다.",
    basisLabels: isOverseas
      ? [
          "개인정보보호법 제29조",
          "클라우드컴퓨팅법/CSAP",
          "행정·공공기관 클라우드 이용 기준",
          "국정원 보안성 검토 기준 확인 필요",
        ]
      : [
          "개인정보보호법 제26조",
          "개인정보보호법 제29조",
          "클라우드컴퓨팅법/CSAP",
          "행정·공공기관 클라우드 이용 기준",
          "국정원 보안성 검토 기준 확인 필요",
        ],
    action:
      "CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 우선 검토해야 합니다.",
    toolCompare: {
      shouldUse: "CSAP 인증 등 공공부문 보안 기준을 충족하는 수집도구",
      currentlyUses: toolLabel,
    },
    priority: 1,
  };
}

/**
 * 사용자용 판단 핵심 근거 카드 (최대 4개, 우선순위 정렬)
 */
export function buildUserEvidenceCards(
  report: ScanReport,
  summary: CollectedDataSummary,
  safetyTypeId: SafetyTypeId,
): UserEvidenceCard[] {
  if (safetyTypeId === "JUDGMENT_UNKNOWN" || report.isLimited) {
    return buildLimitedCards();
  }

  const privacyType = classifyPrivacyDataType(report, summary);
  const subject = classifySurveySubject(report);
  const publicLike = isPublicLikeSubject(subject);
  const tool = getToolCsapProfile(report.platform, report.form.management);
  const toolLabel = tool.platformLabel;
  const external =
    tool.isExternalSaaS && tool.csapStatus !== "certified";
  const overseas = tool.toolCategory === "overseas_saas";
  const domesticSaaS = tool.toolCategory === "domestic_saas";

  const hasDirect =
    privacyType === "direct_identifier" ||
    summary.directIdentifiers.length > 0;
  const hasSensitiveOrHigh =
    privacyType === "sensitive_or_high_risk" ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;
  const hasPiiForNotices =
    hasDirect || hasSensitiveOrHigh || privacyType === "quasi_only";

  const candidates: UserEvidenceCard[] = [];

  // 1) 공공 + 개인정보 + 외부 미인증/CSAP 확인 불가
  if (
    publicLike &&
    (hasDirect || hasSensitiveOrHigh) &&
    external
  ) {
    candidates.push(buildPublicExternalToolCard(toolLabel, overseas));
  }

  // 2) 민감/고위험
  if (hasSensitiveOrHigh) {
    const items = unique([
      ...summary.sensitiveItems,
      ...summary.highRiskItems,
    ]).slice(0, 6);
    candidates.push({
      id: "sensitive_high_risk",
      title: "민감정보 또는 고위험 개인정보 수집",
      fact:
        items.length > 0
          ? `이 설문에는 ${items.join(", ")} 등 민감하거나 위험도가 높은 정보가 포함될 수 있습니다.`
          : "건강상태, 고충, 피해경험, 주민등록번호, 계좌번호 등 민감하거나 위험도가 높은 정보가 포함될 수 있습니다.",
      whyProblem:
        "이 정보들은 응답자에게 불이익이나 피해가 발생할 수 있어 별도 동의, 수집 필요성, 접근권한, 보유·파기 기준이 명확해야 합니다.",
      basisLabels: [
        "개인정보보호법 제23조",
        "개인정보보호법 제24조",
        "개인정보보호법 제29조",
      ],
      action:
        "불필요한 문항은 삭제하고, 필요한 경우 별도 동의와 보호조치를 명시해야 합니다.",
      detectedItems: items,
      priority: 2,
    });
  }

  // 3) 직접식별정보
  if (hasDirect) {
    const items = unique(summary.directIdentifiers).slice(0, 8);
    const itemLabel =
      items.length > 0 ? items.join("·") : "이름·연락처·이메일";
    candidates.push({
      id: "direct_identifiers",
      title:
        items.length === 1
          ? `${items[0]} 등 직접식별정보 수집`
          : "개인을 직접 알아볼 수 있는 정보 수집",
      fact: `이 설문은 ${itemLabel} 등 개인을 직접 알아볼 수 있는 정보를 수집합니다.`,
      whyProblem:
        "이런 정보는 응답자를 직접 식별할 수 있으므로 수집 목적, 보유기간, 파기 기준, 담당자 안내가 명확해야 합니다.",
      basisLabels: [
        "개인정보보호법 제15조",
        "개인정보보호법 제21조",
        "개인정보보호법 제29조",
      ],
      action:
        "수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자, 동의 거부권을 설문 첫 화면에 안내해야 합니다.",
      detectedItems: items,
      priority: 3,
    });
  }

  // 4) 보유기간·파기
  if ((hasDirect || hasSensitiveOrHigh) && hasRetentionGap(report)) {
    candidates.push({
      id: "retention_destruction",
      title: "보유기간·파기 기준 미확인",
      fact: "개인정보를 언제까지 보관하고 언제 삭제하는지 안내가 충분히 확인되지 않았습니다.",
      whyProblem:
        "개인정보는 수집 목적이 끝나면 지체 없이 파기되어야 하며, 응답자는 보관기간과 파기 기준을 알 수 있어야 합니다.",
      basisLabels: ["개인정보보호법 제21조"],
      action:
        "예: 조사 종료 후 3개월 보관 후 파기, 경품 발송 후 즉시 파기 등 구체적인 기준을 표시해야 합니다.",
      priority: 4,
    });
  }

  // 5) 국외 보관·이전 (해외 SaaS만) — 개인정보 수집 시 기본 표시
  if (overseas && (hasDirect || hasSensitiveOrHigh)) {
    candidates.push({
      id: "overseas_transfer",
      title: "국외 보관·이전 안내 미확인",
      fact: `${toolLabel} 등 해외 기반 설문도구를 사용하고 있습니다.`,
      whyProblem:
        "해외 SaaS를 통해 개인정보를 수집하면 개인정보가 국외에 보관되거나 이전될 가능성을 확인해야 합니다.",
      basisLabels: ["개인정보보호법 제28조의8"],
      action:
        "이전 국가, 이전받는 자, 이전 목적, 보유기간, 거부권 등을 안내해야 합니다.",
      priority: 5,
    });
  }

  // 6) 위탁/외부도구 안내 (국내 SaaS) — 개인정보 수집 시 기본 표시
  if (domesticSaaS && (hasDirect || hasSensitiveOrHigh)) {
    candidates.push({
      id: "outsourcing_notice",
      title: "외부 설문도구 이용 안내 미확인",
      fact: "설문 응답이 외부 설문도구를 통해 수집되고 있으나, 수탁자나 위탁업무 안내가 충분히 확인되지 않습니다.",
      whyProblem:
        "외부 서비스를 통해 개인정보를 처리하는 경우, 누가 어떤 업무를 맡는지와 관리 기준이 안내되어야 합니다.",
      basisLabels: ["개인정보보호법 제26조"],
      action: "수탁자, 위탁업무, 보관 위치, 접근권한, 파기 기준을 안내해야 합니다.",
      priority: 6,
    });
  }

  // 7) 운영기관 불명확
  if (subject === "unknown" && (hasDirect || hasSensitiveOrHigh)) {
    candidates.push({
      id: "operator_unclear",
      title: "운영기관 불명확",
      fact: "설문 운영기관·담당자가 명확하지 않은 상태에서 개인정보 입력을 요구하고 있습니다.",
      whyProblem:
        "누가 개인정보를 수집·보관하는지 알 수 없으면 문의·신고·파기 요청이 어렵습니다.",
      basisLabels: ["개인정보보호법 제15조", "개인정보보호법 제29조"],
      action:
        "기관 홈페이지·공식 공지·대표 연락처로 공식 설문인지 확인한 뒤 응답하세요.",
      priority: 7,
    });
  }

  // 8) 자유의견 주의
  if (hasFreeOpinion(report, summary) && hasPiiForNotices) {
    candidates.push({
      id: "free_opinion_caution",
      title: "자유의견 개인정보 입력 주의",
      fact: "자유의견·기타의견 문항이 있어 이름·연락처·건강상태 등을 추가로 쓸 수 있습니다.",
      whyProblem:
        "선택 문항이 안전해도 자유응답에 개인정보를 쓰면 식별·유출 위험이 커질 수 있습니다.",
      basisLabels: ["개인정보보호법 제16조"],
      action:
        "자유의견에는 이름, 연락처, 건강상태, 구체적인 개인 사정을 쓰지 않는 것이 좋습니다.",
      priority: 8,
    });
  }

  // 준식별만 있고 상위 카드가 거의 없을 때 최소 근거
  if (candidates.length === 0 && privacyType === "quasi_only") {
    const items = unique(summary.quasiIdentifiers).slice(0, 5);
    candidates.push({
      id: "direct_identifiers",
      title: "준식별정보 포함",
      fact:
        items.length > 0
          ? `${items.join(", ")}처럼 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.`
          : "성별, 연령대, 거주지역처럼 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.",
      whyProblem:
        "준식별정보만으로도 다른 정보와 결합되면 식별 위험이 생길 수 있습니다.",
      basisLabels: ["개인정보보호법 제15조", "개인정보보호법 제16조"],
      action:
        "자유의견에는 이름·연락처 등 개인정보를 추가로 쓰지 않는 것이 좋습니다.",
      detectedItems: items,
      priority: 3,
    });
  }

  if (candidates.length === 0 && privacyType === "minimal") {
    candidates.push({
      id: "free_opinion_caution",
      title: "직접식별·민감정보 미확인",
      fact: "이름, 연락처, 이메일처럼 개인을 직접 알아볼 수 있는 정보는 확인되지 않았습니다.",
      whyProblem: "확인된 범위에서는 응답해도 무리가 없어 보입니다.",
      basisLabels: [],
      action: "자유의견에만 개인정보를 쓰지 않으면 응답해도 괜찮습니다.",
      priority: 8,
    });
  }

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_USER_EVIDENCE_CARDS);
}

export function evidenceCardsToPrimaryReasons(
  cards: UserEvidenceCard[],
): string[] {
  return cards.slice(0, 3).map((card) => {
    if (card.toolCompare) {
      return `${card.title}: 써야 할 도구(${card.toolCompare.shouldUse}) / 현재(${card.toolCompare.currentlyUses})`;
    }
    if (card.detectedItems && card.detectedItems.length > 0) {
      return `${card.title}: ${card.detectedItems.join(", ")}`;
    }
    return `${card.title} — ${card.fact}`;
  });
}
