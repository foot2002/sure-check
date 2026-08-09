/**
 * Form-wide context layer: normalize extracted form text into ordered blocks
 * so notice/org/contact detection is not limited to a narrow question window.
 */

import type { NormalizedForm } from "@/lib/types/scan";

export type FormContextBlockType =
  | "title"
  | "intro"
  | "description"
  | "section"
  | "notice"
  | "consent"
  | "contact"
  | "question"
  | "auxiliary"
  | "footer"
  | "other";

export type FormContextBlock = {
  id: string;
  type: FormContextBlockType;
  text: string;
  order: number;
  pageIndex: number | null;
  source: "structured" | "metadata" | "question" | "inferred";
  confidence: "high" | "medium" | "low";
};

export type FormContextEvidence = {
  value: string;
  evidence: string;
  blockId: string | null;
  confidence: "high" | "medium" | "low";
};

export type SurveyFormContext = {
  title: string | null;
  blocks: FormContextBlock[];
  organizationCandidates: FormContextEvidence[];
  contactCandidates: FormContextEvidence[];
  privacyNoticeBlocks: FormContextBlock[];
  contactBlocks: FormContextBlock[];
  fullText: string;
};

const ORG_NEAR =
  /(?:주최|주관|운영|조사|실시|의뢰|발주|담당)\s*[:：]?\s*([가-힣A-Za-z0-9()（）·\s]{2,40}(?:공사|공단|재단|진흥원|센터|기관|청|시청|구청|군청|도청|대학교|대학|병원|주식회사|㈜|\(주\)))/;

const ORG_NAME =
  /([가-힣A-Za-z0-9()（）·]{2,30}(?:특별시|광역시|특별자치시|특별자치도|시|군|구)?\s*(?:시청|구청|군청|도청|교육청|공사|공단|진흥원|재단|센터|연구원|위원회))/;

