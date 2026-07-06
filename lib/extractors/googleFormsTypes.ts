import type { ExtractorInput } from "@/lib/extractors/types";

export type GoogleFormsQuestionType =
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

export type GoogleFormsExtractionMethod = "fb_public_data" | "dom_fallback" | "none";

export interface GoogleFormsParsedQuestion {
  id: string;
  questionText: string;
  description?: string;
  questionType: GoogleFormsQuestionType;
  required: boolean;
  options: string[];
  rows: string[];
  columns: string[];
  pageIndex: number;
  questionIndex: number;
  detectedCategories: string[];
  riskTags: string[];
  isPageBreak?: boolean;
  sectionTitle?: string;
  sectionDescription?: string;
}

export interface GoogleFormsParseResult {
  title: string;
  description: string;
  questions: GoogleFormsParsedQuestion[];
  noticeTexts: string[];
  loginRequired: boolean;
  closedForm: boolean;
  branchDetected: boolean;
  emailCollectionPossible: boolean;
  extractionMethod: GoogleFormsExtractionMethod;
  partialScan: boolean;
  isLimited: boolean;
  limitedReason?: string;
  warnings: string[];
}

export type GoogleFormsExtractorInput = ExtractorInput;

export const GOOGLE_FORMS_URL_PATTERNS = [
  /docs\.google\.com\/forms/i,
  /forms\.gle/i,
] as const;

export function isGoogleFormsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host === "forms.gle") return true;
    if (host === "docs.google.com" && path.includes("/forms")) return true;
    return false;
  } catch {
    const lower = url.toLowerCase();
    return (
      lower.includes("docs.google.com/forms") || lower.includes("forms.gle")
    );
  }
}

export const GOOGLE_FORMS_DIAGNOSIS_NOTICE =
  "Google Forms 공개 응답 화면에서 자동으로 확인 가능한 문항과 안내문을 기준으로 진단했습니다. 응답 분기, 로그인 후 표시되는 문항, 제출 이후 표시되는 문항은 누락될 수 있습니다.";
