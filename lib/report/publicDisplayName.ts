export type PublicOrgKind = "public" | "private" | "unknown";

const PUBLIC_ORG_NAME_HINT =
  /(공단|공사|구청|시청|도청|군청|교육청|위원회|진흥원|연구원|연구소|재단|보건소|소방서|경찰서|법원|검찰|국회|정부|대학|학교)/;

/**
 * Suggest a public-facing org/company name.
 * Final published value is always the admin-edited modal field, never this alone.
 */
export function suggestPublicDisplayName(
  name: string,
  type?: PublicOrgKind,
): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "익명 기관";

  const kind = resolveOrgKind(trimmed, type);
  if (kind === "public") return trimmed;

  const chars = Array.from(trimmed);
  if (chars.length <= 3) {
    return `*${chars.slice(1).join("")}`;
  }
  return `**${chars.slice(2).join("")}`;
}

export function resolveOrgKind(
  name: string,
  type?: PublicOrgKind,
): PublicOrgKind {
  if (type === "public" || type === "private") return type;
  const v = (type || "unknown").toLowerCase();
  if (v === "public" || v === "공공") return "public";
  if (v === "private" || v === "민간") return "private";
  if (PUBLIC_ORG_NAME_HINT.test(name)) {
    return "public";
  }
  return "unknown";
}

export function extractUrlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.trim().toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export type UrlVisibility = "full" | "hidden" | "domain_only";

export function applyUrlVisibility(input: {
  visibility: UrlVisibility | string | null | undefined;
  surveyUrl?: string | null;
  urlHost?: string | null;
}): { surveyUrl: string | null; urlHost: string | null } {
  const visibility = normalizeUrlVisibility(input.visibility);
  const host =
    (input.urlHost || "").trim() || extractUrlHost(input.surveyUrl);
  const url = (input.surveyUrl || "").trim() || null;
  if (visibility === "full") {
    return { surveyUrl: url, urlHost: host };
  }
  if (visibility === "domain_only") {
    return { surveyUrl: null, urlHost: host };
  }
  return { surveyUrl: null, urlHost: null };
}

export function normalizeUrlVisibility(
  value: string | null | undefined,
): UrlVisibility {
  if (value === "full" || value === "hidden" || value === "domain_only") {
    return value;
  }
  return "domain_only";
}
