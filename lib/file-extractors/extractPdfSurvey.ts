import { PDFParse } from "pdf-parse";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

export class ScannedPdfError extends Error {
  readonly code = "SCANNED_PDF" as const;
  constructor(message: string) {
    super(message);
    this.name = "ScannedPdfError";
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? "").trim();
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function isLikelyScanned(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 300) return true;
  const hangul = (compact.match(/[가-힣]/g) ?? []).length;
  const hasQuestionPattern =
    /(?:Q\s*)?\d+\s*[.)．]|문항\s*\d+|질문\s*\d+|①|개인정보/.test(text);
  if (hangul < 40 && !hasQuestionPattern) return true;
  return false;
}

export async function extractPdfSurvey(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractedSurveyDocument> {
  const text = await extractPdfText(buffer);

  if (isLikelyScanned(text)) {
    throw new ScannedPdfError(
      "이 PDF는 이미지 또는 스캔본일 가능성이 있어 문항을 읽지 못했습니다. 텍스트 PDF 또는 DOCX/HWPX 파일로 업로드해 주세요.",
    );
  }

  return parseSurveyText(text, {
    fileName,
    fileExtension: "pdf",
    mimeType,
    extractionLimitations: [],
    metadata: {
      textLength: text.length,
      suspectedScannedPdf: false,
    },
  });
}
