import { safeUrlCheck, type UrlSafetyResult } from "@/lib/security/urlSafety";

/**
 * Capture-specific URL gate. Reuses the shared SSRF checker
 * (blocks localhost, private IPs, file/data/javascript, metadata hosts, etc.).
 */
export async function assertCaptureUrlSafe(
  rawUrl: string,
): Promise<UrlSafetyResult> {
  return safeUrlCheck(rawUrl);
}

export async function isCaptureUrlSafeAfterNavigation(
  rawUrl: string,
): Promise<boolean> {
  const result = await safeUrlCheck(rawUrl);
  return Boolean(result.safe && result.normalizedUrl);
}
