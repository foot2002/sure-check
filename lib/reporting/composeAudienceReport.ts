import type { DetectedCategory, ScanReport } from "@/lib/types/scan";
import { isExtractionLimitedReport } from "@/lib/scan/limitedReport";
import {
  CATEGORY_LABELS,
  type AudienceReport,
  type CertificationNotice,
  type CollectedDataSummary,
  type KeyReason,
  type PrivacyDataAssessment,
  type PrivacyDataType,
  type RiskDimension,
  type VerdictType,
  type VisualRiskLevel,
} from "@/lib/reporting/reportMessages";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";
import { dedupeFindings } from "@/lib/reporting/dedupeFindings";
import {
  classifyPrivacyDataType,
  decideVerdict,
} from "@/lib/reporting/respondentDecision";
import {
  buildDecisionSummary,
  buildPrimaryReasons,
  getScoreEvaluationForVerdict,
} from "@/lib/reporting/buildDecisionSummary";
import { buildLegalCheckSummary } from "@/lib/reporting/buildLegalCheckSummary";
import { buildToolGovernanceSummary } from "@/lib/reporting/buildToolGovernanceSummary";
import { buildOperatorActions } from "@/lib/reporting/operatorActions";
import { buildOperatorImprovementReport } from "@/lib/reporting/buildOperatorImprovementReport";
import { buildSafetyTypeProfile } from "@/lib/reporting/safetyType";
import {
  buildUserEvidenceCards,
  evidenceCardsToPrimaryReasons,
} from "@/lib/reporting/buildUserEvidenceCards";
import {
  ENDED_SURVEY_HEADLINE,
  isEndedSurveyReport,
} from "@/lib/scan/nonActionableForm";
import {
  buildPublicSectorCsapAssessment,
  shouldElevateToolRiskForCsap,
} from "@/lib/reporting/publicSectorCsap";
import {
  buildPrivateSectorSecurityCertAssessment,
  shouldElevateToolRiskForPrivateCert,
} from "@/lib/reporting/privateSectorSecurityCert";
import { VERDICT_COPY } from "@/lib/reporting/verdictTypes";

const DIRECT_CATEGORIES = new Set<DetectedCategory>([
  "name",
  "phone",
  "email",
  "address",
  "birthdate",
]);

const QUASI_CATEGORIES = new Set<DetectedCategory>([
  "gender",
  "respondent_age",
  "age_range",
  "child_age_range",
  "residence_area",
  "affiliation",
  "organization_identifier",
  "department",
  "position",
  "tenure",
  "quasi_identifier",
]);

const SENSITIVE_CATEGORIES = new Set<DetectedCategory>([
  "sensitive_health",
  "sensitive_belief_union",
  "sensitive_complaint",
  "sensitive_political",
  "sensitive_religion",
]);

const HIGH_RISK_CATEGORIES = new Set<DetectedCategory>([
  "unique_identifier",
  "financial",
  "resident_registration_number",
  "passport_number",
  "driver_license_number",
  "foreign_registration_number",
  "id_document",
  "financial_account",
  "authentication_secret",
]);

const GENERAL_OPINION_CATEGORIES = new Set<DetectedCategory>([
  "program_preference",
  "policy_opinion",
  "service_feedback",
  "visit_purpose",
  "satisfaction",
  "preference",
  "improvement_opinion",
  "general_opinion",
]);

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function labelCategory(category: DetectedCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

function questionLabel(questionText: string, category: DetectedCategory): string {
  const categoryLabel =
    getDetectedCategoryDisplayLabel(category, questionText) || labelCategory(category);
  if (categoryLabel !== "준식별정보") return categoryLabel;
  if (!questionText || questionText === categoryLabel) return categoryLabel;
  if (questionText.length <= 24) return questionText;
  return categoryLabel;
}

function formatKoreanList(values: string[]): string {
  const items = unique(values).slice(0, 3);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")}와 ${items[items.length - 1]}`;
}

function describeQuasiIdentifiers(values: string[]): string {
  const items = unique(values);
  if (items.length === 1) return `${items[0]}만 수집됩니다.`;
  return `${formatKoreanList(items)} 등 준식별정보가 수집됩니다.`;
}

function describeDirectIdentifiers(values: string[]): string {
  const items = unique(values);
  if (items.length === 0) {
    return "이름, 연락처, 이메일 등 개인을 직접 알아볼 수 있는 정보가 있습니다.";
  }
  return `${formatKoreanList(items)} 등 개인을 직접 알아볼 수 있는 정보를 수집합니다.`;
}

function collectDataSummary(report: ScanReport): CollectedDataSummary {
  const directIdentifiers: string[] = [];
  const quasiIdentifiers: string[] = [];
  const generalOpinions: string[] = [];
  const sensitiveItems: string[] = [];
  const highRiskItems: string[] = [];

  for (const question of report.form.questions) {
    const categories = question.detectedCategories ?? [];
    const text = question.questionText ?? question.label;

    for (const category of categories) {
      const label = questionLabel(text, category);
      if (DIRECT_CATEGORIES.has(category)) directIdentifiers.push(label);
      else if (QUASI_CATEGORIES.has(category)) quasiIdentifiers.push(label);
      else if (GENERAL_OPINION_CATEGORIES.has(category)) generalOpinions.push(label);
      else if (SENSITIVE_CATEGORIES.has(category)) sensitiveItems.push(label);
      else if (HIGH_RISK_CATEGORIES.has(category)) highRiskItems.push(label);
    }

    if (categories.length === 0 && question.dataRiskLevel === "D2") {
      quasiIdentifiers.push(text);
    }
    if (categories.length === 0 && question.dataRiskLevel === "D4") {
      sensitiveItems.push(text);
    }
    if (categories.length === 0 && question.dataRiskLevel === "D5") {
      highRiskItems.push(text);
    }
  }

  return {
    directIdentifiers: unique(directIdentifiers),
    quasiIdentifiers: unique(quasiIdentifiers),
    generalOpinions: unique(generalOpinions),
    sensitiveItems: unique(sensitiveItems),
    highRiskItems: unique(highRiskItems),
  };
}

function missingNoticeLabels(report: ScanReport): string[] {
  return unique(report.debug?.missingNotices.map((gap) => gap.label) ?? []);
}

function hasEmployeeContext(report: ScanReport): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  const summary = report.debug?.contextSummary ?? "";
  return (
    Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    /직원|근로|조직진단|employee/i.test(`${labels} ${summary}`)
  );
}

