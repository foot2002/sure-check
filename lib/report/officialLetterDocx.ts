import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOfficialLetterModel,
  sanitizeOfficialLetterTitle,
  type OfficialLetterModel,
} from "@/lib/report/officialLetterModel";

export const OFFICIAL_LETTER_TEMPLATE_REL =
  "lib/report/templates/sure-check-official-letter.docx";

type BodyPart = { kind: "p" | "tbl" | "sectPr"; xml: string };

function isOpen(xml: string, i: number, name: string): boolean {
  if (!xml.startsWith(`<w:${name}`, i)) return false;
  const c = xml[i + 3 + name.length];
  return c === ">" || c === " " || c === "/";
}

function extractAll(xml: string, name: string): string[] {
  const close = `</w:${name}>`;
  const out: string[] = [];
  let i = 0;
  while (i < xml.length) {
    if (!isOpen(xml, i, name)) {
      i += 1;
      continue;
    }
    const start = i;
    let depth = 0;
    let j = i;
    while (j < xml.length) {
      if (isOpen(xml, j, name)) {
        depth += 1;
        j += 3 + name.length;
        continue;
      }
      if (xml.startsWith(close, j)) {
        depth -= 1;
        j += close.length;
        if (depth === 0) {
          out.push(xml.slice(start, j));
          i = j;
          break;
        }
        continue;
      }
      j += 1;
    }
    if (i === start) break;
  }
  return out;
}

function xmlEscape(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\u0000/g, "");
}

function texts(s: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (!isOpen(s, i, "t")) {
      i += 1;
      continue;
    }
    const gt = s.indexOf(">", i);
    const close = s.indexOf("</w:t>", gt);
    if (gt < 0 || close < 0) break;
    parts.push(
      s
        .slice(gt + 1, close)
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"'),
    );
    i = close + 6;
  }
  return parts.join("");
}

function firstMatch(xml: string, re: RegExp): string {
  return xml.match(re)?.[0] || "";
}

