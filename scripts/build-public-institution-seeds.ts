/**
 * Build official-site collector seeds from the local WiseON Excel.
 *
 * Usage:
 *   npx tsx scripts/build-public-institution-seeds.ts [xlsx-path]
 *
 * Default xlsx (gitignored):
 *   data/source/wiseon_public_institution_list.xlsx
 *
 * Never writes contact-person, phone, or email fields into the JSON.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as XLSX from "xlsx";
import {
  groupUrlsByHostname,
  homepageFromHttpUrl,
  officialSiteHostname,
  partitionSeedUrlsByHomepageOrigin,
  uniqueHttpUrls,
} from "../lib/collector/officialSiteOrigin";
import { splitOfficialInstitutionSeedsByHost } from "../lib/collector/officialSiteSeeds";

export type OfficialInstitutionSeed = {
  organizationName: string;
  organizationType: string;
  homepageUrl: string;
  seedUrls: string[];
  rejectedSeedUrls?: string[];
  source: "wiseon_public_institution_list";
};

const ROOT = process.cwd();
const DEFAULT_SOURCE = join(
  ROOT,
  "data",
  "source",
  "wiseon_public_institution_list.xlsx",
);
const OUTPUT = join(ROOT, "data", "public-institution-seeds.json");

const NAME_KEYS = ["기관명(부속기관)", "세분류(검색기준)", "기관명"];
const TYPE_KEYS = ["대분류(기관유형)", "기관유형"];
const ORG_URL_KEYS = ["조직도 링크", "조직도URL", "조직도"];
const HOME_URL_KEYS = ["대표 홈페이지", "홈페이지", "홈페이지 URL", "공식 홈페이지"];
const RELATED_URL_KEYS = ["관련 사이트", "관련사이트", "관련 URL"];

const FORBIDDEN_COLUMN_PATTERN =
  /담당|전화|휴대폰|핸드폰|메일|email|연락|성명|이름|모바일|fax|팩스|팀장|부서/;

const ALLOWED_COLUMN_PATTERN =
  /^(NO|대분류|중분류|세분류|기관명|시군구|조직도|홈페이지|관련)/;

function cell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function normalizeHttpUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  value = value.replace(/[),.;]+$/g, "");
  if (/^(javascript:|mailto:|tel:|data:)/i.test(value)) return null;
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value)) {
    if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(value)) {
      value = `https://${value}`;
    } else {
      return null;
    }
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    if (parsed.hostname === "localhost") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function homepageFromUrl(raw: string): string | null {
  const normalized = normalizeHttpUrl(raw);
  if (!normalized) return null;
  return homepageFromHttpUrl(normalized);
}

export function buildOfficialInstitutionSeeds(
  rows: Array<Record<string, unknown>>,
): {
  seeds: OfficialInstitutionSeed[];
  invalidUrlsExcluded: number;
  unnamedExcluded: number;
} {
  const drafts: OfficialInstitutionSeed[] = [];
  let unnamedExcluded = 0;

  for (const row of rows) {
    const organizationName = cell(row, NAME_KEYS);
    if (!organizationName) {
      unnamedExcluded += 1;
      continue;
    }
    const organizationType = cell(row, TYPE_KEYS);
    const urls = uniqueHttpUrls([
      normalizeHttpUrl(cell(row, HOME_URL_KEYS)),
      normalizeHttpUrl(cell(row, ORG_URL_KEYS)),
      normalizeHttpUrl(cell(row, RELATED_URL_KEYS)),
      homepageFromUrl(cell(row, ORG_URL_KEYS)),
    ]);
    if (urls.length === 0) continue;
    const groups = groupUrlsByHostname(urls);
    for (const [host, hostUrls] of groups) {
      const homepageUrl =
        hostUrls.map((url) => homepageFromHttpUrl(url)).find(Boolean) || null;
      if (!homepageUrl || officialSiteHostname(homepageUrl) !== host) continue;
      const partitioned = partitionSeedUrlsByHomepageOrigin(homepageUrl, hostUrls);
      drafts.push({
        organizationName,
        organizationType,
        homepageUrl,
        seedUrls: partitioned.validSeedUrls,
        rejectedSeedUrls: partitioned.rejectedSeedUrls,
        source: "wiseon_public_institution_list",
      });
    }
  }

  const seeds = splitOfficialInstitutionSeedsByHost(drafts);
  const invalidUrlsExcluded = rows.filter((row) => {
    const organizationName = cell(row, NAME_KEYS);
    if (!organizationName) return false;
    const urls = uniqueHttpUrls([
      normalizeHttpUrl(cell(row, HOME_URL_KEYS)),
      normalizeHttpUrl(cell(row, ORG_URL_KEYS)),
      normalizeHttpUrl(cell(row, RELATED_URL_KEYS)),
      homepageFromUrl(cell(row, ORG_URL_KEYS)),
    ]);
    return urls.length === 0;
  }).length;

  return { seeds, invalidUrlsExcluded, unnamedExcluded };
}

function main() {
  const sourcePath = resolve(process.argv[2] || DEFAULT_SOURCE);
  if (!existsSync(sourcePath)) {
    console.error(`엑셀 원본이 없습니다: ${sourcePath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(sourcePath);
  const sheetName =
    workbook.SheetNames.find((name) => name === "공공기관") ??
    workbook.SheetNames.find((name) => name === "기관리스트") ??
    workbook.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트를 찾을 수 없습니다.");

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const privateHeaders = headers.filter((header) =>
    FORBIDDEN_COLUMN_PATTERN.test(header),
  );
  for (const header of headers) {
    if (
      header.startsWith("__EMPTY") ||
      FORBIDDEN_COLUMN_PATTERN.test(header) ||
      ALLOWED_COLUMN_PATTERN.test(header)
    ) {
      continue;
    }
    console.warn(`경고: 매핑하지 않은 컬럼 무시 → "${header}"`);
  }

  const { seeds, invalidUrlsExcluded, unnamedExcluded } =
    buildOfficialInstitutionSeeds(rows);

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(seeds, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourcePath,
        sheet: sheetName,
        rows: rows.length,
        privateColumnsExcluded: privateHeaders,
        institutionCount: seeds.length,
        homepageUrls: seeds.length,
        seedUrlCount: seeds.reduce((n, s) => n + s.seedUrls.length, 0),
        invalidUrlsExcluded,
        unnamedExcluded,
        output: OUTPUT,
      },
      null,
      2,
    ),
  );
}

const isDirectRun = process.argv[1]?.includes("build-public-institution-seeds");
if (isDirectRun) {
  main();
}
