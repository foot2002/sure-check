import * as XLSX from "xlsx";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

/** Export/result spreadsheet markers — uncommon on blank survey templates. */
const STRONG_RESPONSE_HEADER_PATTERN =
  /제출일시|제출\s*시간|timestamp|응답\s*id|response\s*id|응답\s*번호|응답일시|시작\s*시간|완료\s*시간|응답\s*시작|응답\s*완료/i;

/** PII column labels that also appear as survey question prompts. */
const WEAK_PII_HEADER_PATTERN =
  /이름|성명|연락처|휴대폰|휴대전화|전화|이메일|email|응답자/i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /01[016789]-?\d{3,4}-?\d{4}/;

const QUESTION_LINE_PATTERN =
  /^(?:Q\s*)?\d+\s*[.)．、]|문항\s*\d+|질문\s*\d+|문\s*\d+|\[\s*문항\s*\d+\s*\]/i;

const OPTION_LINE_PATTERN =
  /^[①②③④⑤⑥⑦⑧⑨⑩]|^[가나다라마바사아자차카타파하]\s*[.)．]|^(매우\s*만족|만족|보통|불만족|매우\s*불만족)\b|선택하세요|해당.*(?:모두\s*)?체크|복수\s*응답/i;

export class ResponseDataSuspectedError extends Error {
  readonly code = "RESPONSE_DATA_SUSPECTED" as const;
  constructor(message: string) {
    super(message);
    this.name = "ResponseDataSuspectedError";
  }
}

function sheetToLines(sheet: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      blankrows: false,
    },
  );

  return rows
    .map((row) =>
      row
        .map((cell) => String(cell ?? "").trim())
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean);
}

function looksLikeSurveyForm(lines: string[]): boolean {
  let questionHits = 0;
  let optionHits = 0;
  const head = lines.slice(0, 30).join(" ");
  const titleHint = /설문|수요조사|조사표|조사지|문항|체크리스트|만족도/.test(
    head,
  );

  for (const line of lines.slice(0, 250)) {
    if (QUESTION_LINE_PATTERN.test(line)) questionHits += 1;
    if (OPTION_LINE_PATTERN.test(line)) optionHits += 1;
  }

  if (questionHits >= 3) return true;
  if (questionHits >= 1 && optionHits >= 2) return true;
  if (titleHint && (questionHits >= 1 || optionHits >= 3)) return true;
  return false;
}

/**
 * Detect Google Forms / Naver / Moaform response exports with respondent PII.
 * Must not flag long survey templates solely because of row count.
 */
export function looksLikeResponseData(
  lines: string[],
  rowCount: number,
): boolean {
  if (looksLikeSurveyForm(lines)) return false;

  const header = lines.slice(0, 8).join(" ");
  const strongHeaders = STRONG_RESPONSE_HEADER_PATTERN.test(header);
  const weakHeaders = WEAK_PII_HEADER_PATTERN.test(header);

  let emailHits = 0;
  let phoneHits = 0;
  for (const line of lines.slice(0, 80)) {
    if (EMAIL_PATTERN.test(line)) emailHits += 1;
    if (PHONE_PATTERN.test(line)) phoneHits += 1;
  }
  const manyPii = emailHits >= 3 || phoneHits >= 3;

  // Classic response export: submit/timestamp columns + many rows or PII values.
  if (strongHeaders && (manyPii || rowCount >= 15)) return true;
  // PII-looking headers alone are common on forms; require many actual values.
  if (weakHeaders && manyPii && rowCount >= 10) return true;
  return false;
}

export function extractXlsxSurvey(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): ExtractedSurveyDocument {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetNames = workbook.SheetNames;
  const allLines: string[] = [];
  let totalRows = 0;

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const lines = sheetToLines(sheet);
    totalRows += lines.length;
    allLines.push(`[시트: ${name}]`);
    allLines.push(...lines);
  }

  if (looksLikeResponseData(allLines, totalRows)) {
    throw new ResponseDataSuspectedError(
      "이 파일은 설문지 양식이 아니라 응답 결과 데이터일 수 있습니다. 응답자 개인정보가 포함된 파일은 업로드하지 마세요.",
    );
  }

  const text = allLines.join("\n");
  return parseSurveyText(text, {
    fileName,
    fileExtension: "xlsx",
    mimeType,
    extractionLimitations:
      totalRows === 0 ? ["XLSX에서 읽을 수 있는 셀 값이 없습니다."] : [],
    metadata: {
      sheetNames,
      textLength: text.length,
      suspectedResponseData: false,
    },
  });
}
