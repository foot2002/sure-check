import type { ExtractorInput } from "@/lib/extractors/types";

export type NaverFormsQuestionType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multiple_choice"
  | "dropdown"
  | "linear_scale"
  | "grid_single"
  | "grid_multiple"
  | "date"
  | "time"
  | "file_upload"
  | "unknown";

export type NaverFormsExtractionMethod =
  | "access_api"
  | "embedded_json"
  | "dom_fallback"
  | "none";

export interface NaverFormsParsedQuestion {
  id: string;
  questionText: string;
  description?: string;
  questionType: NaverFormsQuestionType;
  required: boolean;
  options: string[];
  pageIndex: number;
  questionIndex: number;
  detectedCategories: string[];
  riskTags: string[];
}

export interface NaverFormsParseResult {
  title: string;
  description: string;
  questions: NaverFormsParsedQuestion[];
  noticeTexts: string[];
  loginRequired: boolean;
  closedForm: boolean;
  branchDetected: boolean;
  emailCollectionPossible: boolean;
  extractionMethod: NaverFormsExtractionMethod;
  partialScan: boolean;
  isLimited: boolean;
  limitedReason?: string;
  warnings: string[];
  surveyId?: string;
}

export type NaverFormsExtractorInput = ExtractorInput;

export const NAVER_FORMS_API_BASE = "https://survey-api.naver.com/api/form";

/** Access API statuses that mean the response window is not open. */
export const NAVER_CLOSED_STATUSES = new Set([
  "CLOSED",
  "ENDED",
  "FINISHED",
  "STOPPED",
  "EXPIRED",
  "PAUSED",
]);

export function isNaverFormsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "form.naver.com") return true;
    if (host === "naver.me") return true;
    return false;
  } catch {
    const lower = url.toLowerCase();
    return lower.includes("form.naver.com") || lower.includes("naver.me/");
  }
}

export function isNaverFormsFinalUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "form.naver.com";
  } catch {
    return url.toLowerCase().includes("form.naver.com");
  }
}

/** Unwrap Facebook interstitial / redirect wrappers to the nested survey URL. */
export function unwrapNestedNaverSurveyUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const nested = parsed.searchParams.get("u");
    if (!nested) return null;
    const decoded = decodeURIComponent(nested);
    if (/form\.naver\.com|naver\.me/i.test(decoded)) {
      return decoded;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function extractNaverSurveyId(url: string): string | null {
  const direct = url.match(/\/response\/([A-Za-z0-9_-]+)/i);
  if (direct?.[1]) return direct[1];

  const nested = unwrapNestedNaverSurveyUrl(url);
  if (nested) {
    const nestedId = nested.match(/\/response\/([A-Za-z0-9_-]+)/i);
    if (nestedId?.[1]) return nestedId[1];
  }
  return null;
}

export const NAVER_FORMS_DIAGNOSIS_NOTICE =
  "네이버폼 공개 응답 화면에서 자동으로 확인 가능한 문항과 안내문을 기준으로 진단했습니다. JavaScript로 동적으로 로딩되는 문항, 로그인 후 표시되는 문항, 제출 이후 표시되는 문항은 누락될 수 있습니다.";