function hasChildRelatedContext(report: ScanReport): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  const text = [
    report.form.title,
    report.debug?.contextSummary,
    labels,
    ...report.form.questions.map((question) => question.label),
  ].join(" ");
  return /어린이|자녀|아동|유아|청소년/.test(text);
}

function hasFreeOpinionQuestion(report: ScanReport): boolean {
  return report.form.questions.some((question) =>
    /자유\s*의견|기타\s*의견|건의|의견|불편\s*사항|개선\s*사항/.test(
      question.label,
    ),
  );
}

function hasPublicSectorContext(report: ScanReport): boolean {
  return Boolean(report.debug?.publicSectorDetected);
}

function hasSensitiveItems(summary: CollectedDataSummary): boolean {
  return summary.sensitiveItems.length > 0;
}

function buildInclusionSummary(
  type: PrivacyDataType,
  summary: CollectedDataSummary,
): string {
  switch (type) {
    case "minimal":
      return "화면에서 확인되는 범위에서는 개인을 알아볼 수 있는 정보가 거의 포함되어 있지 않습니다.";
    case "quasi_only": {
      const items = unique(summary.quasiIdentifiers);
      if (items.length > 0) {
        return `이름·연락처는 요구하지 않지만, ${formatKoreanList(items)} 등 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.`;
      }
      return "이름·연락처는 요구하지 않지만, 성별·연령대·거주지역 등 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.";
    }
    case "direct_identifier":
      return describeDirectIdentifiers(summary.directIdentifiers);
    case "sensitive_or_high_risk":
      if (hasSensitiveItems(summary)) {
        return "민감정보는 별도 동의, 수집 필요성, 접근권한, 보유기간, 파기 기준이 명확해야 합니다.";
      }
      return "고위험 개인정보는 별도 동의, 수집 필요성, 접근권한, 보유기간, 파기 기준이 명확해야 합니다.";
    case "limited":
      return "설문 문항과 개인정보 안내문을 충분히 확인하지 못했습니다.";
  }
}

function buildHeroReasons(
  type: PrivacyDataType,
  report: ScanReport,
  summary: CollectedDataSummary,
): string[] {
  return buildPrimaryReasons(type, report, summary);
}

function buildCertificationNotice(
  type: PrivacyDataType,
  report: ScanReport,
  summary: CollectedDataSummary,
): CertificationNotice | undefined {
  if (type === "minimal" || type === "quasi_only" || type === "limited") {
    return undefined;
  }

  const isPublic = hasPublicSectorContext(report);
  const hasSensitiveOrHighRisk =
    type === "sensitive_or_high_risk" ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;

  let body =
    "개인정보가 포함된 설문은 단순히 문항만 안전하다고 해서 충분하지 않습니다. 수집 도구의 보안성, 운영기관의 관리체계, 접근권한, 보유·파기 절차가 함께 확인되어야 합니다.";

  let contextNote: string | undefined;

  if (hasSensitiveOrHighRisk) {
    body =
      "민감정보 또는 고위험 개인정보를 수집하는 설문은 반드시 보안이 검증된 도구와 관리체계를 갖춘 기관이 운영해야 합니다.";
    if (isPublic) {
      contextNote =
        "공공기관 또는 공공부문 설문에서 개인정보를 수집하는 경우, CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 우선 검토해야 합니다.";
    } else {
      contextNote =
        "민간 기업 또는 조사 수행기관이 개인정보를 처리하는 경우, ISMS-P 등 개인정보보호 관리체계 인증 여부를 확인하는 것이 중요합니다.";
    }
  } else if (type === "direct_identifier") {
    body =
      "개인정보를 수집하는 설문은 보안이 인증된 도구 또는 개인정보보호 관리체계가 확인된 수행기관을 통해 운영되는 것이 바람직합니다.";
    if (isPublic) {
      contextNote =
        "공공기관 또는 공공부문 설문에서 개인정보를 수집하는 경우, CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 우선 검토해야 합니다.";
    } else {
      contextNote =
        "민간 기업 또는 조사 수행기관이 개인정보를 처리하는 경우, ISMS-P 등 개인정보보호 관리체계 인증 여부를 확인하는 것이 중요합니다.";
    }
  }

  return {
    title: "보안 인증 도구 또는 인증된 수행기관 확인 필요",
    body,
    contextNote,
  };
}

