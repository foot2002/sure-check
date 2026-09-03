import { isPersonalDataCategory } from "@/lib/extractors/htmlTextUtils";
import { CATEGORY_LABELS } from "@/lib/reporting/reportMessages";
import { isCsapCertifiedTool } from "@/lib/reporting/toolRegistry";
import type { DetectedCategory, Platform as ScanPlatform } from "@/lib/types/scan";

export const GENERIC_OPERATOR_LABELS = new Set([
  "공공기관",
  "공공기관 가능성",
  "학교/교육기관",
  "공공위탁 수행기관",
  "확인 불가",
  "민간기업",
  "의료기관",
  "비영리",
  "비영리/협회",
]);

const TYPE_GROUP: Record<string, string> = {
  중앙부처: "중앙",
  중앙행정기관소속기관: "중앙",
  중앙행정기관산하공공기관: "중앙",
  광역자치단체: "지자체",
  기초자치단체: "지자체",
  지방공기업: "지방공기업",
  교육행정기관: "교육기관",
  교육지원청: "교육기관",
  출연기관: "출연·출자",
  출자기관: "출연·출자",
};

const PLATFORM_KO: Record<string, string> = {
  google_forms: "구글폼",
  naver_form: "네이버폼",
  naver_forms: "네이버폼",
  moaform: "모아폼",
  wiseon_csap: "WiseON",
  generic: "기타",
  unknown: "미확인",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function compactType(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, "");
}

export function classifyPublicOrgGroup(
  originalType: string | null | undefined,
  subjectType: string | null | undefined,
): string {
  const mapped = TYPE_GROUP[compactType(originalType)];
  if (mapped) return mapped;
  if (subjectType === "school_local") return "교육기관";
  return "미분류";
}

export function collectionToolKo(platform: string | null | undefined): string {
  const key = (platform || "").trim();
  return PLATFORM_KO[key] || "미확인";
}

export function toScanPlatform(value: string | null | undefined): ScanPlatform {
  const key = (value || "").trim();
  if (key === "naver_form") return "naver_forms";
  if (
    key === "google_forms" ||
    key === "naver_forms" ||
    key === "moaform" ||
    key === "generic" ||
    key === "wiseon_csap" ||
    key === "unknown"
  ) {
    return key;
  }
  return "unknown";
}

export function csapCertifiedYesNo(
  platform: string | null | undefined,
  reportJson?: unknown,
): "예" | "아니오" {
  const form = asRecord(asRecord(reportJson)?.form);
  const management = asRecord(form?.management) as
    | { csapVerified?: boolean }
    | null;
  return isCsapCertifiedTool(
    toScanPlatform(platform),
    management || undefined,
  )
    ? "예"
    : "아니오";
}

export function displayInstitutionName(
  matchedName: string | null | undefined,
  operatorName: string | null | undefined,
): string {
  const matched = (matchedName || "").trim();
  if (matched && !GENERIC_OPERATOR_LABELS.has(matched)) return matched;
  const operator = (operatorName || "").trim();
  if (operator && !GENERIC_OPERATOR_LABELS.has(operator)) return operator;
  return matched || operator || "확인 불가";
}

export function piiLabelFromCode(
  code: string,
  fallback?: string | null,
): string | null {
  if (!isPersonalDataCategory(code)) return null;
  const fromRegistry = CATEGORY_LABELS[code as DetectedCategory];
  const label = (fromRegistry || fallback || "").trim();
  return label || code;
}

export function piiLabelsFromReportJson(reportJson: unknown): string[] {
  const form = asRecord(asRecord(reportJson)?.form);
  const questions = Array.isArray(form?.questions) ? form.questions : [];
  const labels = new Set<string>();
  for (const item of questions) {
    const q = asRecord(item);
    if (!q) continue;
    const cats = Array.isArray(q.detectedCategories) ? q.detectedCategories : [];
    const types = Array.isArray(q.personalDataTypes) ? q.personalDataTypes : [];
    for (const code of [...cats, ...types]) {
      if (typeof code !== "string") continue;
      const label = piiLabelFromCode(code);
      if (label) labels.add(label);
    }
  }
  return [...labels];
}

export function institutionEvidenceFromReportJson(reportJson: unknown): {
  matchedName: string | null;
  matchedType: string | null;
} {
  const debug = asRecord(asRecord(reportJson)?.debug);
  const evidence = asRecord(debug?.publicInstitutionEvidence);
  const matchedName =
    typeof evidence?.matchedName === "string" ? evidence.matchedName.trim() : "";
  const matchedType =
    typeof evidence?.matchedType === "string" ? evidence.matchedType.trim() : "";
  return {
    matchedName:
      matchedName && !GENERIC_OPERATOR_LABELS.has(matchedName)
        ? matchedName
        : null,
    matchedType: matchedType || null,
  };
}

export type AdminExportCase = {
  surveyTitle: string | null;
  institutionName: string | null;
  orgClass: string | null;
  originalOrgType: string | null;
  platform: string | null;
  csapCertified: boolean;
  hasPersonalInfo: boolean;
  piiItemLabels: string[];
  surveyUrl: string | null;
  evidenceCount: number;
  hasScreenshots: boolean;
  observedDateKst: string;
};

export function adminExportSheetRows(cases: AdminExportCase[]): Array<Record<string, string | number>> {
  return cases.map((row, index) => ({
    번호: index + 1,
    설문명: (row.surveyTitle || "").trim() || "(제목 없음)",
    수행기관: row.institutionName || "확인 불가",
    기관분류: row.orgClass || "미분류",
    원본유형: row.originalOrgType || "",
    수집도구: collectionToolKo(row.platform),
    "CSAP/보안인증여부": row.csapCertified ? "예" : "아니오",
    "개인정보 수집여부": row.hasPersonalInfo ? "예" : "아니오",
    "수집 개인정보": row.hasPersonalInfo
      ? row.piiItemLabels.join(", ") || "항목 미분류"
      : "",
    설문링크: row.surveyUrl || "",
    캡쳐건수: row.evidenceCount,
    캡쳐유무: row.hasScreenshots || row.evidenceCount > 0 ? "예" : "아니오",
    진단일: row.observedDateKst || "",
  }));
}
