const PRIVATE_CORP_MARKERS = [
  /\(주\)/gi,
  /㈜/g,
  /주식회사/g,
  /㈔/g,
  /\(유\)/gi,
  /유한회사/g,
];

/** Region short-name → official name (only explicit city forms, never bare 서울). */
const REGION_EXPAND: Array<[RegExp, string]> = [
  [/서울특별시/g, "서울특별시"],
  [/서울시/g, "서울특별시"],
  [/부산광역시/g, "부산광역시"],
  [/부산시/g, "부산광역시"],
  [/대구광역시/g, "대구광역시"],
  [/대구시/g, "대구광역시"],
  [/인천광역시/g, "인천광역시"],
  [/인천시/g, "인천광역시"],
  [/광주광역시/g, "광주광역시"],
  [/광주시(?!민)/g, "광주광역시"],
  [/대전광역시/g, "대전광역시"],
  [/대전시/g, "대전광역시"],
  [/울산광역시/g, "울산광역시"],
  [/울산시/g, "울산광역시"],
  [/세종특별자치시/g, "세종특별자치시"],
  [/세종시/g, "세종특별자치시"],
  [/경기도/g, "경기도"],
  [/(?<![가-힣])경기(?!도|[가-힣])/g, "경기도"],
  [/강원특별자치도/g, "강원특별자치도"],
  [/강원도/g, "강원특별자치도"],
  [/충청남도/g, "충청남도"],
  [/충남/g, "충청남도"],
  [/충청북도/g, "충청북도"],
  [/충북/g, "충청북도"],
  [/전라남도/g, "전라남도"],
  [/전남/g, "전라남도"],
  [/전북특별자치도/g, "전북특별자치도"],
  [/전라북도/g, "전북특별자치도"],
  [/전북/g, "전북특별자치도"],
  [/경상남도/g, "경상남도"],
  [/경남/g, "경상남도"],
  [/경상북도/g, "경상북도"],
  [/경북/g, "경상북도"],
  [/제주특별자치도/g, "제주특별자치도"],
  [/제주도/g, "제주특별자치도"],
];

const FOUNDATION_PREFIXES = [
  /^\(재\)/,
  /^재단법인\s*/,
  /^사단법인\s*/,
  /^\(사\)/,
];

/**
 * Normalize institution-like strings for matching.
 * Keeps public-sector tokens (시청/교육청/공단/재단 …).
 * Strips private corp markers and expands 서울시→서울특별시 style aliases.
 */
export function normalizeInstitutionName(input: string): string {
  if (!input) return "";

  let text = input.normalize("NFKC").trim();

  // Split parenthetical aliases out — keep outer name for primary normalize.
  text = text.replace(/[（]/g, "(").replace(/[）]/g, ")");
  text = text.replace(/\([^)]*\)/g, " ");

  for (const marker of PRIVATE_CORP_MARKERS) {
    text = text.replace(marker, " ");
  }

  for (const prefix of FOUNDATION_PREFIXES) {
    text = text.replace(prefix, "");
  }

  for (const [pattern, replacement] of REGION_EXPAND) {
    text = text.replace(pattern, replacement);
  }

  text = text.toLowerCase();
  text = text.replace(/[^\p{L}\p{N}가-힣]/gu, "");
  return text;
}

/** Extract alias candidates from parentheses, skipping corp markers like (주). */
export function extractParentheticalAliases(input: string): string[] {
  const aliases: string[] = [];
  const normalizedParens = input
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
  const pattern = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalizedParens)) !== null) {
    const inner = match[1].trim();
    if (/^(주|유|사|재)$/i.test(inner)) continue;
    if (inner.length >= 2) aliases.push(inner);
  }
  return aliases;
}

export function buildAliases(parts: {
  searchName?: string;
  institutionName?: string;
  district?: string;
  middleType?: string;
}): string[] {
  const aliases = new Set<string>();
  const add = (value?: string) => {
    const trimmed = (value ?? "").trim();
    if (trimmed.length >= 2) aliases.add(trimmed);
  };

  add(parts.searchName);
  add(parts.institutionName);
  add(parts.district);

  if (parts.searchName && parts.institutionName) {
    add(`${parts.searchName} ${parts.institutionName}`);
    add(`${parts.institutionName}`);
  }

  if (parts.district && parts.institutionName) {
    add(`${parts.district} ${parts.institutionName}`);
  }

  // Short city aliases for metros
  for (const name of [parts.searchName, parts.institutionName]) {
    if (!name) continue;
    if (name.includes("서울특별시")) add(name.replace(/서울특별시/g, "서울시"));
    if (name.includes("부산광역시")) add(name.replace(/부산광역시/g, "부산시"));
    if (name.includes("대구광역시")) add(name.replace(/대구광역시/g, "대구시"));
    if (name.includes("인천광역시")) add(name.replace(/인천광역시/g, "인천시"));
    if (name.includes("광주광역시")) add(name.replace(/광주광역시/g, "광주시"));
    if (name.includes("대전광역시")) add(name.replace(/대전광역시/g, "대전시"));
    if (name.includes("울산광역시")) add(name.replace(/울산광역시/g, "울산시"));
    if (name.includes("세종특별자치시")) add(name.replace(/세종특별자치시/g, "세종시"));
    if (name === "서울특별시교육청") add("서울교육청");
    if (name.endsWith("교육청") && name.includes("서울특별시")) {
      add("서울교육청");
    }
    for (const alias of extractParentheticalAliases(name)) add(alias);
  }

  // Strip foundation prefixes as additional aliases
  for (const value of [...aliases]) {
    for (const prefix of FOUNDATION_PREFIXES) {
      const stripped = value.replace(prefix, "").trim();
      if (stripped !== value) add(stripped);
    }
    add(value.replace(/^\(재\)/, "").replace(/^재단법인\s*/, ""));
  }

  return [...aliases];
}

export function buildNormalizedKeys(aliases: string[]): string[] {
  const keys = new Set<string>();
  for (const alias of aliases) {
    const key = normalizeInstitutionName(alias);
    if (key.length >= 3) keys.add(key);
  }
  return [...keys];
}