function buildPrivacyAssessment(
  report: ScanReport,
  summary: CollectedDataSummary,
  verdict: VerdictType,
): PrivacyDataAssessment {
  const type = classifyPrivacyDataType(report, summary);
  const copy = VERDICT_COPY[verdict];
  const inclusionSummary = buildInclusionSummary(type, summary);
  const missing = missingNoticeLabels(report);

  const highRiskNote =
    type === "direct_identifier" && missing.length >= 3
      ? "고지문이 부족하면 개인정보 처리 기준 확인이 더 필요합니다."
      : undefined;

  return {
    type,
    conclusion: copy.headline,
    inclusionSummary,
    respondentAdvice: copy.actionLabel,
    statusBadge: copy.statusBadge,
    scoreEvaluation: getScoreEvaluationForVerdict(verdict, report.score),
    title: inclusionSummary,
    action: copy.headline,
    description: inclusionSummary,
    quickActions: buildHeroReasons(type, report, summary),
    certificationNotice: buildCertificationNotice(type, report, summary),
    highRiskNote,
  };
}

function buildRespondentReasons(
  report: ScanReport,
  summary: CollectedDataSummary,
): string[] {
  const reasons: string[] = [];
  const missing = missingNoticeLabels(report);

  if (summary.highRiskItems.length > 0) {
    reasons.push("고유식별정보 또는 금융정보처럼 부담이 큰 정보가 포함될 수 있습니다.");
  }
  if (summary.sensitiveItems.length > 0) {
    reasons.push("건강, 고충, 괴롭힘 등 민감한 맥락의 문항이 있습니다.");
  }
  if (summary.directIdentifiers.length > 0) {
    reasons.push(describeDirectIdentifiers(summary.directIdentifiers));
  }
  if (
    summary.quasiIdentifiers.length > 0 &&
    summary.directIdentifiers.length === 0 &&
    summary.sensitiveItems.length === 0
  ) {
    reasons.push(describeQuasiIdentifiers(summary.quasiIdentifiers));
  }
  if (report.platform === "google_forms" && summary.directIdentifiers.length > 0) {
    reasons.push("해외 설문 도구에서 직접식별정보를 수집하므로 보관·이전 안내 확인이 필요합니다.");
  }
  if (report.debug?.publicSectorDetected) {
    reasons.push("공공기관 또는 공공부문 관련 설문으로 보여 관리 주체 확인이 필요합니다.");
  }
  if (
    hasChildRelatedContext(report) &&
    summary.directIdentifiers.length === 0 &&
    summary.highRiskItems.length === 0
  ) {
    reasons.push(
      "아동 관련 시설 이용 설문으로 자녀 연령대가 수집되지만, 자녀 이름·연락처 등 직접 식별정보는 확인되지 않습니다.",
    );
  }
  if (missing.length > 0) {
    reasons.push(`수집·보관 안내를 확인하세요: ${missing.slice(0, 3).join(", ")}.`);
  }

  if (reasons.length === 0) {
    reasons.push("이름·연락처처럼 개인을 직접 알아볼 수 있는 입력 항목은 확인되지 않습니다.");
  }

  return reasons.slice(0, 3);
}