function replaceParagraphText(pXml: string, text: string): string {
  const pPr = firstMatch(pXml, /<w:pPr>[\s\S]*?<\/w:pPr>/);
  const rPr = firstMatch(pXml, /<w:rPr>[\s\S]*?<\/w:rPr>/);
  const value = text.length > 0 ? xmlEscape(text) : " ";
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${value}</w:t></w:r></w:p>`;
}

function replaceNumberedParagraph(
  template: string,
  n: number,
  text: string,
): string {
  const pPr = firstMatch(template, /<w:pPr>[\s\S]*?<\/w:pPr>/);
  const runs = extractAll(template, "r");
  const rPr0 = firstMatch(runs[0] || "", /<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr1 = firstMatch(runs[1] || runs[0] || "", /<w:rPr>[\s\S]*?<\/w:rPr>/);
  return `<w:p>${pPr}<w:r>${rPr0}<w:t xml:space="preserve">${n}. </w:t></w:r><w:r>${rPr1}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function setCellText(tcXml: string, text: string): string {
  const tcPr = firstMatch(tcXml, /<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const paras = extractAll(tcXml, "p");
  const template = paras[0] || "<w:p></w:p>";
  const lines = String(text || "").split(/\r?\n/);
  const filled =
    lines.length > 0
      ? lines.map((line) => replaceParagraphText(template, line)).join("")
      : replaceParagraphText(template, " ");
  return `<w:tc>${tcPr}${filled}</w:tc>`;
}

function setCellParagraphs(tcXml: string, lines: string[]): string {
  const tcPr = firstMatch(tcXml, /<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const paras = extractAll(tcXml, "p");
  const filled = paras.map((p, i) => {
    if (i < lines.length) return replaceParagraphText(p, lines[i] || " ");
    return p;
  });
  return `<w:tc>${tcPr}${filled.join("")}</w:tc>`;
}

function fillRow(trXml: string, values: string[], fromCell = 0): string {
  const trPr = firstMatch(trXml, /<w:trPr>[\s\S]*?<\/w:trPr>/);
  const cells = extractAll(trXml, "tc").map((tc, i) =>
    i >= fromCell ? setCellText(tc, values[i] ?? "") : tc,
  );
  return `<w:tr>${trPr}${cells.join("")}</w:tr>`;
}

function tableShell(tblXml: string): { tblPr: string; tblGrid: string } {
  return {
    tblPr: firstMatch(tblXml, /<w:tblPr>[\s\S]*?<\/w:tblPr>/),
    tblGrid: firstMatch(tblXml, /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/),
  };
}

function setValueColumn(tblXml: string, values: string[], col = 1): string {
  const { tblPr, tblGrid } = tableShell(tblXml);
  const rows = extractAll(tblXml, "tr").map((tr, ri) => {
    if (ri === 0) return tr;
    const cells = extractAll(tr, "tc");
    if (!cells[col]) return tr;
    const next = cells.map((tc, ci) =>
      ci === col ? setCellText(tc, values[ri - 1] ?? "") : tc,
    );
    const trPr = firstMatch(tr, /<w:trPr>[\s\S]*?<\/w:trPr>/);
    return `<w:tr>${trPr}${next.join("")}</w:tr>`;
  });
  return `<w:tbl>${tblPr}${tblGrid}${rows.join("")}</w:tbl>`;
}

function setDataRows(
  tblXml: string,
  dataRows: string[][],
): string {
  const { tblPr, tblGrid } = tableShell(tblXml);
  const rows = extractAll(tblXml, "tr");
  const header = rows[0];
  const template = rows[1] || rows[0];
  const filled = dataRows.map((values) => fillRow(template, values, 0));
  return `<w:tbl>${tblPr}${tblGrid}${header}${filled.join("")}</w:tbl>`;
}

function parseBody(bodyInner: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let i = 0;
  while (i < bodyInner.length) {
    if (isOpen(bodyInner, i, "tbl")) {
      const slice = extractAll(bodyInner.slice(i), "tbl")[0];
      if (!slice) break;
      parts.push({ kind: "tbl", xml: slice });
      i += slice.length;
      continue;
    }
    if (isOpen(bodyInner, i, "p")) {
      const slice = extractAll(bodyInner.slice(i), "p")[0];
      if (!slice) break;
      parts.push({ kind: "p", xml: slice });
      i += slice.length;
      continue;
    }
    if (bodyInner.startsWith("<w:sectPr", i)) {
      const end = bodyInner.indexOf("</w:sectPr>", i);
      if (end < 0) break;
      parts.push({
        kind: "sectPr",
        xml: bodyInner.slice(i, end + "</w:sectPr>".length),
      });
      i = end + "</w:sectPr>".length;
      continue;
    }
    i += 1;
  }
  return parts;
}

function numberedRange(
  parts: BodyPart[],
  startPred: (text: string) => boolean,
  stopPred: (text: string) => boolean,
  requireMarker?: (text: string) => boolean,
): { start: number; end: number; template: string } | null {
  let armed = false;
  let markerOk = !requireMarker;
  let start = -1;
  let end = -1;
  let template = "";
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.kind !== "p") continue;
    const text = texts(part.xml).replace(/\s+/g, " ").trim();
    if (startPred(text)) {
      armed = true;
      continue;
    }
    if (!armed) continue;
    if (requireMarker && requireMarker(text)) {
      markerOk = true;
      continue;
    }
    if (stopPred(text)) break;
    if (!markerOk) continue;
    if (/^\d+\.\s/.test(text)) {
      if (start < 0) {
        start = i;
        template = part.xml;
      }
      end = i;
    } else if (start >= 0 && text) {
      break;
    }
  }
  if (start < 0 || !template) return null;
  return { start, end, template };
}

function replaceNumbered(
  parts: BodyPart[],
  range: { start: number; end: number; template: string },
  items: string[],
): BodyPart[] {
  const next = items.map((text, i) => ({
    kind: "p" as const,
    xml: replaceNumberedParagraph(range.template, i + 1, text),
  }));
  return [
    ...parts.slice(0, range.start),
    ...next,
    ...parts.slice(range.end + 1),
  ];
}

function fillCoverTable(tblXml: string, model: OfficialLetterModel): string {
  const { tblPr, tblGrid } = tableShell(tblXml);
  const rows = extractAll(tblXml, "tr");
  const tr = rows[0];
  if (!tr) return tblXml;
  const trPr = firstMatch(tr, /<w:trPr>[\s\S]*?<\/w:trPr>/);
  const tc = extractAll(tr, "tc")[0];
  if (!tc) return tblXml;
  const paras = extractAll(tc, "p");
  const lines = paras.map((p) => texts(p));
  const mapped = lines.map((line) => {
    if (line.includes("대상기관")) return `대상기관 : ${model.operatorName}`;
    if (line.includes("진단일자")) return `진단일자 : ${model.diagnosedAtKo}`;
    if (line.includes("문서번호")) return `문서번호 : ${model.docNumber}`;
    if (line.includes("위험도")) return `위험도 등급 : ${model.riskCover}`;
    return model.surveyTitle;
  });
  const filledTc = setCellParagraphs(tc, mapped);
  return `<w:tbl>${tblPr}${tblGrid}<w:tr>${trPr}${filledTc}</w:tr></w:tbl>`;
}

function fillCautionTable(tblXml: string, model: OfficialLetterModel): string {
  const { tblPr, tblGrid } = tableShell(tblXml);
  const rows = extractAll(tblXml, "tr");
  const tr = rows[0];
  if (!tr) return tblXml;
  const trPr = firstMatch(tr, /<w:trPr>[\s\S]*?<\/w:trPr>/);
  const tc = extractAll(tr, "tc")[0];
  if (!tc) return tblXml;
  const paras = extractAll(tc, "p");
  const mapped = paras.map((p, i) => {
    const line = texts(p);
    if (i === 0 && line.includes("유의사항")) return line.trim() || "☞ 유의사항";
    return model.cautionBody;
  });
  const filledTc = setCellParagraphs(tc, mapped);
  return `<w:tbl>${tblPr}${tblGrid}<w:tr>${trPr}${filledTc}</w:tr></w:tbl>`;
}

function fillNoticeTable(tblXml: string, model: OfficialLetterModel): string {
  const { tblPr, tblGrid } = tableShell(tblXml);
  const rows = extractAll(tblXml, "tr").map((tr, ri) => {
    if (ri === 0) return tr;
    const values = model.noticeRows[ri - 1] || ["", "", ""];
    const trPr = firstMatch(tr, /<w:trPr>[\s\S]*?<\/w:trPr>/);
    const cells = extractAll(tr, "tc").map((tc, ci) =>
      ci === 0 ? tc : setCellText(tc, values[ci] || ""),
    );
    return `<w:tr>${trPr}${cells.join("")}</w:tr>`;
  });
  return `<w:tbl>${tblPr}${tblGrid}${rows.join("")}</w:tbl>`;
}

function fillTable(index: number, tblXml: string, model: OfficialLetterModel): string {
  switch (index) {
    case 0:
      return fillCoverTable(tblXml, model);
    case 1:
      return tblXml;
    case 2:
      return setValueColumn(tblXml, [
        model.surveyTitle,
        model.operatorOverview,
        model.surveyUrl,
        model.toolName,
        model.diagnosisMethod,
        model.diagnosedAtKo,
        model.riskOverview,
      ]);
    case 3:
      return setValueColumn(tblXml, [
        model.personalItems,
        model.sensitiveItems,
        model.highRiskItems,
      ]);
    case 4:
      return fillCautionTable(tblXml, model);
    case 5:
      return fillNoticeTable(tblXml, model);
    case 6:
      return setDataRows(tblXml, model.questionRows);
    case 7:
      return setDataRows(tblXml, model.legalRows);
    case 8:
      return setValueColumn(tblXml, [model.evidenceCapture, model.evidenceKeep]);
    case 9:
      return setValueColumn(tblXml, [model.priorityLabel]);
    default:
      return tblXml;
  }
}

function fillDocumentXml(docXml: string, model: OfficialLetterModel): string {
  const match = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!match) throw new Error("letter template missing w:body");
  let parts = parseBody(match[1]);
  let tableI = 0;
  parts = parts.map((part) => {
    if (part.kind !== "tbl") return part;
    const xml = fillTable(tableI, part.xml, model);
    tableI += 1;
    return { ...part, xml };
  });

  parts = parts.map((part) => {
    if (part.kind !== "p") return part;
    const text = texts(part.xml).trim();
    if (/^\d{4}년\s+\d{1,2}월\s+\d{1,2}일$/.test(text)) {
      return { ...part, xml: replaceParagraphText(part.xml, model.diagnosedAtKo) };
    }
    if (text.includes("자동진단 도구(SURE-CHECK) 및 수기 검토를 통해")) {
      return {
        ...part,
        xml: replaceParagraphText(
          part.xml,
          text.replace(
            "자동진단 도구(SURE-CHECK) 및 수기 검토를 통해",
            "자동진단 도구(SURE-CHECK)를 통해",
          ),
        ),
      };
    }
    return part;
  });

  const whyIntroAt = parts.findIndex((part) => {
    if (part.kind !== "p") return false;
    const text = texts(part.xml);
    return text.includes("이 설문은") && text.includes("운영하는 것으로");
  });
  if (whyIntroAt >= 0) {
    parts[whyIntroAt] = {
      kind: "p",
      xml: replaceParagraphText(parts[whyIntroAt].xml, model.whyIntro),
    };
  }

  const whyRange = numberedRange(
    parts,
    (text) => text.startsWith("Ⅱ.") || text.startsWith("II."),
    (text) => text.startsWith("Ⅲ.") || text.startsWith("III."),
  );
  if (whyRange) parts = replaceNumbered(parts, whyRange, model.whyItems);

  const recRange = numberedRange(
    parts,
    (text) => text.startsWith("Ⅶ.") || text.startsWith("VII."),
    (text) => text.includes("본 보고서의 법적") || text.startsWith("1. 이 보고서는"),
    (text) => text.includes("세부 권고"),
  );
  if (recRange) parts = replaceNumbered(parts, recRange, model.recItems);

  return docXml.replace(
    /<w:body>[\s\S]*<\/w:body>/,
    `<w:body>${parts.map((part) => part.xml).join("")}</w:body>`,
  );
}

