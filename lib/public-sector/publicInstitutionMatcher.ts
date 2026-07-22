import type {
  AuthorityTextCandidate,
  PublicInstitutionIndex,
  PublicInstitutionIndexItem,
  PublicInstitutionMatchResult,
} from "@/lib/public-sector/types";
import { normalizeInstitutionName } from "@/lib/public-sector/normalizeInstitutionName";
import { getPublicInstitutionIndex } from "@/lib/public-sector/loadPublicInstitutionIndex";

const PUBLIC_KEYWORD_FALLBACK = [
  "중앙부처",
  "지방자치단체",
  "시청",
  "도청",
  "구청",
  "군청",
  "교육청",
  "보건소",
  "주민센터",
  "행정복지센터",
  "공사",
  "공단",
  "공공기관",
  "공공재단",
  "문화재단",
  "복지재단",
  "도서관",
  "박물관",
  "체육시설",
  "국립",
  "시립",
  "구립",
  "군립",
  "도립",
];

const FACILITY_COMPOUND_KEYWORDS = [
  "박물관",
  "미술관",
  "도서관",
  "체육시설",
  "문화재단",
  "복지재단",
  "시설관리공단",
  "도시공사",
  "교육지원청",
  "보건소",
  "주민센터",
  "행정복지센터",
];

const RESIDENCE_QUESTION_PATTERN =
  /거주\s*지역|거주\s*지|사는\s*곳|살고\s*있는\s*지역|거주지|어느\s*지역|어느\s*시(?:도|군구)?/;

const PRIVATE_FALSE_POSITIVE_PATTERN =
  /마케팅|컨설팅|연구소|주식회사|㈜|\(주\)|고객\s*만족|민간/;

type IndexedKey = {
  key: string;
  item: PublicInstitutionIndexItem;
  viaAlias: boolean;
};

function displayName(item: PublicInstitutionIndexItem): string {
  if (item.institutionName && item.searchName) {
    if (item.institutionName.includes(item.searchName)) {
      return item.institutionName;
    }
    return `${item.searchName} ${item.institutionName}`.trim();
  }
  return item.institutionName || item.searchName;
}

function buildKeyIndex(index: PublicInstitutionIndex): IndexedKey[] {
  const entries: IndexedKey[] = [];
  for (const item of index.items) {
    const primary = new Set(
      [item.searchName, item.institutionName]
        .filter(Boolean)
        .map((value) => normalizeInstitutionName(String(value))),
    );
    for (const key of item.normalizedKeys) {
      if (key.length < 3) continue;
      // Avoid ultra-generic keys that over-match ("경기도" alone is ok length 3+)
      entries.push({
        key,
        item,
        viaAlias: !primary.has(key),
      });
    }
  }
  // Longer keys first for better specificity
  entries.sort((a, b) => b.key.length - a.key.length);
  return entries;
}

let cachedKeyIndex: IndexedKey[] | null = null;

function getKeyIndex(): IndexedKey[] {
  if (!cachedKeyIndex) {
    cachedKeyIndex = buildKeyIndex(getPublicInstitutionIndex());
  }
  return cachedKeyIndex;
}

function isResidenceOnlyCandidate(candidate: AuthorityTextCandidate): boolean {
  if (candidate.source.startsWith("option:")) return true;
  if (candidate.source === "residence_options") return true;
  return RESIDENCE_QUESTION_PATTERN.test(candidate.text);
}

function looksLikePrivateOrg(text: string): boolean {
  return PRIVATE_FALSE_POSITIVE_PATTERN.test(text);
}

function emptyResult(): PublicInstitutionMatchResult {
  return {
    isPublicSector: false,
    confidence: "none",
    matchedBy: "none",
  };
}

function findExactOrAlias(
  candidates: AuthorityTextCandidate[],
): PublicInstitutionMatchResult | null {
  const keyIndex = getKeyIndex();

  for (const candidate of candidates) {
    if (isResidenceOnlyCandidate(candidate)) continue;
    if (!candidate.text.trim()) continue;

    const haystack = normalizeInstitutionName(candidate.text);
    if (haystack.length < 3) continue;

    for (const entry of keyIndex) {
      if (!haystack.includes(entry.key)) continue;

      // Bare metro/province names need stronger context if text looks private
      const isBroadRegionOnly =
        /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청남도|충청북도|전라남도|전북특별자치도|경상남도|경상북도|제주특별자치도)$/.test(
          entry.key,
        );
      if (isBroadRegionOnly && looksLikePrivateOrg(candidate.text)) {
        continue;
      }
      // Broad region alone in a short fragment without public token → weak; skip for exact
      if (
        isBroadRegionOnly &&
        entry.key.length === haystack.length &&
        !PUBLIC_KEYWORD_FALLBACK.some((keyword) =>
          candidate.text.includes(keyword),
        )
      ) {
        // Allow if source is operator/title/footer (authority identity)
        if (
          !/title|operator|footer|notice|processor|contact|host|organizer|description/i.test(
            candidate.source,
          )
        ) {
          continue;
        }
      }

      const name = displayName(entry.item);
      return {
        isPublicSector: true,
        confidence: entry.viaAlias ? "medium" : "high",
        matchedName: name,
        matchedType: entry.item.majorType || undefined,
        matchedRegion:
          entry.item.district ||
          entry.item.middleType ||
          entry.item.searchName ||
          undefined,
        matchedBy: entry.viaAlias ? "alias" : "exact_list",
        evidenceText: candidate.text.slice(0, 200),
        evidenceSource: candidate.source,
      };
    }
  }

  return null;
}