function buildRespondentDoList(report: ScanReport): string[] {
  const missing = missingNoticeLabels(report);
  const items: string[] = [];

  if (missing.some((label) => /목적/.test(label))) {
    items.push("이 설문이 어떤 목적으로 쓰이는지 확인하세요.");
  }
  if (missing.some((label) => /보유|파기/.test(label))) {
    items.push("응답 내용이 언제까지 보관되고 언제 파기되는지 확인하세요.");
  }
  if (missing.some((label) => /담당|처리자|문의/.test(label))) {
    items.push("운영 주체와 문의할 담당자를 확인하세요.");
  }
  if (missing.some((label) => /위탁|수탁/.test(label))) {
    items.push("외부 설문 도구나 수탁자가 누구인지 확인하세요.");
  }
  if (missing.some((label) => /국외|해외/.test(label))) {
    items.push("국외 보관 또는 이전 안내가 있는지 확인하세요.");
  }
  if (report.platform === "naver_forms") {
    items.push("네이버폼을 통한 수집 안내가 있는지 확인하세요.");
  }
  if (hasFreeOpinionQuestion(report)) {
    items.push("자유의견에는 이름, 연락처, 주소 등 개인정보를 쓰지 마세요.");
  }

  if (items.length === 0) {
    items.push("응답 전 설문 안내문에 목적, 보유기간, 담당자가 적혀 있는지 확인하세요.");
  }

  return unique(items).slice(0, 5);
}

function buildRespondentDontList(
  report: ScanReport,
  summary: CollectedDataSummary,
): string[] {
  const items = [
    "주민등록번호",
    "계좌번호",
    "비밀번호나 인증번호",
  ];

  if (summary.sensitiveItems.length > 0 || hasEmployeeContext(report)) {
    items.push("건강정보", "직장 내 고충·괴롭힘 내용", "자유응답의 민감한 개인 사정");
  }
  if (hasFreeOpinionQuestion(report)) {
    items.push("자유의견의 이름·연락처·주소", "자유응답의 민감한 개인 사정");
  }
  if (hasChildRelatedContext(report)) {
    items.push("자녀 이름", "건강정보", "사고 내용");
  }
  if (summary.directIdentifiers.length > 0) {
    items.push("안내문 없이 요구되는 추가 이름/연락처");
  }

  return unique(items).slice(0, 6);
}

function buildNoticeSummary(report: ScanReport): string {
  const missing = missingNoticeLabels(report);
  if (missing.length === 0) {
    return "필수 고지 항목은 대체로 확인됩니다.";
  }
  const confirmedEstimate = Math.max(0, 5 - Math.min(5, missing.length));
  return `필수 고지 5개 중 ${confirmedEstimate}개 확인, ${Math.min(
    5,
    missing.length,
  )}개 확인 필요`;
}

function levelFromScore(score: number): VisualRiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function labelFromLevel(level: VisualRiskLevel): string {
  switch (level) {
    case "low":
      return "낮음";
    case "medium":
      return "보통";
    case "high":
      return "높음";
    case "critical":
      return "매우 높음";
    case "limited":
      return "제한";
  }
}