const CONTACT_RE =
  /(?:문의|연락처|담당|전화|Tel|TEL|E-?mail|이메일|휴대폰)?\s*[:：]?\s*(?:0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

const NOTICE_HINT =
  /개인정보|수집\s*목적|보유\s*기간|파기|동의|거부|제3자|위탁|국외|처리방침|이용\s*목적|수집\s*항목/;

const CONTACT_HINT = /문의|연락처|담당|전화|이메일|email|tel/i;

const FOOTER_HINT = /copyright|©|모든\s*권리|개인정보\s*처리방침|이용약관/i;

function pushBlock(
  blocks: FormContextBlock[],
  input: Omit<FormContextBlock, "id" | "order"> & { order?: number },
): void {
  const text = (input.text || "").replace(/\s+/g, " ").trim();
  if (text.length < 2) return;
  const order = input.order ?? blocks.length;
  blocks.push({
    id: `b${blocks.length + 1}`,
    type: input.type,
    text: text.slice(0, 2000),
    order,
    pageIndex: input.pageIndex,
    source: input.source,
    confidence: input.confidence,
  });
}

function classifyLooseText(text: string): FormContextBlockType {
  if (NOTICE_HINT.test(text) && text.length >= 12) return "notice";
  if (CONTACT_HINT.test(text)) return "contact";
  if (FOOTER_HINT.test(text)) return "footer";
  return "other";
}

export function buildSurveyFormContext(form: NormalizedForm): SurveyFormContext {
  const blocks: FormContextBlock[] = [];

  pushBlock(blocks, {
    type: "title",
    text: form.title || "",
    pageIndex: 0,
    source: "structured",
    confidence: "high",
  });

  const n = form.notices;
  if (n) {
    const structured: Array<[FormContextBlockType, string | undefined]> = [
      ["description", n.description],
      ["notice", n.purpose],
      ["notice", n.items],
      ["notice", n.retention],
      ["notice", n.destruction],
      ["notice", n.refusalRight],
      ["notice", n.refusalDisadvantage],
      ["notice", n.privacyNotice],
      ["consent", n.consentText],
      ["notice", n.trustee],
      ["notice", n.overseasTransfer],
      ["notice", n.processor],
      ["contact", n.contactDepartment],
    ];
    for (const [type, text] of structured) {
      pushBlock(blocks, {
        type,
        text: text || "",
        pageIndex: null,
        source: "structured",
        confidence: "high",
      });
    }
  }

  for (const raw of form.metadata?.noticeTexts || []) {
    pushBlock(blocks, {
      type: classifyLooseText(raw),
      text: raw,
      pageIndex: null,
      source: "metadata",
      confidence: "medium",
    });
  }

  form.questions.forEach((q, index) => {
    const pageIndex =
      typeof q.pageIndex === "number"
        ? q.pageIndex
        : typeof (q as { page?: number }).page === "number"
          ? (q as { page?: number }).page!
          : null;
    const isConsent =
      q.type === "privacy_consent" ||
      q.riskTags?.includes("privacy_consent") ||
      NOTICE_HINT.test(q.label || "");

    pushBlock(blocks, {
      type: isConsent ? "consent" : "question",
      text: [q.questionText || q.label, q.required ? "(필수)" : ""]
        .filter(Boolean)
        .join(" "),
      pageIndex,
      source: "question",
      confidence: "high",
      order: 1000 + index * 10,
    });

    if (q.auxiliaryText) {
      pushBlock(blocks, {
        type: classifyLooseText(q.auxiliaryText),
        text: q.auxiliaryText,
        pageIndex,
        source: "question",
        confidence: "medium",
        order: 1000 + index * 10 + 1,
      });
    }

    // Options sometimes carry privacy/contact copy on long forms.
    for (const opt of q.options || []) {
      const ot = typeof opt === "string" ? opt : String(opt);
      if (ot.length >= 20 && (NOTICE_HINT.test(ot) || CONTACT_HINT.test(ot))) {
        pushBlock(blocks, {
          type: classifyLooseText(ot),
          text: ot,
          pageIndex,
          source: "question",
          confidence: "low",
          order: 1000 + index * 10 + 2,
        });
      }
    }
  });

  blocks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const fullText = blocks.map((b) => b.text).join("\n");
  const organizationCandidates: FormContextEvidence[] = [];
  const contactCandidates: FormContextEvidence[] = [];

  for (const block of blocks) {
    const near = block.text.match(ORG_NEAR);
    if (near?.[1]) {
      organizationCandidates.push({
        value: near[1].replace(/\s+/g, " ").trim(),
        evidence: block.text.slice(0, 240),
        blockId: block.id,
        confidence: block.confidence === "high" ? "high" : "medium",
      });
    } else {
      const name = block.text.match(ORG_NAME);
      if (name?.[1] && /주최|주관|운영|조사|실시|기관|공사|시청|구청/.test(block.text)) {
        organizationCandidates.push({
          value: name[1].replace(/\s+/g, " ").trim(),
          evidence: block.text.slice(0, 240),
          blockId: block.id,
          confidence: "medium",
        });
      }
    }

    const contacts = block.text.match(CONTACT_RE) || [];
    for (const c of contacts) {
      contactCandidates.push({
        value: c.replace(/\s+/g, " ").trim(),
        evidence: block.text.slice(0, 240),
        blockId: block.id,
        confidence: CONTACT_HINT.test(block.text) ? "high" : "medium",
      });
    }
  }

  const dedupe = <T extends { value: string }>(rows: T[]): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const key = row.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  };

  return {
    title: form.title || null,
    blocks,
    organizationCandidates: dedupe(organizationCandidates).slice(0, 8),
    contactCandidates: dedupe(contactCandidates).slice(0, 8),
    privacyNoticeBlocks: blocks.filter(
      (b) => b.type === "notice" || b.type === "consent",
    ),
    contactBlocks: blocks.filter((b) => b.type === "contact"),
    fullText,
  };
}

/** Corpus for notice compliance — form-wide, not question-local. */
export function formWideNoticeCorpus(form: NormalizedForm): string {
  const ctx = buildSurveyFormContext(form);
  return ctx.fullText;
}
