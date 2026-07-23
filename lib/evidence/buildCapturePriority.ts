import type { DetectedCategory, ScanReport } from "@/lib/types/scan";

export type CapturePriorityRisk =
  | "sensitive"
  | "high"
  | "direct"
  | "quasi"
  | "personal";

export interface CapturePriorityQuestion {
  /** 0-based page/section index from diagnosis */
  pageIndex: number;
  questionText: string;
  risk: CapturePriorityRisk;
}

const DIRECT = new Set<DetectedCategory>([
  "name",
  "phone",
  "email",
  "address",
  "birthdate",
]);
const QUASI = new Set<DetectedCategory>([
  "gender",
  "respondent_age",
  "age_range",
  "affiliation",
  "organization_identifier",
  "quasi_identifier",
  "residence_area",
  "department",
  "position",
  "tenure",
]);
const SENSITIVE = new Set<DetectedCategory>([
  "sensitive_health",
  "sensitive_belief_union",
  "sensitive_complaint",
  "sensitive_political",
  "sensitive_religion",
]);
const HIGH = new Set<DetectedCategory>([
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

function riskForQuestion(question: {
  hasPersonalData?: boolean;
  detectedCategories?: DetectedCategory[];
  dataRiskLevel?: string;
  questionText?: string;
  label?: string;
}): CapturePriorityRisk | null {
  const cats = question.detectedCategories ?? [];
  if (cats.some((c) => SENSITIVE.has(c))) return "sensitive";
  if (cats.some((c) => HIGH.has(c))) return "high";
  if (cats.some((c) => DIRECT.has(c))) return "direct";
  if (cats.some((c) => QUASI.has(c))) return "quasi";
  if (
    question.hasPersonalData ||
    question.dataRiskLevel === "D3" ||
    question.dataRiskLevel === "D4" ||
    question.dataRiskLevel === "D5"
  ) {
    return "personal";
  }

  // Diagnosis may label demographics as "일반 문항" — still prioritize for capture
  const text = `${question.questionText ?? ""} ${question.label ?? ""}`;
  if (
    /연령|나이대|나이\b|근속\s*기간|근속\s*연수|직군|직급|직책|부서\b|소속\s*부서/.test(
      text,
    )
  ) {
    return "quasi";
  }
  return null;
}

const RISK_RANK: Record<CapturePriorityRisk, number> = {
  sensitive: 5,
  high: 4,
  direct: 3,
  personal: 2,
  quasi: 1,
};

/**
 * Build capture priority list from diagnosis — personal/sensitive questions first.
 */
export function buildCapturePriorityQuestions(
  report: ScanReport,
): CapturePriorityQuestion[] {
  const items: CapturePriorityQuestion[] = [];

  for (const question of report.form.questions ?? []) {
    if (question.type === "privacy_consent") continue;
    if (question.riskTags?.includes("privacy_consent")) continue;

    const risk = riskForQuestion(question);
    if (!risk) continue;

    const text = (question.questionText || question.label || "").trim();
    if (text.length < 2) continue;

    items.push({
      pageIndex: question.pageIndex ?? 0,
      questionText: text.slice(0, 160),
      risk,
    });
  }

  return items.sort((a, b) => {
    const riskDiff = RISK_RANK[b.risk] - RISK_RANK[a.risk];
    if (riskDiff !== 0) return riskDiff;
    return a.pageIndex - b.pageIndex;
  });
}

export function priorityPageIndices(
  questions: CapturePriorityQuestion[],
): number[] {
  return [...new Set(questions.map((q) => q.pageIndex))].sort((a, b) => a - b);
}

export function riskLabel(risk: CapturePriorityRisk): string {
  switch (risk) {
    case "sensitive":
      return "민감정보";
    case "high":
      return "고위험정보";
    case "direct":
      return "직접식별정보";
    case "quasi":
      return "준식별정보";
    default:
      return "개인정보";
  }
}