function buildRiskDimensions(
  report: ScanReport,
  summary: CollectedDataSummary,
): RiskDimension[] {
  if (report.isLimited || report.form.questions.length === 0) {
    return [
      {
        id: "data",
        title: "수집정보 위험",
        level: "limited",
        label: "제한",
        description: "문항을 확인하지 못했습니다.",
        score: 0,
      },
      {
        id: "tool",
        title: "도구·처리경로 위험",
        level: "limited",
        label: "제한",
        description: "처리 경로를 충분히 확인하지 못했습니다.",
        score: 0,
      },
      {
        id: "notice",
        title: "고지·동의 부족",
        level: "limited",
        label: "제한",
        description: "고지문을 확인하지 못했습니다.",
        score: 0,
      },
      {
        id: "management",
        title: "관리·운영 점검",
        level: "limited",
        label: "제한",
        description: "운영 관리 항목을 확인하지 못했습니다.",
        score: 0,
      },
    ];
  }

  const dataScore =
    summary.highRiskItems.length > 0
      ? 95
      : summary.sensitiveItems.length > 0
        ? 85
        : summary.directIdentifiers.length > 0
          ? 65
          : summary.quasiIdentifiers.length > 0
            ? 38
            : 15;
  const toolScore = (() => {
    const privacyType = classifyPrivacyDataType(report, summary);

    // 개인정보 거의 없음 / 준식별만: 도구 위험을 강하게 표시하지 않음
    if (privacyType === "minimal") {
      return report.platform === "google_forms" ? 22 : 12;
    }
    if (privacyType === "quasi_only") {
      return report.platform === "google_forms" ? 35 : 28;
    }

    let score =
      report.platform === "google_forms"
        ? 72
        : report.platform === "generic"
          ? 58
          : report.platform === "naver_forms" || report.platform === "moaform"
            ? 42
            : 24;

    if (shouldElevateToolRiskForCsap(report, summary) || shouldElevateToolRiskForPrivateCert(report, summary)) {
      const hasSensitive =
        summary.sensitiveItems.length > 0 || summary.highRiskItems.length > 0;
      if (hasSensitive) {
        score = Math.max(score, 85);
      } else if (summary.directIdentifiers.length > 0) {
        score = Math.max(score, 78);
      } else {
        score = Math.max(score, 70);
      }
    }

    return score;
  })();
  const noticeCount = report.debug?.missingNotices.length ?? 0;
  const noticeScore = Math.min(95, noticeCount * 14);
  const managementCount =
    report.debug?.managementItems.filter((item) => item.status !== "confirmed")
      .length ?? 0;
  const baseManagementScore = Math.min(90, managementCount * 18);
  const hasOnlyD2OrLower =
    summary.directIdentifiers.length === 0 &&
    summary.sensitiveItems.length === 0 &&
    summary.highRiskItems.length === 0;
  const managementScore = hasOnlyD2OrLower
    ? Math.min(45, baseManagementScore)
    : baseManagementScore;

  const configs = [
    {
      id: "data" as const,
      title: "수집정보 위험",
      score: dataScore,
      description:
        summary.sensitiveItems.length > 0
          ? "민감한 맥락의 응답이 포함될 수 있습니다."
          : summary.directIdentifiers.length > 0
            ? "개인을 알아볼 수 있는 정보가 포함됩니다."
            : summary.quasiIdentifiers.length > 0
              ? "준식별정보 중심으로 수집됩니다."
              : "개인정보 입력 요구가 낮습니다.",
    },
    {
      id: "tool" as const,
      title: "도구·처리경로",
      score: toolScore,
      description: (() => {
        const privacyType = classifyPrivacyDataType(report, summary);
        if (privacyType === "minimal") {
          return "개인정보가 거의 없어 도구 위험을 낮게 평가했습니다.";
        }
        if (privacyType === "quasi_only") {
          return "준식별정보만 있어 도구는 보조 확인 사항입니다.";
        }
        if (
          shouldElevateToolRiskForCsap(report, summary) ||
          shouldElevateToolRiskForPrivateCert(report, summary)
        ) {
          return report.debug?.publicSectorDetected
            ? "공공부문 개인정보 설문에서 CSAP 인증 여부 확인이 필요합니다."
            : "범용 외부 설문도구로 개인정보를 수집하고 있어 보안 인증 확인이 필요합니다.";
        }
        if (report.platform === "google_forms") {
          return "해외 SaaS 사용에 따른 국외 보관·이전 안내 확인이 필요합니다.";
        }
        if (report.platform === "generic") {
          return "지원 플랫폼이 아니어서 베타 진단입니다.";
        }
        return "외부 설문 도구 사용 안내를 확인하세요.";
      })(),
    },
    {
      id: "notice" as const,
      title: "고지·동의 부족",
      score: noticeScore,
      description:
        noticeCount > 0
          ? `확인 필요 고지 ${Math.min(noticeCount, 5)}건이 있습니다.`
          : "필수 고지는 대체로 확인됩니다.",
    },
    {
      id: "management" as const,
      title: "관리·운영 점검",
      score: managementScore,
      description:
        managementCount > 0
          ? "접근권한, 파기, 기관 계정 등 확인 항목이 있습니다."
          : "관리·운영에서 추가로 확인할 항목이 적습니다.",
    },
  ];

  return configs.map((config) => {
    const level = levelFromScore(config.score);
    return {
      ...config,
      level,
      label: labelFromLevel(level),
    };
  });
}

