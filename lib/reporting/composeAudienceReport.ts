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
  type RespondentDecision,
  type RiskDimension,
  type VisualRiskLevel,
} from "@/lib/reporting/reportMessages";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";
import { dedupeFindings } from "@/lib/reporting/dedupeFindings";
import {
  decideRespondentDecision,
} from "@/lib/reporting/respondentDecision";
import { buildOperatorActions } from "@/lib/reporting/operatorActions";
import {
  buildCsapHeroReason,
  buildPublicSectorCsapAssessment,
  hasEmployeeSensitiveCombination,
  shouldElevateToolRiskForCsap,
} from "@/lib/reporting/publicSectorCsap";
import {
  buildPrivateSectorHeroReason,
  buildPrivateSectorSecurityCertAssessment,
  shouldElevateToolRiskForPrivateCert,
} from "@/lib/reporting/privateSectorSecurityCert";

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
  const missing = missingNoticeLabels(report);
  const reasons: string[] = [];

  switch (type) {
    case "minimal":
      reasons.push("이름·연락처·이메일은 요구하지 않습니다.");
      if (summary.generalOpinions.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.generalOpinions)} 등 의견·선호도를 묻습니다.`,
        );
      }
      reasons.push("자유의견에는 개인정보를 쓰지 않는 것이 좋습니다.");
      break;
    case "quasi_only":
      if (summary.quasiIdentifiers.length > 0) {
        reasons.push(`${formatKoreanList(summary.quasiIdentifiers)}가 수집됩니다.`);
      }
      reasons.push("이름·연락처는 요구하지 않습니다.");
      if (summary.generalOpinions.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.generalOpinions)} 등 의견·선호도를 묻습니다.`,
        );
      }
      reasons.push("자유의견에 개인정보를 쓰지 않도록 안내가 필요합니다.");
      break;
    case "direct_identifier":
      if (summary.directIdentifiers.length > 0) {
        reasons.push(`${formatKoreanList(summary.directIdentifiers)}를 수집합니다.`);
      }
      if (missing.some((label) => /보유|파기/.test(label))) {
        reasons.push("보유기간과 파기 기준 안내가 필요합니다.");
      }
      if (missing.some((label) => /목적/.test(label))) {
        reasons.push("수집 목적 안내가 부족합니다.");
      }
      if (
        report.platform === "google_forms" ||
        report.platform === "naver_forms" ||
        report.platform === "moaform"
      ) {
        reasons.push("외부 설문도구 사용 안내가 필요합니다.");
      }
      break;
    case "sensitive_or_high_risk":
      if (summary.sensitiveItems.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.sensitiveItems)} 관련 문항이 포함되어 있습니다.`,
        );
      }
      if (summary.highRiskItems.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.highRiskItems)} 등 고위험정보를 수집합니다.`,
        );
      }
      if (summary.directIdentifiers.length > 0 || summary.quasiIdentifiers.length > 0) {
        reasons.push("응답자를 식별할 수 있는 정보와 결합될 수 있습니다.");
      }
      reasons.push("별도 동의와 접근권한 관리가 필요합니다.");
      reasons.push("보안 인증 도구와 관리체계 확인이 필요합니다.");
      break;
    case "limited":
      reasons.push("설문 문항을 자동으로 확인하지 못했습니다.");
      reasons.push("개인정보 안내문 확인이 필요합니다.");
      reasons.push("운영기관·담당자를 직접 확인해야 합니다.");
      break;
  }

  return unique(reasons).slice(0, 3);
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

function getScoreEvaluation(
  type: PrivacyDataType,
  score: number | null | undefined,
  decision: RespondentDecision,
): string {
  if (type === "limited" || score == null) return "판단 불가";

  if (type === "sensitive_or_high_risk" || decision === "hold_response") {
    return "응답하지 않는 것이 좋음";
  }
  if (type === "direct_identifier" || decision === "check_before_responding") {
    return score < 50 ? "개인정보 노출 위험" : "확인 후 응답";
  }
  if (type === "quasi_only" || decision === "respond_with_caution") {
    return "주의 필요";
  }

  if (score >= 85) return "응답해도 비교적 안전";
  if (score >= 70) return "주의 필요";
  if (score >= 50) return "확인 후 응답";
  if (score >= 30) return "개인정보 노출 위험";
  return "응답하지 않는 것이 좋음";
}

