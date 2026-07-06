import type { ExtractorInput } from "@/lib/extractors/types";

export type MoaformQuestionType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multiple_choice"
  | "dropdown"
  | "rating"
  | "linear_scale"
  | "grid_single"
  | "grid_multiple"
  | "date"
  | "time"
  | "file_upload"
  | "privacy_consent"
  | "unknown";

export type MoaformExtractionMethod =
  | "answer_json"
  | "embedded_json"
  | "dom_fallback"
  | "none";

export interface MoaformParsedQuestion {
  id: string;
  questionText: string;
  description?: string;
  questionType: MoaformQuestionType;
  required: boolean;
  options: string[];
  pageIndex: number;
  questionIndex: number;
  detectedCategories: string[];
  riskTags: string[];
}

export interface MoaformParseResult {
  title: string;
  description: string;
  questions: MoaformParsedQuestion[];
  noticeTexts: string[];
  privacyPolicyUrls: string[];
  loginRequired: boolean;
  closedForm: boolean;
  branchDetected: boolean;
  emailCollectionPossible: boolean;
  privacyConsentPossible: boolean;
  extractionMethod: MoaformExtractionMethod;
  partialScan: boolean;
  isLimited: boolean;
  limitedReason?: string;
  warnings: string[];
  formId?: string;
}

export type MoaformExtractorInput = ExtractorInput;

export const MOAFORM_ANSWER_JSON_BASE = "https://answer.moaform.com/answers";

export function isMoaformUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("moaform.com")) return true;
    if (host === "surveyl.ink") return true;
    return false;
  } catch {
    const lower = url.toLowerCase();
    return lower.includes("moaform.com") || lower.includes("surveyl.ink/");
  }
}

export function isMoaformFinalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("moaform.com") || host === "surveyl.ink";
  } catch {
    return url.toLowerCase().includes("moaform.com");
  }
}

export function extractMoaformId(url: string): string | null {
  const patterns = [
    /moaform\.com\/q\/([A-Za-z0-9_-]+)/i,
    /answer\.moaform\.com\/answers\/([A-Za-z0-9_-]+)/i,
    /surveyl\.ink\/([A-Za-z0-9_-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && match[1] !== "404") {
      return match[1];
    }
  }

  return null;
}

export const MOAFORM_DIAGNOSIS_NOTICE =
  "모아폼 공개 응답 화면에서 자동으로 확인 가능한 문항과 안내문을 기준으로 진단했습니다. JavaScript로 동적으로 로딩되는 문항, 로그인 후 표시되는 문항, 제출 이후 표시되는 문항은 누락될 수 있습니다.";