function buildKeyReasons(
  report: ScanReport,
  summary: CollectedDataSummary,
): KeyReason[] {
  if (report.isLimited || report.form.questions.length === 0) {
    return [
      {
        id: "limited",
        category: "limited",
        title: "진단 제한",
        description:
          report.limitedReason ??
          "설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다.",
        severity: "limited",
        evidence: report.limitationReasons?.slice(0, 2) ?? [],
        extraCount: Math.max(0, (report.limitationReasons?.length ?? 0) - 2),
      },
    ];
  }

  const reasons: KeyReason[] = [];
  const evidenceQuestions = report.sections.evidenceItems
    .filter((item) => !/고지 누락|공공부문 근거/.test(item))
    .slice(0, 6);
  const missing = missingNoticeLabels(report);

  if (
    summary.directIdentifiers.length > 0 ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0 ||
    summary.quasiIdentifiers.length > 0
  ) {
    const highest =
      summary.highRiskItems.length > 0
        ? "critical"
        : summary.sensitiveItems.length > 0
          ? "critical"
          : summary.directIdentifiers.length > 0
            ? "high"
            : "medium";
    reasons.push({
      id: "data",
      category: "data",
      title:
        summary.sensitiveItems.length > 0
          ? "민감정보 포함"
          : summary.directIdentifiers.length > 0
            ? "직접식별정보 수집"
            : "준식별정보 수집",
      description:
        summary.sensitiveItems.length > 0
          ? `${formatKoreanList(summary.sensitiveItems)} 관련 문항이 포함되어 있습니다.`
          : summary.directIdentifiers.length > 0
            ? describeDirectIdentifiers(summary.directIdentifiers)
            : describeQuasiIdentifiers(summary.quasiIdentifiers),
      severity: highest,
      evidence: evidenceQuestions.slice(0, 2),
      extraCount: Math.max(0, evidenceQuestions.length - 2),
    });
  }

  if (report.platform === "google_forms" || report.platform === "generic") {
    reasons.push({
      id: "tool",
      category: "tool",
      title:
        report.platform === "google_forms"
          ? "Google Forms 처리경로 확인 필요"
          : "Generic HTML 베타 진단",
      description:
        report.platform === "google_forms"
          ? "국외 보관·이전 또는 외부 도구 사용 안내를 확인하는 것이 좋습니다."
          : "지원 플랫폼이 아니어서 화면에서 확인 가능한 문항만 기준으로 판단했습니다.",
      severity: report.platform === "google_forms" ? "high" : "medium",
      evidence: [report.form.title].filter(Boolean).slice(0, 2),
      extraCount: 0,
    });
  }

  if (missing.length > 0) {
    const grouped = dedupeFindings(report.findings).filter(
      (group) => group.category === "notice" || /고지|안내|위탁|국외|파기/.test(group.title),
    );
    reasons.push({
      id: "notice",
      category: "notice",
      title: grouped[0]?.title ?? "개인정보 안내 보완",
      description: `${missing.slice(0, 3).join(", ")} 항목을 확인하세요.`,
      severity: missing.length >= 5 ? "high" : "medium",
      evidence: missing.slice(0, 2),
      extraCount: Math.max(0, missing.length - 2),
    });
  }

  if (report.debug?.publicSectorDetected || hasEmployeeContext(report)) {
    reasons.push({
      id: "context",
      category: "context",
      title: hasEmployeeContext(report)
        ? "직원/조직진단 맥락"
        : "공공부문 설문 가능성",
      description: hasEmployeeContext(report)
        ? "익명성 기준과 원자료 제공 범위를 확인해야 합니다."
        : "기관 계정, 위탁, 보유·파기 관리체계 확인이 필요합니다.",
      severity: hasEmployeeContext(report) ? "high" : "medium",
      evidence:
        report.debug?.publicSectorEvidence.slice(0, 2) ??
        report.debug?.contextLabels.slice(0, 2) ??
        [],
      extraCount: Math.max(0, (report.debug?.publicSectorEvidence.length ?? 0) - 2),
    });
  }

  const deduped = new Map<string, KeyReason>();
  for (const reason of reasons) {
    if (!deduped.has(reason.id)) deduped.set(reason.id, reason);
  }

  return [...deduped.values()].slice(0, 4);
}

