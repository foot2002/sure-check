import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOfficialNoticeModel,
  officialNoticeAsciiFilename,
  officialNoticeDownloadFilename,
  type OfficialNoticeModel,
} from "@/lib/report/officialNoticeModel";

export const OFFICIAL_NOTICE_TEMPLATE_REL =
  "lib/report/templates/sure-check-official-notice.docx";

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

function cloneRun(templateRunXml: string, text: string): string {
  const rPr = firstMatch(templateRunXml, /<w:rPr>[\s\S]*?<\/w:rPr>/);
  const value = text.length > 0 ? xmlEscape(text) : " ";
  return `<w:r>${rPr}<w:t xml:space="preserve">${value}</w:t></w:r>`;
}

function rebuildParagraph(
  pXml: string,
  runSpecs: Array<{ fromRun: number; text: string }>,
): string {
  const pPr = firstMatch(pXml, /<w:pPr>[\s\S]*?<\/w:pPr>/);
  const runs = extractAll(pXml, "r");
  const built = runSpecs.map((spec) =>
    cloneRun(runs[spec.fromRun] || runs[0] || "<w:r></w:r>", spec.text),
  );
  return `<w:p>${pPr}${built.join("")}</w:p>`;
}

function replaceParagraphText(pXml: string, text: string): string {
  const runs = extractAll(pXml, "r");
  return rebuildParagraph(pXml, [{ fromRun: runs.length > 0 ? 0 : 0, text }]);
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

function fillViolationTable(tblXml: string, items: string[]): string {
  const tblPr = firstMatch(tblXml, /<w:tblPr>[\s\S]*?<\/w:tblPr>/);
  const tblGrid = firstMatch(tblXml, /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
  const tr = extractAll(tblXml, "tr")[0];
  if (!tr) return tblXml;
  const trPr = firstMatch(tr, /<w:trPr>[\s\S]*?<\/w:trPr>/);
  const tc = extractAll(tr, "tc")[0];
  if (!tc) return tblXml;
  const tcPr = firstMatch(tc, /<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const paras = extractAll(tc, "p");
  const header = paras[0];
  if (!header) return tblXml;
  const template = paras[1] || paras[0];
  const lastTemplate = paras[paras.length - 1] || template;
  const bullets = (items.length > 0 ? items : ["확인된 저촉 항목 없음"]).map(
    (item, i) => {
      const src = i === items.length - 1 || items.length === 0 ? lastTemplate : template;
      const runs = extractAll(src, "r");
      const bodyRun = runs.length > 1 ? 1 : 0;
      return rebuildParagraph(src, [
        { fromRun: 0, text: runs.length > 1 ? "◦  " : `◦  ${item}` },
        ...(runs.length > 1 ? [{ fromRun: bodyRun, text: item }] : []),
      ]);
    },
  );
  return `<w:tbl>${tblPr}${tblGrid}<w:tr>${trPr}<w:tc>${tcPr}${header}${bullets.join("")}</w:tc></w:tr></w:tbl>`;
}

function fillDocumentXml(docXml: string, model: OfficialNoticeModel): string {
  const match = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!match) throw new Error("notice template missing w:body");
  let parts = parseBody(match[1]);
  let sawLinkLabel = false;
  let tableI = 0;

  parts = parts.map((part) => {
    if (part.kind === "tbl") {
      const xml =
        tableI === 1 ? fillViolationTable(part.xml, model.violationItems) : part.xml;
      tableI += 1;
      return { ...part, xml };
    }
    if (part.kind !== "p") return part;
    const text = texts(part.xml).replace(/\s+/g, " ").trim();
    if (text.startsWith("수신")) {
      return {
        ...part,
        xml: rebuildParagraph(part.xml, [
          { fromRun: 0, text: "수신  " },
          { fromRun: 1, text: model.recipient },
        ]),
      };
    }
    if (text.includes("대상 조사명")) {
      return {
        ...part,
        xml: rebuildParagraph(part.xml, [
          { fromRun: 0, text: "◦  " },
          { fromRun: 1, text: `대상 조사명: ${model.surveyTitle}` },
        ]),
      };
    }
    if (text.includes("조사 웹 링크")) {
      sawLinkLabel = true;
      return part;
    }
    if (sawLinkLabel) {
      sawLinkLabel = false;
      return {
        ...part,
        xml: rebuildParagraph(part.xml, [
          { fromRun: 0, text: "     " },
          { fromRun: 1, text: model.surveyUrl },
        ]),
      };
    }
    if (text.includes("진단 일시")) {
      return {
        ...part,
        xml: rebuildParagraph(part.xml, [
          { fromRun: 0, text: "◦  " },
          { fromRun: 1, text: `진단 일시: ${model.diagnosedAtKo}` },
        ]),
      };
    }
    if (text.includes("위험도")) {
      return {
        ...part,
        xml: rebuildParagraph(part.xml, [
          { fromRun: 0, text: "◦  " },
          { fromRun: 1, text: "위험도: " },
          { fromRun: 3, text: model.riskLine },
        ]),
      };
    }
    if (text.includes("특히 위 4항")) {
      return { ...part, xml: replaceParagraphText(part.xml, model.focusRequest) };
    }
    if (text.includes("분석 보고서(")) {
      return {
        ...part,
        xml: replaceParagraphText(part.xml, model.attachmentReportLine),
      };
    }
    if (/SURE26-/.test(text) && text.includes("접수")) {
      return { ...part, xml: replaceParagraphText(part.xml, model.receiptLine) };
    }
    return part;
  });

  return docXml.replace(
    /<w:body>[\s\S]*<\/w:body>/,
    `<w:body>${parts.map((part) => part.xml).join("")}</w:body>`,
  );
}

export function officialNoticeTemplatePath(): string {
  const fromCwd = join(process.cwd(), OFFICIAL_NOTICE_TEMPLATE_REL);
  if (existsSync(fromCwd)) return fromCwd;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const fromModule = join(here, "templates", "sure-check-official-notice.docx");
    if (existsSync(fromModule)) return fromModule;
  } catch {
    /* bundled runtime may not expose import.meta.url */
  }
  throw new Error("official notice template is missing");
}

export function officialNoticeContentDisposition(
  title: string,
  caseId: string,
): string {
  const utf8 = officialNoticeDownloadFilename(title, caseId);
  const ascii = officialNoticeAsciiFilename(caseId);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}

export async function buildOfficialNoticeDocx(
  detail: AdminCaseDetail,
  now = new Date(),
): Promise<Uint8Array> {
  const model = buildOfficialNoticeModel(detail, now);
  const zip = await JSZip.loadAsync(readFileSync(officialNoticeTemplatePath()));
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("notice template missing document.xml");
  const docXml = await docFile.async("string");
  zip.file("word/document.xml", fillDocumentXml(docXml, model));
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}

export const officialNoticeXmlTest = {
  isOpen,
  extractAll,
  fillDocumentXml,
  parseBody,
  texts,
};
