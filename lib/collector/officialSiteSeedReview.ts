/**
 * Detect official-site seed homepage mismatches (e.g. 강남구 → gangdong.go.kr).
 * Local governments are checked against hostname slugs; ministries are left ok
 * unless the URL is invalid.
 */

import type { OfficialInstitutionSeed } from "@/lib/collector/officialSiteSeeds";

export type SeedReviewStatus = "ok" | "needs_review";
export type SeedReviewReason =
  | "domain_mismatch"
  | "invalid_url"
  | "missing_homepage";

export type OfficialSiteSeedReview = {
  organizationName: string;
  homepageUrl: string;
  status: SeedReviewStatus;
  reason: SeedReviewReason | null;
};

const LOCAL_TYPE = new Set(["기초자치단체", "광역자치단체"]);

const ONSET = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
];
const VOWEL = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
const CODA = [
  "",
  "k",
  "k",
  "ks",
  "n",
  "nj",
  "nh",
  "t",
  "l",
  "lk",
  "lm",
  "lb",
  "ls",
  "lt",
  "lp",
  "lh",
  "m",
  "p",
  "ps",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "t",
];

const LOCALITY_RE =
  /^(.+?)(특별자치시|특별자치도|광역시|특별시|자치시|남도|북도|도|시|군|구)$/;

export function romanizeHangul(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if (code < 0xac00 || code > 0xd7a3) {
      if (/[a-z0-9]/i.test(ch)) out += ch.toLowerCase();
      continue;
    }
    const syl = code - 0xac00;
    const onset = Math.floor(syl / 588);
    const vowel = Math.floor((syl % 588) / 28);
    const coda = syl % 28;
    out += `${ONSET[onset] || ""}${VOWEL[vowel] || ""}${CODA[coda] || ""}`;
  }
  return out;
}

export function localitySlugs(organizationName: string): string[] {
  const name = organizationName.trim();
  const match = name.match(LOCALITY_RE);
  if (!match) return [];
  const stem = match[1] || "";
  const suffix = match[2] || "";
  const suffixRoman =
    suffix === "구"
      ? "gu"
      : suffix === "시" || suffix === "광역시" || suffix === "특별시" || suffix === "자치시" || suffix === "특별자치시"
        ? "si"
        : suffix === "군"
          ? "gun"
          : "";
  const slugs = new Set<string>();
  if (stem.length >= 2) slugs.add(romanizeHangul(stem));
  if (stem && suffixRoman) slugs.add(`${romanizeHangul(stem)}${suffixRoman}`);
  slugs.add(romanizeHangul(name));
  return [...slugs].filter((slug) => slug.length >= 4);
}

export function hostnameLabels(homepageUrl: string): string[] {
  try {
    const host = new URL(homepageUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return host.split(".").filter(Boolean);
  } catch {
    return [];
  }
}

export function hostHasSlug(labels: string[], slug: string): boolean {
  if (slug.length < 4) return false;
  for (const label of labels) {
    if (label === slug) return true;
    if (slug.length >= 5 && label.startsWith(slug)) return true;
    if (slug.length >= 6 && label.includes(slug)) return true;
  }
  return false;
}

function isLocalGovernment(seed: OfficialInstitutionSeed): boolean {
  if (LOCAL_TYPE.has(seed.organizationType)) return true;
  return LOCALITY_RE.test(seed.organizationName.trim());
}

export function reviewOfficialSiteSeed(
  seed: OfficialInstitutionSeed,
  peers: OfficialInstitutionSeed[] = [],
): OfficialSiteSeedReview {
  const homepageUrl = (seed.homepageUrl || "").trim();
  if (!homepageUrl) {
    return {
      organizationName: seed.organizationName,
      homepageUrl,
      status: "needs_review",
      reason: "missing_homepage",
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(homepageUrl);
  } catch {
    return {
      organizationName: seed.organizationName,
      homepageUrl,
      status: "needs_review",
      reason: "invalid_url",
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      organizationName: seed.organizationName,
      homepageUrl,
      status: "needs_review",
      reason: "invalid_url",
    };
  }
  if (!isLocalGovernment(seed)) {
    return {
      organizationName: seed.organizationName,
      homepageUrl,
      status: "ok",
      reason: null,
    };
  }

  const labels = hostnameLabels(homepageUrl);
  const ownSlugs = localitySlugs(seed.organizationName);
  const ownMatch = ownSlugs.some((slug) => hostHasSlug(labels, slug));
  if (ownMatch) {
    return {
      organizationName: seed.organizationName,
      homepageUrl,
      status: "ok",
      reason: null,
    };
  }

  const competing = peers.filter(
    (peer) =>
      peer.organizationName !== seed.organizationName &&
      isLocalGovernment(peer),
  );
  for (const peer of competing) {
    const peerSlugs = localitySlugs(peer.organizationName);
    if (peerSlugs.some((slug) => hostHasSlug(labels, slug))) {
      return {
        organizationName: seed.organizationName,
        homepageUrl,
        status: "needs_review",
        reason: "domain_mismatch",
      };
    }
  }

  try {
    const origin = new URL(homepageUrl).origin.replace(/\/$/, "").toLowerCase();
    for (const peer of competing) {
      let peerOrigin = "";
      try {
        peerOrigin = new URL(peer.homepageUrl).origin.replace(/\/$/, "").toLowerCase();
      } catch {
        continue;
      }
      if (peerOrigin !== origin) continue;
      const peerSlugs = localitySlugs(peer.organizationName);
      if (
        peerSlugs.some((slug) => hostHasSlug(hostnameLabels(peer.homepageUrl), slug)) &&
        !ownMatch
      ) {
        return {
          organizationName: seed.organizationName,
          homepageUrl,
          status: "needs_review",
          reason: "domain_mismatch",
        };
      }
    }
  } catch {
    /* ignore */
  }

  return {
    organizationName: seed.organizationName,
    homepageUrl,
    status: "ok",
    reason: null,
  };
}

export function reviewOfficialSiteSeeds(
  seeds: OfficialInstitutionSeed[],
): OfficialSiteSeedReview[] {
  return seeds.map((seed) => reviewOfficialSiteSeed(seed, seeds));
}