function buildLimitedAudienceReport(report: ScanReport): AudienceReport {
  const isMoaform = report.platform === "moaform";
  const limitedReason =
    report.limitedReason ??
    report.form.limitedReason ??
    (isMoaform
      ? "모아폼 페이지는 확인했지만, 설문 문항을 자동으로 읽지 못했습니다."
      : "설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다.");

  const emptySummary: CollectedDataSummary = {
    directIdentifiers: [],
    quasiIdentifiers: [],
    generalOpinions: [],
    sensitiveItems: [],
    highRiskItems: [],
  };
  const verdict: VerdictType = "LIMITED_DIAGNOSIS";
  const privacyAssessment = buildPrivacyAssessment(report, emptySummary, verdict);
  const decisionSummary = buildDecisionSummary(report, emptySummary, verdict, false);
  const legalCheckSummary = buildLegalCheckSummary(report, emptySummary, "limited");
  const toolGovernanceSummary = buildToolGovernanceSummary(
    report,
    emptySummary,
    "limited",
  );
  const safetyType = buildSafetyTypeProfile(report, emptySummary, verdict, false);
  const ended = isEndedSurveyReport(report);
  const userEvidenceCards = ended
    ? []
    : buildUserEvidenceCards(report, emptySummary, safetyType.typeId);
  const operatorImprovement = buildOperatorImprovementReport(
    report,
    emptySummary,
    [],
    [],
  );

  // Moaform-specific copy overrides (do not invent PII / legal judgments)
  if (isMoaform && !ended) {
    safetyType.whyProblem =
      "설문 페이지는 확인했지만, 실제 문항과 개인정보 고지문을 자동으로 읽지 못했습니다.";
    safetyType.description = safetyType.whyProblem;
    safetyType.headline = "문항 분석이 안 되어 판단이 어렵습니다.";
    safetyType.legalOrLimitTitle = "판단 한계";
    safetyType.legalOrLimitBody =
      "이 설문이 개인정보나 민감정보를 수집하는지 확인할 수 없습니다.";
    safetyType.howToAct =
      "실제 설문 화면에서 운영기관, 수집 항목, 보유기간, 파기 기준, 담당자 안내를 직접 확인해 주세요.";
    safetyType.action = safetyType.howToAct;
    safetyType.toolBadge = "Moaform";
    safetyType.dataBadge = "확인 불가";
    if (
      report.form.metadata?.operatorHint &&
      safetyType.subjectLabel === "확인 불가"
    ) {
      safetyType.subjectLabel = `${report.form.metadata.operatorHint} (확인 필요)`;
    }
    decisionSummary.primaryReasons = [
      "모아폼 페이지는 확인됨",
      "문항 자동 추출 제한",
      "설문 화면에서 안내문 직접 확인 필요",
    ];
    decisionSummary.actionDescription = safetyType.howToAct;
    decisionSummary.headline = safetyType.headline;
    privacyAssessment.conclusion = "문항 분석이 안 되어 판단이 어렵습니다.";
    privacyAssessment.inclusionSummary = safetyType.whyProblem;
    privacyAssessment.quickActions = decisionSummary.primaryReasons;
  } else if (ended) {
    safetyType.headline = ENDED_SURVEY_HEADLINE;
    safetyType.displayName = "종료된 설문";
    safetyType.typeName = "종료된 설문";
    safetyType.howToAct =
      "응답이 종료되어 더 이상 문항을 확인할 수 없습니다.";
    safetyType.action = safetyType.howToAct;
    safetyType.description = safetyType.howToAct;
    safetyType.whyProblem = safetyType.howToAct;
    safetyType.toolJudgmentBadge = "종료된 설문";
    safetyType.isEndedSurvey = true;
    safetyType.hideJudgmentDetails = true;
    if (isMoaform) {
      safetyType.toolBadge = "Moaform";
      safetyType.dataBadge = "확인 불가";
    }
    decisionSummary.primaryReasons = ["종료된 설문 — 분석 대상 아님"];
    decisionSummary.actionDescription = safetyType.howToAct;
    decisionSummary.headline = ENDED_SURVEY_HEADLINE;
    privacyAssessment.conclusion = ENDED_SURVEY_HEADLINE;
    privacyAssessment.inclusionSummary = safetyType.howToAct;
    privacyAssessment.quickActions = decisionSummary.primaryReasons;
  } else {
    decisionSummary.primaryReasons = evidenceCardsToPrimaryReasons(userEvidenceCards);
    privacyAssessment.quickActions = decisionSummary.primaryReasons;
  }

  return {
    isLimited: true,
    privacyAssessment,
    respondentDecision: verdict,
    respondentDecisionTitle: privacyAssessment.conclusion,
    respondentDecisionSummary: privacyAssessment.inclusionSummary,
    respondentReasons: [limitedReason],
    collectedDataSummary: emptySummary,
    respondentDoList: isMoaform
      ? [
          "설문 첫 화면의 운영기관·수집 목적·보유기간·담당자를 직접 확인하세요.",
          "개인정보 고지문이 보이기 전에는 개인정보를 입력하지 마세요.",
        ]
      : [
          "설문 운영 주체와 목적을 직접 확인하세요.",
          "개인정보를 요구한다면 보유기간과 담당자 안내가 있는지 확인하세요.",
        ],
    respondentDontList: ["주민등록번호", "계좌번호", "비밀번호나 인증번호"],
    operatorSummary: isMoaform
      ? "모아폼 문항을 자동으로 확인하지 못해 제한 진단용 핵심 개선사항만 안내합니다."
      : "문항을 확인하지 못해 운영자 보완 리포트를 최소화했습니다.",
    operatorTopFixes: isMoaform
      ? [
          {
            priority: "required" as const,
            category: "basic_notice" as const,
            title: "모아폼 문항 자동 확인 제한",
            reason: "모아폼 페이지는 확인했지만 문항을 자동으로 읽지 못했습니다.",
            action: "설문 첫 화면에 운영기관·수집 목적·보유기간·담당자와 개인정보 고지문을 명확히 노출하세요.",
          },
          {
            priority: "recommended" as const,
            category: "outsourcing" as const,
            title: "외부 설문도구 이용 안내",
            reason: "모아폼 등 외부 설문도구로 응답이 처리될 수 있습니다.",
            action: "외부 설문도구 이용 사실과 수탁자·위탁업무를 안내하세요.",
          },
        ]
      : [],
    requiredFixes: isMoaform
      ? [
          {
            priority: "required" as const,
            category: "basic_notice" as const,
            title: "모아폼 문항 자동 확인 제한",
            reason: "모아폼 페이지는 확인했지만 문항을 자동으로 읽지 못했습니다.",
            action: "설문 첫 화면에 운영기관·수집 목적·보유기간·담당자와 개인정보 고지문을 명확히 노출하세요.",
          },
        ]
      : [],
    recommendedFixes: isMoaform
      ? [
          {
            priority: "recommended" as const,
            category: "outsourcing" as const,
            title: "외부 설문도구 이용 안내",
            reason: "모아폼 등 외부 설문도구로 응답이 처리될 수 있습니다.",
            action: "외부 설문도구 이용 사실과 수탁자·위탁업무를 안내하세요.",
          },
        ]
      : [],
    copyableTemplates: [],
    riskDimensions: buildRiskDimensions(report, emptySummary),
    keyReasons: isMoaform
      ? [
          {
            id: "moaform_page_ok",
            category: "tool",
            title: "모아폼 페이지 확인",
            description: "모아폼 페이지는 확인되었습니다.",
            severity: "limited",
            evidence: ["사용도구: Moaform"],
            extraCount: 0,
          },
          {
            id: "moaform_q_limit",
            category: "limited",
            title: "문항 자동 추출 제한",
            description:
              "JavaScript 동적 로딩 등으로 문항을 HTML에서 읽지 못했습니다.",
            severity: "limited",
            evidence: [limitedReason],
            extraCount: 0,
          },
          {
            id: "moaform_manual_check",
            category: "management",
            title: "설문 화면에서 직접 확인",
            description:
              "실제 설문 화면에서 운영기관, 수집 항목, 보유기간, 파기 기준, 담당자 안내를 직접 확인해 주세요.",
            severity: "limited",
            evidence: [],
            extraCount: 0,
          },
        ]
      : buildKeyReasons(report, emptySummary),
    noticeSummary: isMoaform
      ? "모아폼 문항 자동 확인 제한"
      : "문항 자동 추출 불가",
    detailsSummary: "진단 제한 사유와 원본 JSON만 확인할 수 있습니다.",
    decisionSummary,
    legalCheckSummary,
    toolGovernanceSummary,
    safetyType,
    operatorImprovement,
    userEvidenceCards,
  };
}

