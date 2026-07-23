import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

function collectTextNodes(value: unknown, out: string[]): void {
  if (value == null) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTextNodes(item, out);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      // HWPX 본문 텍스트 노드는 보통 hp:t / t
      if (/^(hp:)?t$/i.test(key) || key === "#text") {
        collectTextNodes(child, out);
      } else {
        collectTextNodes(child, out);
      }
    }
  }
}

export async function extractHwpxSurvey(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractedSurveyDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    textNodeName: "#text",
  });

  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /contents\/section\d+\.xml$/i.test(name))
    .sort();

  const texts: string[] = [];
  const limitations: string[] = [];

  const targets =
    sectionFiles.length > 0
      ? sectionFiles
      : Object.keys(zip.files).filter((name) => /\.xml$/i.test(name));

  for (const path of targets) {
    const file = zip.file(path);
    if (!file || file.dir) continue;
    const xml = await file.async("text");
    try {
      const parsed = parser.parse(xml);
      collectTextNodes(parsed, texts);
    } catch {
      limitations.push(`${path} XML 파싱에 실패했습니다.`);
    }
  }

  const text = texts.join("\n").trim();
  if (!text) {
    limitations.push("HWPX에서 본문 텍스트를 충분히 추출하지 못했습니다.");
  } else if (sectionFiles.length === 0) {
    limitations.push("표준 section XML을 찾지 못해 추출 신뢰도가 낮을 수 있습니다.");
  }

  const doc = parseSurveyText(text, {
    fileName,
    fileExtension: "hwpx",
    mimeType,
    extractionLimitations: limitations,
    metadata: { textLength: text.length },
  });

  if (doc.extractionStatus === "success" && limitations.length > 0) {
    doc.extractionStatus = "partial";
  }

  return doc;
}
