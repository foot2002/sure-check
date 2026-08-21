/**
 * Official-site same-origin helpers. http/https scheme differences are allowed;
 * hostname (www-stripped) and explicit ports are compared.
 */

export function officialSiteHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function explicitPort(url: URL): string | null {
  if (!url.port) return null;
  if (url.protocol === "https:" && url.port === "443") return null;
  if (url.protocol === "http:" && url.port === "80") return null;
  return url.port;
}

export function officialSiteOriginKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = officialSiteHostname(url);
    if (!host) return null;
    const port = explicitPort(parsed);
    return port ? `${host}:${port}` : host;
  } catch {
    return null;
  }
}

export function officialSiteSameOrigin(
  homepageUrl: string,
  candidateUrl: string,
): boolean {
  const home = officialSiteOriginKey(homepageUrl);
  const candidate = officialSiteOriginKey(candidateUrl);
  return Boolean(home && candidate && home === candidate);
}

export function uniqueHttpUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const key = raw.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

export type PartitionedSeedUrls = {
  homepageHost: string | null;
  validSeedUrls: string[];
  rejectedSeedUrls: string[];
};

export function partitionSeedUrlsByHomepageOrigin(
  homepageUrl: string,
  seedUrls: string[],
): PartitionedSeedUrls {
  const homepageHost = officialSiteHostname(homepageUrl);
  const validSeedUrls: string[] = [];
  const rejectedSeedUrls: string[] = [];
  for (const url of uniqueHttpUrls([homepageUrl, ...seedUrls])) {
    if (officialSiteSameOrigin(homepageUrl, url)) validSeedUrls.push(url);
    else rejectedSeedUrls.push(url);
  }
  return { homepageHost, validSeedUrls, rejectedSeedUrls };
}

export function groupUrlsByHostname(urls: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const url of uniqueHttpUrls(urls)) {
    const host = officialSiteHostname(url);
    if (!host) continue;
    const list = groups.get(host) || [];
    list.push(url);
    groups.set(host, list);
  }
  return groups;
}

export function homepageFromHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function officialSiteDisplayName(
  organizationName: string,
  homepageUrl: string,
): string {
  const host = officialSiteHostname(homepageUrl);
  return host ? `${organizationName} (${host})` : organizationName;
}