function buildPrivacyAssessment(
  report: ScanReport,
  summary: CollectedDataSummary,
  decision: RespondentDecision = "check_before_responding",
): PrivacyDataAssessment {
  const hasDirect = summary.directIdentifiers.length > 0;
  const hasQuasi = summary.quasiIdentifiers.length > 0;
  const hasSensitiveOrHighRisk =
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0 ||
    hasEmployeeSensitiveCombination(report);
  const missing = missingNoticeLabels(report);

  if (report.isLimited || report.diagnosisStatus === "limited") {
    const type: PrivacyDataType = "limited";
    const conclusion = "이 설문은 안전성을 판단할 수 없습니다.";
    const inclusionSummary = buildInclusionSummary(type, summary);
    const respondentAdvice =
      "개인정보를 입력하기 전 운영기관, 수집 목적, 보유기간, 담당자를 직접 확인하세요.";
    return {
      type,
      conclusion,
      inclusionSummary,
      respondentAdvice,
      statusBadge: "판단 불가",
      scoreEvaluation: "판단 불가",
      title: inclusionSummary,
      action: conclusion,
      description: inclusionSummary,
      quickActions: buildHeroReasons(type, report, summary),
    };
  }

  if (hasSensitiveOrHighRisk) {
    const type: PrivacyDataType = "sensitive_or_high_risk";
    const conclusion = hasSensitiveItems(summary)
      ? "이 설문은 민감정보가 포함될 수 있어 응답하지 않는 것이 좋습니다."
      : "이 설문은 응답하면 개인정보 노출 위험이 있습니다.";
    const inclusionSummary = buildInclusionSummary(type, summary);
    const respondentAdvice =
      "운영기관의 개인정보 처리 기준을 확인하기 전에는 응답하지 마세요.";
    return {
      type,
      conclusion,
      inclusionSummary,
      respondentAdvice,
      statusBadge: "위험",
      scoreEvaluation: getScoreEvaluation(type, report.score, decision),
      title: inclusionSummary,
      action: conclusion,
      description: inclusionSummary,
      quickActions: buildHeroReasons(type, report, summary),
      certificationNotice: buildCertificationNotice(type, report, summary),
    };
  }

  if (hasDirect) {
    const type: PrivacyDataType = "direct_identifier";
    const conclusion = "이 설문은 개인정보가 포함되어 있어 확인 후 응답해야 합니다.";
    const inclusionSummary = buildInclusionSummary(type, summary);
    const respondentAdvice = "고지 확인 전에는 이름·연락처 입력을 미루세요.";
    const highRiskNote =
      missing.length >= 3
        ? "고지문이 부족하면 개인정보 노출 위험이 있습니다."
        : undefined;
    return {
      type,
      conclusion,
      inclusionSummary,
      respondentAdvice,
      statusBadge: "확인 후 응답",
      scoreEvaluation: getScoreEvaluation(type, report.score, decision),
      title: inclusionSummary,
      action: conclusion,
      description: inclusionSummary,
      quickActions: buildHeroReasons(type, report, summary),
      certificationNotice: buildCertificationNotice(type, report, summary),
      highRiskNote,
    };
  }

  if (hasQuasi) {
    const type: PrivacyDataType = "quasi_only";
    const conclusion = "이 설문은 개인정보·민감정보는 없으나, 주의가 필요합니다.";
    const inclusionSummary = buildInclusionSummary(type, summary);
    const respondentAdvice =
      "응답은 가능해 보입니다. 다만 자유의견에는 개인정보를 추가로 쓰지 마세요.";
    return {
      type,
      conclusion,
      inclusionSummary,
      respondentAdvice,
      statusBadge: "주의 필요",
      scoreEvaluation: getScoreEvaluation(type, report.score, decision),
      title: inclusionSummary,
      action: conclusion,
      description: inclusionSummary,
      quickActions: buildHeroReasons(type, report, summary),
    };
  }

  const type: PrivacyDataType = "minimal";
  const conclusion = "이 설문은 응답해도 비교적 안전합니다.";
  const inclusionSummary = buildInclusionSummary(type, summary);
  const respondentAdvice =
    "다만 자유의견에는 이름, 연락처, 상세한 개인 사정은 쓰지 않는 것이 좋습니다.";
  return {
    type,
    conclusion,
    inclusionSummary,
    respondentAdvice,
    statusBadge: "응답 가능",
    scoreEvaluation: getScoreEvaluation(type, report.score, decision),
    title: inclusionSummary,
    action: conclusion,
    description: inclusionSummary,
    quickActions: buildHeroReasons(type, report, summary),
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
    reasons.push(`고지 확인 필요 항목이 있습니다: ${missing.slice(0, 3).join(", ")}.`);
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
        title: "관리·운영 확인 필요",
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
      title: "도구·처리경로 위험",
      score: toolScore,
      description:
        shouldElevateToolRiskForCsap(report, summary) ||
        shouldElevateToolRiskForPrivateCert(report, summary)
          ? report.debug?.publicSectorDetected
            ? "공공부문 개인정보 설문에서 CSAP 인증 여부가 확인되지 않은 외부 도구 사용이 확인됩니다."
            : "민간 설문에서 범용 외부 설문도구로 개인정보를 수집하고 있어 보안 인증 도구·수행기관 확인이 필요합니다."
          : report.platform === "google_forms"
            ? "해외 SaaS 사용에 따른 안내 확인이 필요합니다."
            : report.platform === "generic"
              ? "지원 플랫폼이 아니어서 베타 진단입니다."
              : "외부 설문 도구 사용 안내를 확인하세요.",
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
      title: "관리·운영 확인 필요",
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
      title: grouped[0]?.title ?? "개인정보 고지 확인 필요",
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
  const limitedReason =
    report.limitedReason ??
    report.form.limitedReason ??
    "설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다.";

  const privacyAssessment = buildPrivacyAssessment(
    report,
    {
      directIdentifiers: [],
      quasiIdentifiers: [],
      generalOpinions: [],
      sensitiveItems: [],
      highRiskItems: [],
    },
    "check_before_responding",
  );

  return {
    isLimited: true,
    privacyAssessment,
    respondentDecision: "check_before_responding",
    respondentDecisionTitle: privacyAssessment.conclusion,
    respondentDecisionSummary: privacyAssessment.inclusionSummary,
    respondentReasons: [limitedReason],
    collectedDataSummary: {
      directIdentifiers: [],
      quasiIdentifiers: [],
      generalOpinions: [],
      sensitiveItems: [],
      highRiskItems: [],
    },
    respondentDoList: [
      "설문 운영 주체와 목적을 직접 확인하세요.",
      "개인정보를 요구한다면 보유기간과 담당자 안내가 있는지 확인하세요.",
    ],
    respondentDontList: ["주민등록번호", "계좌번호", "비밀번호나 인증번호"],
    operatorSummary: "문항을 확인하지 못해 운영자 보완 리포트를 최소화했습니다.",
    operatorTopFixes: [],
    requiredFixes: [],
    recommendedFixes: [],
    copyableTemplates: [],
    riskDimensions: buildRiskDimensions(report, {
      directIdentifiers: [],
      quasiIdentifiers: [],
      generalOpinions: [],
      sensitiveItems: [],
      highRiskItems: [],
    }),
    keyReasons: buildKeyReasons(report, {
      directIdentifiers: [],
      quasiIdentifiers: [],
      generalOpinions: [],
      sensitiveItems: [],
      highRiskItems: [],
    }),
    noticeSummary: "문항 자동 추출 불가",
    detailsSummary: "진단 제한 사유와 원본 JSON만 확인할 수 있습니다.",
  };
}

export function composeAudienceReport(report: ScanReport): AudienceReport {
  if (isExtractionLimitedReport(report) || report.form.questions.length === 0) {
    return buildLimitedAudienceReport(report);
  }

  const collectedDataSummary = collectDataSummary(report);
  const publicSectorCsapWarning = buildPublicSectorCsapAssessment(
    report,
    collectedDataSummary,
  );
  const privateSectorSecurityCertWarning = publicSectorCsapWarning
    ? undefined
    : buildPrivateSectorSecurityCertAssessment(report, collectedDataSummary);
  const respondentDecision = decideRespondentDecision(report, collectedDataSummary);
  const privacyAssessment = buildPrivacyAssessment(
    report,
    collectedDataSummary,
    respondentDecision,
  );

  if (publicSectorCsapWarning) {
    const csapReason = buildCsapHeroReason(
      publicSectorCsapWarning,
      report,
      collectedDataSummary,
    );
    privacyAssessment.quickActions = unique([
      csapReason,
      ...privacyAssessment.quickActions.filter((reason) => reason !== csapReason),
    ]).slice(0, 3);
  } else if (privateSectorSecurityCertWarning) {
    const certReason = buildPrivateSectorHeroReason(
      privateSectorSecurityCertWarning,
      report,
      collectedDataSummary,
    );
    privacyAssessment.quickActions = unique([
      certReason,
      ...privacyAssessment.quickActions.filter((reason) => reason !== certReason),
    ]).slice(0, 3);
  }

  const operatorActions = buildOperatorActions(report, collectedDataSummary);
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
  };
}
