import type {
  ComplianceGap,
  DataRiskLevel,
  FormContext,
  GradeOverride,
  ToolRiskResult,
} from "@/lib/types/analyzer";
import type { RiskGrade } from "@/lib/types/scan";
import type { NormalizedForm } from "@/lib/types/scan";
import {
  hasDirectIdentifier,
  hasSensitiveData,
  hasUniqueIdentifier,
} from "@/lib/rules/dataRiskRules";
import { isDomesticOrOverseasSaaS, isOverseasSaaS } from "@/lib/rules/toolRouteRules";

const GRADE_ORDER: RiskGrade[] = ["safe", "caution", "risk", "high_risk"];

function worseGrade(a: RiskGrade, b: RiskGrade): RiskGrade {
  return GRADE_ORDER.indexOf(a) > GRADE_ORDER.indexOf(b) ? a : b;
}

export function applyGradeOverrideRules(input: {
  form: NormalizedForm;
  context: FormContext;
  dataLevel: DataRiskLevel;
  toolRisk: ToolRiskResult;
  complianceGaps: ComplianceGap[];
}): GradeOverride[] {
  const { form, context, dataLevel, toolRisk, complianceGaps } = input;
  const overrides: GradeOverride[] = [];

  const gap = (key: string) =>
    complianceGaps.find((g) => g.key === key && g.status !== "present");

  const hasSensitiveConsent = !gap("sensitive_consent");
  const hasRetention = !gap("retention_period");
  const hasPurpose = !gap("collection_purpose");
  const hasItems = !gap("collection_items");
  const hasTrustee = !gap("trustee");
  const hasOverseas = !gap("overseas_transfer");
  const hasPrizeDestruction = !gap("prize_destruction");
  const hasMarketingConsent = !gap("marketing_optional_consent");
  const hasCsap = !gap("public_csap_verification");

  const collectsDirectIdentifier = hasDirectIdentifier(dataLevel);
  const claimsAnonymous = form.contextHints?.claimsAnonymous ?? false;
  const hasIdentifierQuestions = form.questions.some((question) => {
    const level =
      question.dataRiskLevel === "D3" ||
      question.dataRiskLevel === "D4" ||
      question.dataRiskLevel === "D5";
    const labelHit = ["이름", "전화", "연락", "이메일", "주소", "휴대"].some((keyword) =>
      question.label.includes(keyword),
    );
    return level || labelHit;
  });

  const hasEmployeeSensitive =
    context.flags.includes("employee_survey") &&
    form.questions.some(
      (question) =>
        question.dataRiskLevel === "D4" &&
        /고충|괴롭힘|상사평가|인사평가/.test(question.label),
    );
  const hasQuasiId = form.questions.some((question) => question.dataRiskLevel === "D2");
  const hasIdFile = form.questions.some(
    (question) =>
      (question.type === "file" || question.type === "file_upload") &&
      /신분증|주민/.test(question.label),
  );

  if (hasSensitiveData(dataLevel) && !hasSensitiveConsent) {
    overrides.push({
      ruleId: "sensitive_no_consent",
      minGrade: "high_risk",
      reason: "민감정보 수집에 별도 동의가 확인되지 않습니다.",
    });
  }

  if (hasUniqueIdentifier(dataLevel) || hasIdFile) {
    overrides.push({
      ruleId: "unique_identifier",
      minGrade: "high_risk",
      reason: "고유식별정보 또는 신분증 첨부 요구가 확인됩니다.",
    });
  }

  if (
    context.flags.includes("public_agency") &&
    isDomesticOrOverseasSaaS(toolRisk.level) &&
    hasSensitiveData(dataLevel)
  ) {
    overrides.push({
      ruleId: "public_external_sensitive",
      minGrade: "high_risk",
      reason: "공공기관 + 외부 설문 도구 + 민감정보 수집 조합입니다.",
    });
  }

  if (
    context.flags.includes("public_agency") &&
    isOverseasSaaS(toolRisk.level) &&
    collectsDirectIdentifier &&
    !hasOverseas
  ) {
    overrides.push({
      ruleId: "public_google_overseas",
      minGrade: "high_risk",
      reason:
        "공공기관 + Google Forms(해외 SaaS) + 직접식별정보 수집 + 국외이전 안내 없음.",
    });
  }

  if (hasEmployeeSensitive && hasQuasiId) {
    overrides.push({
      ruleId: "employee_sensitive_identifiable",
      minGrade: "high_risk",
      reason: "직원 고충/괴롭힘/상사평가 + 식별 가능 조합이 확인됩니다.",
    });
  }

  if (claimsAnonymous && hasIdentifierQuestions) {
    overrides.push({
      ruleId: "anonymous_contradiction",
      minGrade: "high_risk",
      reason: "익명 안내와 이름/연락처 수집이 동시에 확인됩니다.",
    });
  }

  if (collectsDirectIdentifier && !hasRetention) {
    overrides.push({
      ruleId: "no_retention",
      minGrade: "risk",
      reason: "직접식별정보 수집에 보유기간 안내가 없습니다.",
    });
  }

  if (collectsDirectIdentifier && !hasItems) {
    overrides.push({
      ruleId: "no_items",
      minGrade: "risk",
      reason: "직접식별정보 수집에 수집항목 안내가 없습니다.",
    });
  }

  if (collectsDirectIdentifier && !hasPurpose) {
    overrides.push({
      ruleId: "no_purpose",
      minGrade: "risk",
      reason: "직접식별정보 수집에 수집목적 안내가 없습니다.",
    });
  }

  if (
    collectsDirectIdentifier &&
    isDomesticOrOverseasSaaS(toolRisk.level) &&
    !hasTrustee &&
    !form.management?.trusteeDisclosed
  ) {
    overrides.push({
      ruleId: "saas_no_trustee",
      minGrade: "risk",
      reason: "외부 SaaS + 직접식별정보 수집 + 위탁 안내 없음.",
    });
  }

  if (
    collectsDirectIdentifier &&
    isOverseasSaaS(toolRisk.level) &&
    !hasOverseas &&
    !form.management?.domesticStorage
  ) {
    overrides.push({
      ruleId: "overseas_no_notice",
      minGrade: "risk",
      reason: "해외 SaaS + 직접식별정보 수집 + 국외이전 안내 없음.",
    });
  }

  if (
    context.flags.includes("event_prize") &&
    collectsDirectIdentifier &&
    !hasPrizeDestruction
  ) {
    overrides.push({
      ruleId: "event_no_destruction",
      minGrade: "risk",
      reason: "경품 설문 + 연락처 수집 + 파기 안내 없음.",
    });
  }

  if (
    context.flags.includes("public_agency") &&
    isDomesticOrOverseasSaaS(toolRisk.level) &&
    (collectsDirectIdentifier || hasSensitiveData(dataLevel) || hasUniqueIdentifier(dataLevel)) &&
    !hasCsap &&
    !form.management?.publicSecurityVerified
  ) {
    overrides.push({
      ruleId: "public_no_csap",
      minGrade: "risk",
      reason: "공공기관 + 외부 SaaS + CSAP/공공 보안검증 확인 불가.",
    });
  }

  if (context.flags.includes("marketing") && !hasMarketingConsent) {
    overrides.push({
      ruleId: "marketing_no_consent",
      minGrade: "risk",
      reason: "마케팅 활용 + 별도 선택동의 없음.",
    });
  }

  return overrides;
}

export function resolveFinalGrade(
  scoreGrade: RiskGrade,
  overrides: GradeOverride[],
): RiskGrade {
  return overrides.reduce(
    (grade, override) => worseGrade(grade, override.minGrade),
    scoreGrade,
  );
}

export function scoreToGrade(score: number): RiskGrade {
  if (score >= 80) return "safe";
  if (score >= 60) return "caution";
  if (score >= 40) return "risk";
  return "high_risk";
}
