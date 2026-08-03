import { CAPTURE_MAX_RESPONSE_BYTES } from "@/lib/evidence/capture/captureConfig";
import type { AutoScreenshotPayload } from "@/lib/evidence/capture/captureTypes";

/**
 * Vercel function responses are capped at 4.5MB.
 * Prefer earlier pages; never truncate base64 mid-string (corrupts images).
 * Oversized shots are omitted entirely — Storage ZIP still holds full captures.
 */
export function fitScreenshotsForResponse(
  screenshots: AutoScreenshotPayload[],
  maxBytes: number = CAPTURE_MAX_RESPONSE_BYTES,
): {
  screenshots: AutoScreenshotPayload[];
  omittedCount: number;
  limitations: string[];
} {
  const limitations: string[] = [];
  let used = 0;
  const kept: AutoScreenshotPayload[] = [];

  for (const shot of screenshots) {
    const encodedBytes =
      typeof shot.base64 === "string"
        ? shot.base64.length
        : Math.ceil((shot.size || 0) * (4 / 3));
    const cost = encodedBytes + 256;
    if (used + cost > maxBytes) {
      break;
    }
    kept.push(shot);
    used += cost;
  }

  const omittedCount = screenshots.length - kept.length;
  if (omittedCount > 0) {
    limitations.push(
      `배포 환경 응답 크기 제한으로 인해 ${omittedCount}개 화면은 API 응답에서 생략되었습니다. 전체 화면은 Storage ZIP(신고용 증빙 패키지)에서 확인할 수 있습니다.`,
    );
  }
  if (kept.length === 0 && screenshots.length > 0) {
    limitations.push(
      "개별 화면이 응답 크기 제한을 초과하여 API 미리보기에서는 생략되었습니다. Storage ZIP으로 확인해 주세요.",
    );
  }

  return { screenshots: kept, omittedCount, limitations };
}