export function composeAudienceReport(report: ScanReport): AudienceReport {
  if (isExtractionLimitedReport(report) || report.form.questions.length === 0) {
    return buildLimitedAudienceReport(report);
  }

  const collectedDataSummary = collectDataSummary(report);
  const privacyType = classifyPrivacyDataType(report, collectedDataSummary);
  const respondentDecision = decideVerdict(report, collectedDataSummary);
  const isReportRecommended = respondentDecision === "REPORT_OR_INQUIRE";

  const publicSectorCsapWarning =
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk" ||
    privacyType === "quasi_only"
      ? buildPublicSectorCsapAssessment(report, collectedDataSummary)
      : undefined;
  const privateSectorSecurityCertWarning =
    publicSectorCsapWarning ||
    (privacyType !== "direct_identifier" && privacyType !== "sensitive_or_high_risk")
      ? undefined
      : buildPrivateSectorSecurityCertAssessment(report, collectedDataSummary);

  const privacyAssessment = buildPrivacyAssessment(
    report,
    collectedDataSummary,
    respondentDecision,
  );
  const decisionSummary = buildDecisionSummary(
    report,
    collectedDataSummary,
    respondentDecision,
    isReportRecommended,
  );
  const legalCheckSummary = buildLegalCheckSummary(
    report,
    collectedDataSummary,
    privacyType,
  );
  const toolGovernanceSummary = buildToolGovernanceSummary(
    report,
    collectedDataSummary,
    privacyType,
  );

  const operatorActions = buildOperatorActions(report, collectedDataSummary);
  const safetyType = buildSafetyTypeProfile(
    report,
    collectedDataSummary,
    respondentDecision,
    isReportRecommended,
  );
  const operatorImprovement = buildOperatorImprovementReport(
    report,
    collectedDataSummary,
    operatorActions.operatorTopFixes,
    operatorActions.copyableTemplates,
  );
  const userEvidenceCards = buildUserEvidenceCards(
    report,
    collectedDataSummary,
    safetyType.typeId,
  );
  decisionSummary.primaryReasons = evidenceCardsToPrimaryReasons(userEvidenceCards);
  privacyAssessment.quickActions = decisionSummary.primaryReasons;

  const detailsSummary = [
    report.findings.length > 0 ? `상세 finding ${report.findings.length}건` : "",
    report.sections.evidenceItems.length > 0
      ? `근거 ${report.sections.evidenceItems.length}건`
      : "",
    report.analyzerTrace?.steps.length
      ? `Analyzer trace ${report.analyzerTrace.steps.length}단계`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    isLimited: false,
    privacyAssessment,
    respondentDecision,
    respondentDecisionTitle: privacyAssessment.conclusion,
    respondentDecisionSummary: privacyAssessment.inclusionSummary,
    respondentReasons: buildRespondentReasons(report, collectedDataSummary),
    collectedDataSummary,
    respondentDoList: buildRespondentDoList(report),
    respondentDontList: buildRespondentDontList(report, collectedDataSummary),
    ...operatorActions,
    riskDimensions: buildRiskDimensions(report, collectedDataSummary),
    keyReasons: buildKeyReasons(report, collectedDataSummary),
    publicSectorCsapWarning,
    privateSectorSecurityCertWarning,
    noticeSummary: buildNoticeSummary(report),
    detailsSummary: detailsSummary || "상세 근거가 제한적입니다.",
    decisionSummary,
    legalCheckSummary,
    toolGovernanceSummary,
    safetyType,
    operatorImprovement,
    userEvidenceCards,
  };
}
