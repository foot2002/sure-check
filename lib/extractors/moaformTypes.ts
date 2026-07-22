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
  | "spa_session"
  | "answer_json"
  | "embedded_json"
  | "dom_fallback"
  | "none";

/** 모아폼 문항 추출 실패 시 제한 진단 사유 코드 */
export type MoaformFailureReason =
  | "MOAFORM_DYNAMIC_RENDERING"
  | "MOAFORM_QUESTIONS_NOT_FOUND"
  | "MOAFORM_ACCESS_RESTRICTED"
  | "MOAFORM_CLOSED_OR_PRIVATE"
  | "MOAFORM_UNSUPPORTED_STRUCTURE"
  | "MOAFORM_FETCH_FAILED";

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

export interface MoaformPageMetadata {
  title: string;
  description: string;
  headings: string[];
  operatorCandidates: string[];
  /** Best-effort operator / org hint (uncertain → mark as 확인 필요) */
  operatorHint?: string;
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
  failureReason?: MoaformFailureReason;
  warnings: string[];
  formId?: string;
  /** Extracted page metadata even when questions are empty */
  pageMeta?: MoaformPageMetadata;
  operatorHint?: string;
  operatorCandidates?: string[];
}

export type MoaformExtractorInput = ExtractorInput;

export const MOAFORM_ANSWER_JSON_BASE = "https://answer.moaform.com/answers";

export const MOAFORM_FAILURE_MESSAGES: Record<
  MoaformFailureReason,
  { limitedReason: string; summary: string; guidance: string }
> = {
  MOAFORM_DYNAMIC_RENDERING: {
    limitedReason:
      "모아폼 페이지는 확인했지만, 설문 문항을 자동으로 읽지 못했습니다.",
    summary:
      "모아폼 페이지는 확인했지만, 설문 문항을 자동으로 읽지 못했습니다. 이 설문은 JavaScript로 문항을 동적으로 불러오거나, 접근 제한/구조 변경으로 인해 문항이 HTML에 노출되지 않는 것으로 보입니다.",
    guidance:
      "개인정보를 입력하기 전 설문 첫 화면의 운영기관, 수집 목적, 보유기간, 담당자, 개인정보 고지문을 직접 확인하세요.",
  },
  MOAFORM_QUESTIONS_NOT_FOUND: {
    limitedReason:
      "모아폼 페이지는 확인했지만, 설문 문항을 자동으로 읽지 못했습니다.",
    summary:
      "모아폼 공개 화면에서 문항 후보를 찾지 못했습니다. 동적 로딩 또는 구조 변경 가능성이 있습니다.",
    guidance:
      "개인정보를 입력하기 전 운영기관과 개인정보 고지문을 직접 확인하세요.",
  },
  MOAFORM_ACCESS_RESTRICTED: {
    limitedReason: "모아폼에 로그인 또는 접근 권한이 필요합니다.",
    summary:
      "모아폼에 로그인 또는 접근 권한이 필요하여 문항을 확인하지 못했습니다.",
    guidance:
      "접근 가능한 공개 설문 URL로 다시 진단하거나, 운영기관에 문의하세요.",
  },
  MOAFORM_CLOSED_OR_PRIVATE: {
    limitedReason: "모아폼 응답이 종료되었거나 비공개입니다.",
    summary: "모아폼 응답이 종료되었거나 비공개여서 진단이 제한되었습니다.",
    guidance: "운영기관에 설문 상태와 개인정보 처리 기준을 확인하세요.",
  },
  MOAFORM_UNSUPPORTED_STRUCTURE: {
    limitedReason: "모아폼 설문 구조를 자동으로 해석하지 못했습니다.",
    summary:
      "모아폼 페이지는 열렸지만 지원하지 않는 설문 구조로 문항을 추출하지 못했습니다.",
    guidance:
      "개인정보를 입력하기 전 운영기관과 고지문을 직접 확인하세요.",
  },
  MOAFORM_FETCH_FAILED: {
    limitedReason: "모아폼 페이지를 가져오지 못했습니다.",
    summary: "모아폼 페이지 fetch에 실패하여 진단을 진행하지 못했습니다.",
    guidance: "네트워크 상태를 확인한 뒤 공개 설문 URL로 다시 시도하세요.",
  },
};

export function isMoaformUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "moaform.com" || host.endsWith(".moaform.com")) return true;
    if (host.includes("moaform.com")) return true;
    if (host === "surveyl.ink" || host.endsWith(".surveyl.ink")) return true;
    return false;
  } catch {
    const lower = url.toLowerCase();
    return (
      lower.includes("moaform.com") ||
      lower.includes("surveyl.ink/") ||
      lower.includes("surveyl.ink")
    );
  }
}

export function isMoaformFinalUrl(url: string): boolean {
  return isMoaformUrl(url);
}

export function extractMoaformId(url: string): string | null {
  const patterns = [
    /answer\.moaform\.com\/answers\/([A-Za-z0-9_-]+)\/?/i,
    /(?:www\.)?moaform\.com\/q\/([A-Za-z0-9_-]+)\/?/i,
    /(?:www\.)?moaform\.com\/(?:forms?|s|survey)\/([A-Za-z0-9_-]+)\/?/i,
    /(?:www\.)?surveyl\.ink\/([A-Za-z0-9_-]+)\/?/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && match[1] !== "404" && match[1].toLowerCase() !== "answers") {
      return match[1];
    }
  }

  return null;
}

export function resolveMoaformFailureReason(input: {
  loginRequired?: boolean;
  closedForm?: boolean;
  notFound?: boolean;
  fetchFailed?: boolean;
  htmlFetched?: boolean;
  questionCount: number;
  hadEmbeddedJson?: boolean;
  hadAnswerJson?: boolean;
  hadSpaSession?: boolean;
}): MoaformFailureReason {
  if (input.fetchFailed) return "MOAFORM_FETCH_FAILED";
  if (input.loginRequired) return "MOAFORM_ACCESS_RESTRICTED";
  if (input.closedForm || input.notFound) return "MOAFORM_CLOSED_OR_PRIVATE";
  if (input.questionCount > 0) {
    return "MOAFORM_UNSUPPORTED_STRUCTURE";
  }
  if (input.htmlFetched) {
    // HTML opened but no questions — typical JS dynamic render case
    return "MOAFORM_DYNAMIC_RENDERING";
  }
  if (!input.hadEmbeddedJson && !input.hadAnswerJson && !input.hadSpaSession) {
    return "MOAFORM_QUESTIONS_NOT_FOUND";
  }
  return "MOAFORM_QUESTIONS_NOT_FOUND";
}

export const MOAFORM_DIAGNOSIS_NOTICE =
  "모아폼 공개 응답 SPA(form2/next2)와 HTML에서 확인 가능한 문항·안내문을 기준으로 진단했습니다. 로그인·비밀번호·로직 분기·제출 이후에만 보이는 문항은 누락될 수 있습니다.";

/** TODO: Playwright Worker 기반 렌더링 fallback (Vercel API에서 직접 실행하지 않음) */
export const MOAFORM_PLAYWRIGHT_TODO =
  "모아폼 SPA 세션(form2/next2)으로도 문항을 못 읽는 설문은 Playwright Worker 기반 렌더링 fallback이 필요할 수 있다. Vercel API route 안에서 Playwright를 바로 실행하지 말고, 추후 Worker 또는 별도 서버·Queue로 비동기 확장한다.";
