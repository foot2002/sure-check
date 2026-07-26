import { CAPTURE_MAX_RESPONSE_BYTES } from "@/lib/evidence/capture/captureConfig";
import type { AutoScreenshotPayload } from "@/lib/evidence/capture/captureTypes";

/**
 * Vercel function responses are capped at 4.5MB. Prefer keeping earlier pages
 * (public + PII often later — but truncation is better than FUNCTION_PAYLOAD_TOO_LARGE).
 * When possible JPEG compression already keeps full walks under the budget.
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
    // Rough JSON overhead per item
    const cost = encodedBytes + 256;
    if (kept.length > 0 && used + cost > maxBytes) {
      break;
    }
    if (kept.length === 0 && cost > maxBytes) {
      // Always try to include at least the first page if somehow oversized
      kept.push({
        ...shot,
        base64: shot.base64.slice(0, Math.max(0, maxBytes - 512)),
        size: Math.min(shot.size, maxBytes),
      });
      limitations.push(
        "서버 응답 크기 제한으로 첫 화면 이미지가 축소·절단되었을 수 있습니다.",
      );
      return { screenshots: kept, omittedCount: screenshots.length - 1, limitations };
    }
    kept.push(shot);
    used += cost;
  }

  const omittedCount = screenshots.length - kept.length;
  if (omittedCount > 0) {
    limitations.push(
      `배포 환경 응답 크기 제한(약 4.5MB)으로 인해 ${omittedCount}개 화면은 API 응답에서 생략되었습니다. 확보된 ${kept.length}개 화면은 ZIP에 포함됩니다.`,
    );
  }

  return { screenshots: kept, omittedCount, limitations };
}
