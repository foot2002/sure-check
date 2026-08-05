import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Preserve paragraph / table structure. Table rows become one pipe-joined line
 * so matrix Likert items stay grouped for the survey parser.
 */
export function htmlToSurveyText(html: string): string {
  const $ = cheerio.load(html);
  $("br").replaceWith("\n");

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td, th")
      .toArray()
      .map((cell) => collapseCellText($(cell).text()));
    const line = cells.filter((cell) => cell.length > 0).join(" | ");
    $(tr).replaceWith(line ? `${line}\n` : "\n");
  });

  $("p, li, h1, h2, h3, h4, h5, h6, table").each((_, el) => {
    $(el).append("\n");
  });

  return decodeEntities($.root().text());
}

function collapseCellText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function extractDocxSurvey(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractedSurveyDocument> {
  const limitations: string[] = [];
  let text = "";

  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    text = htmlToSurveyText(htmlResult.value ?? "").trim();
    if (htmlResult.messages?.length) {
      limitations.push("DOCX 일부 서식은 단순 텍스트로 변환되었습니다.");
    }
  } catch {
    limitations.push("DOCX HTML 변환에 실패해 원시 텍스트로 대체했습니다.");
  }

  if (!text) {
    const raw = await mammoth.extractRawText({ buffer });
    text = raw.value?.trim() ?? "";
    if (raw.messages?.length) {
      limitations.push("DOCX 일부 서식·표는 단순 텍스트로만 추출되었습니다.");
    }
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