function findCompoundFacility(
  candidates: AuthorityTextCandidate[],
): PublicInstitutionMatchResult | null {
  const keyIndex = getKeyIndex();

  for (const candidate of candidates) {
    if (isResidenceOnlyCandidate(candidate)) continue;
    const text = candidate.text;
    const facility = FACILITY_COMPOUND_KEYWORDS.find((keyword) =>
      text.includes(keyword),
    );
    if (!facility) continue;

    const haystack = normalizeInstitutionName(text);
    for (const entry of keyIndex) {
      // Prefer local gov / district keys (XX시, XX구, XX군)
      if (!/(시|구|군|특별시|광역시)$/.test(entry.item.institutionName ?? "") &&
          !/(시|구|군|특별시|광역시|도)$/.test(entry.item.searchName ?? "")) {
        // still allow if institution name itself is contained
      }
      if (entry.key.length < 3) continue;
      if (!haystack.includes(entry.key)) continue;

      // Require the key to be a place-like token or the facility compound itself
      const placeLike =
        /(시|구|군|특별시|광역시|도)$/.test(entry.key) ||
        /(시|구|군)$/.test(entry.item.institutionName ?? "");
      if (!placeLike && !haystack.includes(normalizeInstitutionName(facility))) {
        continue;
      }
      if (!placeLike) continue;

      const matchedName =
        text.match(
          new RegExp(`[가-힣A-Za-z0-9]{2,20}${facility}`),
        )?.[0] ?? `${displayName(entry.item)} ${facility}`;

      return {
        isPublicSector: true,
        confidence: "high",
        matchedName,
        matchedType: entry.item.majorType || "공공시설",
        matchedRegion:
          entry.item.district ||
          entry.item.institutionName ||
          entry.item.searchName,
        matchedBy: "alias",
        evidenceText: text.slice(0, 200),
        evidenceSource: candidate.source,
      };
    }
  }

  return null;
}

function findKeywordFallback(
  candidates: AuthorityTextCandidate[],
): PublicInstitutionMatchResult | null {
  for (const candidate of candidates) {
    if (isResidenceOnlyCandidate(candidate)) continue;
    if (looksLikePrivateOrg(candidate.text) && !/공공기관|시청|교육청|구청|군청|도청/.test(candidate.text)) {
      continue;
    }

    for (const keyword of PUBLIC_KEYWORD_FALLBACK) {
      if (!candidate.text.includes(keyword)) continue;

      // Avoid treating option lists of regions as public subject
      if (
        /서울|경기|인천|부산|대구|광주|대전|울산|제주/.test(candidate.text) &&
        /기타|선택|해당/.test(candidate.text) &&
        RESIDENCE_QUESTION_PATTERN.test(candidate.text)
      ) {
        continue;
      }

      return {
        isPublicSector: true,
        confidence: "medium",
        matchedName: keyword,
        matchedBy: "keyword_fallback",
        evidenceText: candidate.text.slice(0, 200),
        evidenceSource: candidate.source,
      };
    }
  }

  return null;
}

/**
 * Match survey authority texts against the sanitized public-institution index.
 * Residence option lists must not be passed (or will be ignored via source/heuristics).
 */
export function matchPublicInstitution(
  inputTexts: Array<string | AuthorityTextCandidate>,
): PublicInstitutionMatchResult {
  const candidates: AuthorityTextCandidate[] = inputTexts
    .map((entry) =>
      typeof entry === "string"
        ? { text: entry, source: "text" }
        : { text: entry.text, source: entry.source },
    )
    .filter((entry) => entry.text.trim().length > 0);

  if (candidates.length === 0) return emptyResult();

  const exact = findExactOrAlias(candidates);
  if (exact) {
    // Promote alias+facility style already handled; keep confidence
    if (exact.matchedBy === "alias" && exact.confidence === "medium") {
      const compoundBoost = FACILITY_COMPOUND_KEYWORDS.some((keyword) =>
        (exact.evidenceText ?? "").includes(keyword),
      );
      if (compoundBoost) exact.confidence = "high";
    }
    return exact;
  }

  const compound = findCompoundFacility(candidates);
  if (compound) return compound;

  const fallback = findKeywordFallback(candidates);
  if (fallback) return fallback;

  return emptyResult();
}
