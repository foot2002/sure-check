/**
 * Build sanitized public-institution index JSON from a local Excel file.
 *
 * Usage:
 *   npx tsx scripts/build-public-institution-index.ts
 *
 * Reads:  data/source/public-institutions.xlsx  (gitignored)
 * Writes: data/public-institutions.json         (safe for public repo)
 *
 * Never includes contact-person names, phones, or emails.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import * as XLSX from "xlsx";
import {
  buildAliases,
  buildNormalizedKeys,
  normalizeInstitutionName,
} from "../lib/public-sector/normalizeInstitutionName";
import type {
  PublicInstitutionIndex,
  PublicInstitutionIndexItem,
} from "../lib/public-sector/types";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "data", "source", "public-institutions.xlsx");
const OUTPUT = join(ROOT, "data", "public-institutions.json");

const ALLOWED_COLUMNS = new Set([
  "NO",
  "대분류(기관유형)",
  "중분류(부처/지역)",
  "세분류(검색기준)",
  "기관명(부속기관)",
  "시군구",
]);

const FORBIDDEN_COLUMN_PATTERN =
  /담당|전화|휴대폰|핸드폰|메일|email|연락|성명|이름|모바일|fax|팩스/i;

function cell(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value == null) return "";
  return String(value).trim();
}

function assertNoPiiColumns(headers: string[]) {
  for (const header of headers) {
    if (FORBIDDEN_COLUMN_PATTERN.test(header)) {
      throw new Error(
        `거부: 개인정보/담당자 컬럼이 감지되었습니다 → "${header}". 공개 JSON에 포함할 수 없습니다.`,
      );
    }
    if (!ALLOWED_COLUMNS.has(header) && header.trim() !== "") {
      console.warn(`경고: 허용 목록 외 컬럼 무시 → "${header}"`);
    }
  }
}

function buildItem(row: Record<string, unknown>): PublicInstitutionIndexItem | null {
  const id = cell(row, "NO") || "";
  const majorType = cell(row, "대분류(기관유형)");
  const middleType = cell(row, "중분류(부처/지역)");
  const searchName = cell(row, "세분류(검색기준)");
  const institutionName = cell(row, "기관명(부속기관)");
  const district = cell(row, "시군구");

  if (!searchName && !institutionName) return null;

  const aliases = buildAliases({
    searchName,
    institutionName,
    district,
    middleType,
  });
  const normalizedKeys = buildNormalizedKeys(aliases).filter(
    (key) => key.length >= 3,
  );

  if (normalizedKeys.length === 0) return null;

  return {
    id: id || normalizeInstitutionName(searchName || institutionName),
    majorType,
    middleType,
    searchName,
    institutionName: institutionName || undefined,
    district: district || undefined,
    aliases,
    normalizedKeys,
  };
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(
      `엑셀 원본이 없습니다: ${SOURCE}\n로컬에 data/source/public-institutions.xlsx 를 두고 다시 실행하세요.`,
    );
    process.exit(1);
  }

  const workbook = XLSX.readFile(SOURCE);
  const sheetName =
    workbook.SheetNames.find((name) => name === "기관리스트") ??
    workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("엑셀 시트를 찾을 수 없습니다.");
  }

  // Prefer the sheet without contact columns even if names look similar.
  if (workbook.SheetNames.includes("기관리스트+담당자")) {
    console.log(
      '안내: "기관리스트+담당자" 시트는 사용하지 않고 "기관리스트"만 변환합니다.',
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  if (rows.length === 0) {
    throw new Error("엑셀 행이 비어 있습니다.");
  }

  assertNoPiiColumns(Object.keys(rows[0]));

  const items: PublicInstitutionIndexItem[] = [];
  for (const row of rows) {
    const item = buildItem(row);
    if (item) items.push(item);
  }

  const index: PublicInstitutionIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceNote:
      "Sanitized public-institution names only. No contact persons, phones, or emails.",
    itemCount: items.length,
    items,
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(index)}\n`, "utf8");
  console.log(`Wrote ${items.length} institutions → ${OUTPUT}`);
}

main();
