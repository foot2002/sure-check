import mammoth from "mammoth";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

export async function extractDocxSurvey(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractedSurveyDocument> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim() ?? "";
  const limitations: string[] = [];
  if (result.messages?.length) {
    limitations.push("DOCX 일부 서식·표는 단순 텍스트로만 추출되었습니다.");
  }
  if (!text) {
    limitations.push("DOCX에서 텍스트를 추출하지 못했습니다.");
  }

  return parseSurveyText(text, {
    fileName,
    fileExtension: "docx",
    mimeType,
    extractionLimitations: limitations,
    metadata: { textLength: text.length },
  });
}
