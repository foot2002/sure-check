import {
  isShortenerUrl,
  looksLikeSurveyDomainUrl,
} from "@/lib/collector/platformDetect";

const URL_RE =
  /https?:\/\/[^\s<>"')\]]+/gi;

function cleanupCapturedUrl(raw: string): string {
  return raw
    .replace(/[),.;]+$/g, "")
    .replace(/&amp;/gi, "&")
    .trim();
}

/**
 * Extract survey-domain candidate URLs from free text.
 * Format/path validation happens later — this stage only finds domain-related URLs.
 */
export function extractSurveyUrlsFromText(...parts: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (!part) continue;
    const matches = part.match(URL_RE) ?? [];
    for (const match of matches) {
      const cleaned = cleanupCapturedUrl(match);
      if (!cleaned) continue;
      if (!looksLikeSurveyDomainUrl(cleaned) && !isShortenerUrl(cleaned)) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(cleaned);
    }

    const barePatterns = [
      /(?:^|[\s(])((?:forms\.gle|form\.naver\.com|naver\.me|(?:[\w-]+\.)?moaform\.com|docs\.google\.com\/forms|surveyl\.ink)\/[^\s<>"')\]]+)/gi,
    ];
    for (const pattern of barePatterns) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(part)) !== null) {
        const withScheme = `https://${m[1]!.replace(/[),.;]+$/g, "")}`;
        if (!looksLikeSurveyDomainUrl(withScheme) && !isShortenerUrl(withScheme)) {
          continue;
        }
        const key = withScheme.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(withScheme);
      }
    }
  }

  return found;
}

export function preferShortenerFirst(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const as = isShortenerUrl(a) ? 0 : 1;
    const bs = isShortenerUrl(b) ? 0 : 1;
    return as - bs;
  });
}
