import { lookup } from "dns/promises";
import { isIP } from "net";

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
  normalizedUrl?: string;
}

const BLOCKED_PROTOCOLS = new Set([
  "file:",
  "data:",
  "javascript:",
  "chrome:",
  "chrome-extension:",
  "ftp:",
  "mailto:",
  "blob:",
]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
]);

/** Public survey hosts — skip DNS private-IP checks (saves RTT on Vercel). */
const TRUSTED_PUBLIC_HOST_SUFFIXES = [
  "docs.google.com",
  "forms.gle",
  "form.naver.com",
  "survey-api.naver.com",
  "naver.me",
  "moaform.com",
  "surveyl.ink",
  "survey.pstatic.net",
];

function isTrustedPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return TRUSTED_PUBLIC_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
}

async function hostnameResolvesToPrivateIp(hostname: string): Promise<boolean> {
  if (isIP(hostname)) {
    return isPrivateIp(hostname);
  }

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return true;
  }

  if (hostname.endsWith(".localhost")) {
    return true;
  }

  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    if (results.length === 0) return true;
    return results.some((r) => isPrivateIp(r.address));
  } catch {
    return false;
  }
}

export async function safeUrlCheck(rawUrl: string): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "URL 파싱에 실패했습니다." };
  }

  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    return { safe: false, reason: `${parsed.protocol} 프로토콜은 허용되지 않습니다.` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: "http 또는 https URL만 허용됩니다." };
  }

  if (!parsed.hostname) {
    return { safe: false, reason: "호스트명이 없습니다." };
  }

  if (!isTrustedPublicHostname(parsed.hostname)) {
    if (await hostnameResolvesToPrivateIp(parsed.hostname)) {
      return {
        safe: false,
        reason: "localhost, 사설 IP, 또는 내부 네트워크 주소는 차단됩니다.",
      };
    }
  }

  return { safe: true, normalizedUrl: parsed.toString() };
}
