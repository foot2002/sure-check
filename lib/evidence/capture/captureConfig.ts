export const CAPTURE_TOTAL_TIMEOUT_MS = 55_000;
export const CAPTURE_PAGE_LOAD_TIMEOUT_MS = 12_000;
export const CAPTURE_NAVIGATION_TIMEOUT_MS = 5_000;
export const CAPTURE_NETWORK_IDLE_MS = 2_500;
export const CAPTURE_SETTLE_MS = 400;
export const CAPTURE_AFTER_NEXT_MS = 800;
export const CAPTURE_MAX_PAGES = 3;
export const CAPTURE_VIEWPORT = { width: 1440, height: 1200 } as const;

/** Client abort slightly above server hard timeout (safe mode). */
export const CAPTURE_CLIENT_TIMEOUT_MS = 65_000;

/** Evidence full-walkthrough mode */
export const EVIDENCE_FULL_TIMEOUT_MS = 180_000;
export const EVIDENCE_FULL_CLIENT_TIMEOUT_MS = 185_000;
/** Per-page budget for fill/next after capture (local Chrome). */
export const EVIDENCE_FULL_PAGE_TIMEOUT_MS = 10_000;
/**
 * Serverless Chromium is slower (cold start, full-page JPEG, Hangul fonts).
 * Keep below prior 45s so a stuck page fails faster and the walk can finish.
 */
export const EVIDENCE_FULL_PAGE_TIMEOUT_SERVERLESS_MS = 28_000;
export const EVIDENCE_FULL_MAX_PAGES = 50;
/** Cap walk length on Vercel — response body + Chromium time dominate. */
export const EVIDENCE_FULL_MAX_PAGES_SERVERLESS = 24;

export function evidenceFullPageTimeoutMs(): number {
  return isServerlessCaptureRuntime()
    ? EVIDENCE_FULL_PAGE_TIMEOUT_SERVERLESS_MS
    : EVIDENCE_FULL_PAGE_TIMEOUT_MS;
}

export function evidenceFullMaxPages(): number {
  return isServerlessCaptureRuntime()
    ? EVIDENCE_FULL_MAX_PAGES_SERVERLESS
    : EVIDENCE_FULL_MAX_PAGES;
}

/**
 * Vercel Functions response body limit is 4.5MB.
 * Keep encoded screenshot payload under this with JSON metadata headroom.
 */
export const CAPTURE_MAX_RESPONSE_BYTES = 3_600_000;

/** JPEG quality on serverless to fit many pages under the body limit. */
export const CAPTURE_SERVERLESS_JPEG_QUALITY = 48;

export const CAPTURE_SERVERLESS_VIEWPORT = {
  width: 1100,
  height: 900,
} as const;

export function isServerlessCaptureRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

export const NEXT_LABEL =
  /^(다음|다음\s*페이지|계속|다음으로|다음\s*단계|시작하기|시작|설문\s*시작|참여하기|next|continue|start|다음\s*>|>)$/i;
export const NEXT_LABEL_SOFT =
  /(다음\s*페이지|다음으로|다음\s*단계|시작하기|설문\s*시작|참여하기|\bnext\b|\bcontinue\b|\bstart\b|^다음$|^시작$)/i;
export const FORBIDDEN_NAV_LABEL =
  /제출|보내기|완료|등록하기|확인\s*및\s*제출|응답\s*제출|완료하기|submit|send|finish|done|로그인|login|sign\s*in|이전|뒤로|back|prev|초기화|이동중|loading/i;
export const SUBMIT_LABEL =
  /^(제출|제출하기|보내기|완료|완료하기|응답\s*제출|응답하기|작성\s*완료|확인\s*및\s*제출|submit|send|finish|done)$/i;
export const SUBMIT_LABEL_SOFT =
  /(제출하기|응답하기|작성\s*완료|응답\s*제출|확인\s*및\s*제출|보내기|완료하기|\bsubmit\b|\bsend\b|\bfinish\b|\bdone\b|제출)/i;
export const VALIDATION_ERROR =
  /이\s*질문은\s*필수|필수\s*항목입니다|필수\s*응답|답변해\s*주세요|입력해\s*주세요|선택해\s*주세요|작성해\s*주세요|this\s*is\s*a\s*required|required\s*question|please\s*(answer|fill|select)|captcha|로봇이\s*아닙니다|로그인/i;

/** Synthetic placeholders — clearly non-real identities for evidence walkthrough only. */
export const TEMP_ANSWER = {
  name: "증빙용 임시값",
  title: "임시",
  email: "capture@example.invalid",
  phone: "010-0000-0000",
  address: "증빙용 임시주소",
  freeText: "증빙용 자동 탐색",
  number: "1",
  date: "2000-01-01",
} as const;
