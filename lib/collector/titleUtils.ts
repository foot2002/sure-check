/**
 * Title helpers for collector storage — never store raw URLs as titles.
 */

export function isUrlLikeTitle(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^(forms\.gle|form\.naver\.com|naver\.me|moaform\.com|docs\.google\.com)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function sanitizeSurveyTitle(
  preferred: string | null | undefined,
  fallback: string | null | undefined = null,
): string | null {
  const pick = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) return null;
    if (isUrlLikeTitle(trimmed)) return null;
    return trimmed.slice(0, 300);
  };

  return pick(preferred) || pick(fallback) || null;
}

export function titleOrNeedsConfirmation(
  preferred: string | null | undefined,
  fallback: string | null | undefined = null,
): string {
  return sanitizeSurveyTitle(preferred, fallback) || "제목 확인 필요";
}
