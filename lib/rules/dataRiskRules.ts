import type { DataRiskLevel } from "@/lib/types/analyzer";
import type { NormalizedQuestion } from "@/lib/types/scan";
import {
  categoriesToDataLevel,
  detectCategories,
  isDirectPiiSolicitation,
  isExcludedSurveyQuestion,
  isPreferenceOrGeneralOpinionQuestion,
  isSensitiveHealthQuestion,
} from "@/lib/extractors/htmlTextUtils";

const D5_PATTERNS = [
  "주민등록번호",
  "여권",
  "운전면허",
  "외국인등록",
  "신분증",
  "학생증",
  "사원증",
  "계좌",
  "통장",
  "비밀번호",
  "인증번호",
];
const D4_PATTERNS = [
  "질병",
  "질환명",
  "병력",
  "진료 이력",
  "치료 이력",
  "복용약",
  "장애 여부",
  "장애유형",
  "장애등급",
  "정신건강 상태",
  "우울",
  "불안",
  "자살 생각",
  "건강검진 결과",
  "의료기관 이용 이력",
  "정치",
  "종교",
  "노조",
  "성희롱",
  "괴롭힘",
  "갑질",
  "징계",
  "인사평가",
  "상사평가",
  "직장 내 고충",
];
const D3_PATTERNS = [
  "이름",
  "성명",
  "휴대",
  "전화",
  "이메일",
  "상세주소",
  "도로명",
  "지번주소",
  "배송지",
  "우편번호",
  "생년",
  "연락처",
];
const D2_PATTERNS = [
  "성별",
  "연령",
  "나이",
  "연령대",
  "거주지",
  "거주지역",
  "시군",
  "시/군",
  "지역",
];

export function inferQuestionDataLevel(question: NormalizedQuestion): DataRiskLevel {
  const label = question.label;
  const auxiliary = question.auxiliaryText ?? "";
  const combined = `${label} ${auxiliary}`.trim();

  if (isExcludedSurveyQuestion(label) || isPreferenceOrGeneralOpinionQuestion(combined)) {
    return "D1";
  }

  const categories = detectCategories(combined);
  if (categories.length > 0) {
    return categoriesToDataLevel(categories);
  }

  if (
    question.type === "file" ||
    question.type === "file_upload"
  ) {
    if (/신분증|id|주민/.test(combined)) return "D5";
  }

  if (isDirectPiiSolicitation(combined)) {
    return "D3";
  }

  const lower = combined.toLowerCase();
  if (D5_PATTERNS.some((pattern) => lower.includes(pattern))) return "D5";
  if (isSensitiveHealthQuestion(combined)) return "D4";
  if (D4_PATTERNS.some((pattern) => lower.includes(pattern))) return "D4";
  if (D3_PATTERNS.some((pattern) => lower.includes(pattern))) return "D3";
  if (D2_PATTERNS.some((pattern) => lower.includes(pattern))) return "D2";

  if (
    (question.type === "long_text" || question.type === "short_text") &&
    !question.hasPersonalData
  ) {
    return "D1";
  }

  return question.hasPersonalData ? "D2" : "D1";
}

export const DATA_RISK_DEDUCTIONS: Record<DataRiskLevel, number> = {
  D0: 0,
  D1: 3,
  D2: 10,
  D3: 20,
  D4: 28,
  D5: 35,
};

export const DATA_RISK_ORDER: DataRiskLevel[] = ["D0", "D1", "D2", "D3", "D4", "D5"];

export function maxDataLevel(levels: DataRiskLevel[]): DataRiskLevel {
  if (levels.length === 0) return "D0";
  return levels.reduce((max, cur) =>
    DATA_RISK_ORDER.indexOf(cur) > DATA_RISK_ORDER.indexOf(max) ? cur : max,
  );
}

export function hasSensitiveData(level: DataRiskLevel): boolean {
  return DATA_RISK_ORDER.indexOf(level) >= DATA_RISK_ORDER.indexOf("D4");
}

export function hasPersonalData(level: DataRiskLevel): boolean {
  return DATA_RISK_ORDER.indexOf(level) >= DATA_RISK_ORDER.indexOf("D2");
}

export function hasUniqueIdentifier(level: DataRiskLevel): boolean {
  return level === "D5";
}

export function hasDirectIdentifier(level: DataRiskLevel): boolean {
  return DATA_RISK_ORDER.indexOf(level) >= DATA_RISK_ORDER.indexOf("D3");
}

export function isQuasiIdentifierOnly(level: DataRiskLevel): boolean {
  return level === "D2";
}
