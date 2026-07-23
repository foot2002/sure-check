import * as XLSX from "xlsx";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

const RESPONSE_HEADER_PATTERN =
  /이름|성명|연락처|휴대폰|휴대전화|전화|이메일|email|응답자|제출일시|제출\s*시간|timestamp|응답\s*id/i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /01[016789]-?\d{3,4}-?\d{4}/;

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

function looksLikeResponseData(lines: string[], rowCount: number): boolean {
  if (rowCount >= 40) return true;

  const header = lines.slice(0, 5).join(" ");
  const hasResponseHeaders = RESPONSE_HEADER_PATTERN.test(header);
  if (!hasResponseHeaders) return false;

  let emailHits = 0;
  let phoneHits = 0;
  for (const line of lines.slice(0, 80)) {
    if (EMAIL_PATTERN.test(line)) emailHits += 1;
    if (PHONE_PATTERN.test(line)) phoneHits += 1;
  }
  return emailHits >= 3 || phoneHits >= 3;
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