export function officialLetterTemplatePath(): string {
  const fromCwd = join(process.cwd(), OFFICIAL_LETTER_TEMPLATE_REL);
  if (existsSync(fromCwd)) return fromCwd;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const fromModule = join(here, "templates", "sure-check-official-letter.docx");
    if (existsSync(fromModule)) return fromModule;
  } catch {
    /* bundled runtime may not expose import.meta.url */
  }
  throw new Error("official letter template is missing");
}

export function officialLetterDownloadFilename(
  title: string,
  caseId: string,
): string {
  const safe = sanitizeOfficialLetterTitle(title);
  return `[SURE-CHECK] ${safe || "제목없음"} 실태조사 분석 보고서.docx`;
}

export function officialLetterAsciiFilename(caseId: string): string {
  return `sure-check-official-letter-${caseId}.docx`;
}

export function officialLetterContentDisposition(
  title: string,
  caseId: string,
): string {
  const utf8 = officialLetterDownloadFilename(title, caseId);
  const ascii = officialLetterAsciiFilename(caseId);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}

export async function buildOfficialLetterDocx(
  detail: AdminCaseDetail,
): Promise<Uint8Array> {
  const model = buildOfficialLetterModel(detail);
  const zip = await JSZip.loadAsync(readFileSync(officialLetterTemplatePath()));
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("letter template missing document.xml");
  const docXml = await docFile.async("string");
  zip.file("word/document.xml", fillDocumentXml(docXml, model));
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}

export const officialLetterXmlTest = {
  isOpen,
  extractAll,
  fillDocumentXml,
  parseBody,
};
