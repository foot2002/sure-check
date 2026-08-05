import JSZip from "jszip";
import { parseSurveyText } from "@/lib/file-extractors/surveyTextParser";
import type { ExtractedSurveyDocument } from "@/lib/file-extractors/fileExtractorTypes";

const STRUCT_TAG_RE =
  /<\/?(?:hp:)?(?:tbl|tr|tc|p|t)(?:\s[^>]*)?>|[^<]+/gi;

const NOISE_LINE_RE =
  /^(?:UTF-?8|yes|no|BOTH|SHOW_ALL|WIDELY|LEFT_ONLY|DIGIT|SOLID|CONTINUOUS|EACH_COLUMN|END_OF_DOCUMENT|PAPER|EVEN|ODD|HORIZONTAL|VERTICAL|BREAK|BOTTOM|TOP|LEFT|RIGHT|CENTER|NEWSPAPER|PAGE|PARA|COLUMN|ABSOLUTE|REAL_PIC|PICTURE|TABLE|TOP_AND_BOTTOM|BOTH_SIDES|NONE|CELL|HWPUNIT|image\d+|그림입니다\.?)$/i;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#([0-9]+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    );
}

function collapse(text: string): string {
  return decodeXmlEntities(text).replace(/\s+/g, " ").trim();
}

function isNoiseLine(line: string): boolean {
  if (!line) return true;
  if (NOISE_LINE_RE.test(line)) return true;
  if (/원본\s*그림의\s*이름\s*:/i.test(line)) return true;
  if (/원본\s*그림의\s*크기\s*:/i.test(line)) return true;
  if (/^\d+(?:\.\d+)?\s*mm$/i.test(line)) return true;
  if (/^#?[0-9A-Fa-f]{6}$/.test(line)) return true;
  if (/^\d+(?:\.\d+)?$/.test(line) && line.length <= 12) return true;
  if (/^[A-Z_]{3,}$/.test(line)) return true;
  return false;
}

function tagName(token: string): string | null {
  const match = token.match(/^<\/?(?:hp:)?([a-z]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function isClose(token: string): boolean {
  return /^<\//.test(token);
}

function isTag(token: string): boolean {
  return /^</.test(token);
}

/**
 * Walk HWPX section XML in document order, keeping only visible hp:t text and
 * preserving table row/cell boundaries for the survey parser.
 */
export function extractLinesFromHwpxXml(xml: string): string[] {
  const lines: string[] = [];
  const rowCells: string[] = [];
  let paragraphParts: string[] = [];
  let inText = false;
  let tableDepth = 0;
  let rowDepth = 0;
  let cellDepth = 0;
  let cellParts: string[] = [];

  const flushParagraph = () => {
    const text = collapse(paragraphParts.join(" "));
    paragraphParts = [];
    if (text && !isNoiseLine(text)) lines.push(text);
  };

  const flushCell = () => {
    const text = collapse(cellParts.join(" "));
    cellParts = [];
    rowCells.push(text);
  };

  const flushRow = () => {
    const cells = rowCells.map((cell) => cell.trim()).filter(Boolean);
    rowCells.length = 0;
    if (cells.length === 0) return;
    // Single-cell option rows still matter (① 남자).
    lines.push(cells.join(" | "));
  };

  const tokens = xml.match(STRUCT_TAG_RE) ?? [];
  for (const rawToken of tokens) {
    const token = rawToken;
    if (!isTag(token)) {
      if (!inText) continue;
      const text = token;
      if (cellDepth > 0) cellParts.push(text);
      else if (tableDepth === 0) paragraphParts.push(text);
      continue;
    }

    const name = tagName(token);
    if (!name) continue;
    const closing = isClose(token);

    if (name === "t") {
      inText = !closing;
      continue;
    }

    if (name === "tbl") {
      if (!closing) {
        if (tableDepth === 0) flushParagraph();
        tableDepth += 1;
      } else {
        tableDepth = Math.max(0, tableDepth - 1);
      }
      continue;
    }

    if (name === "tr") {
      if (!closing) {
        rowDepth += 1;
      } else {
        flushRow();
        rowDepth = Math.max(0, rowDepth - 1);
      }
      continue;
    }

    if (name === "tc") {
      if (!closing) {
        cellDepth += 1;
        cellParts = [];
      } else if (cellDepth > 0) {
        flushCell();
        cellDepth -= 1;
      }
      continue;
    }

    if (name === "p") {
      if (closing && tableDepth === 0) flushParagraph();
    }
  }

  flushParagraph();
  return lines;
}

export async function extractHwpxSurvey(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractedSurveyDocument> {
  const zip = await JSZip.loadAsync(buffer);
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const limitations: string[] = [];
  const allLines: string[] = [];

  const targets =
    sectionFiles.length > 0
      ? sectionFiles
      : Object.keys(zip.files).filter((name) => /\.xml$/i.test(name));

  for (const path of targets) {
    const file = zip.file(path);
    if (!file || file.dir) continue;
    try {
      const xml = await file.async("text");
      allLines.push(...extractLinesFromHwpxXml(xml));
    } catch {
      limitations.push(`${path} XML 파싱에 실패했습니다.`);
    }
  }

  // Deduplicate consecutive identical noise-like repeats while keeping survey repeats.
  const lines: string[] = [];
  for (const line of allLines) {
    if (isNoiseLine(line)) continue;
    if (lines.length > 0 && lines[lines.length - 1] === line && line.length < 20) {
      continue;
    }
    lines.push(line);
  }

  const text = lines.join("\n").trim();
  if (!text) {
    limitations.push("HWPX에서 본문 텍스트를 충분히 추출하지 못했습니다.");
  } else if (sectionFiles.length === 0) {
    limitations.push(
      "표준 section XML을 찾지 못해 추출 신뢰도가 낮을 수 있습니다.",
    );
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
