/**
 * PASS-1 notice facts from form-wide context.
 * Conservative: does not invent new legal obligations — only detects language
 * already present in the extracted form corpus.
 */

import {
  buildSurveyFormContext,
  type SurveyFormContext,
} from "@/lib/analyzer/formContext";
import type { NormalizedForm } from "@/lib/types/scan";

export type NoticeCertainty =
  | "FOUND_CONFIRMED"
  | "FOUND_POSSIBLE"
  | "NOT_FOUND"
  | "NEEDS_REVIEW";

export type NoticeFactKey =
  | "collectionPurpose"
  | "collectionItems"
  | "retentionPeriod"
  | "consent"
  | "refusalRight"
  | "organization"
  | "privacyContact"
  | "thirdParty"
  | "outsourcing"
  | "overseasTransfer";

export type NoticeFact = {
  key: NoticeFactKey;
  certainty: NoticeCertainty;
  evidenceText: string | null;
  blockId: string | null;
  pageIndex: number | null;
  confidence: "high" | "medium" | "low";
  source: "structured" | "corpus" | "inferred";
};

const PATTERNS: Record<
  NoticeFactKey,
  { confirmed: RegExp; possible: RegExp }
> = {
  collectionPurpose: {
    confirmed:
      /(?:수집|이용|처리)\s*(?:및\s*이용\s*)?목적|이용\s*목적|조사\s*목적|처리\s*목적/,
    possible: /목적\s*[:：]|위해\s*수집|서비스\s*제공을\s*위해/,
  },
  collectionItems: {
    confirmed:
      /(?:수집|처리|개인정보)\s*항목|이름\s*\(?필수\)?|성명|이메일|연락처|휴대폰/,
    possible: /수집\s*(?:하는\s*)?(?:정보|개인정보)/,
  },
  retentionPeriod: {
    confirmed:
      /보유\s*(?:·|ㆍ)?\s*이용\s*기간|보유기간|보관\s*기간|이용기간|\d+\s*년|\d+\s*개월|목적\s*달성\s*(?:시|후)|해지\s*시\s*즉시/,
    possible: /보관|보유\s*[:：]|기간\s*[:：]/,
  },
  consent: {
    confirmed:
      /개인정보\s*(?:수집|이용|처리).*동의|동의\s*(?:여부|합니다)|동의하십니까/,
    possible: /동의/,
  },
  refusalRight: {
    confirmed:
      /동의\s*거부|거부\s*권리|거부할\s*권리|거부\s*시|동의하지\s*않을\s*(?:경우|수)|거절할\s*수/,
    possible: /거부|거절|미동의/,
  },
  organization: {
    confirmed:
      /(?:주최|주관|운영|조사|실시)\s*[:：]?|[가-힣]{2,}(?:시청|구청|공사|공단|재단|센터|대학교)/,
    possible: /기관|회사|단체/,
  },
  privacyContact: {
    confirmed:
      /(?:개인정보\s*)?(?:보호\s*)?책임자|개인정보\s*담당|문의\s*[:：]|담당\s*(?:부서|자)|0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/,
    possible: /문의|연락처|담당/,
  },
  thirdParty: {
    confirmed: /제3자\s*제공|제\s*3\s*자/,
    possible: /제3자|외부\s*제공/,
  },
  outsourcing: {
    confirmed: /처리\s*위탁|수탁자|위탁\s*업무|위탁/,
    possible: /위탁|수탁/,
  },
  overseasTransfer: {
    confirmed: /국외\s*이전|해외\s*(?:이전|보관)|이전\s*국가/,
    possible: /국외|해외\s*이전/,
  },
};

function findInBlocks(
  ctx: SurveyFormContext,
  confirmed: RegExp,
  possible: RegExp,
): Pick<
  NoticeFact,
  "certainty" | "evidenceText" | "blockId" | "pageIndex" | "confidence" | "source"
> {
  for (const block of ctx.blocks) {
    if (confirmed.test(block.text)) {
      return {
        certainty: "FOUND_CONFIRMED",
        evidenceText: block.text.slice(0, 280),
        blockId: block.id,
        pageIndex: block.pageIndex,
        confidence: block.confidence === "high" ? "high" : "medium",
        source: block.source === "structured" ? "structured" : "corpus",
      };
    }
  }
  for (const block of ctx.blocks) {
    if (possible.test(block.text) && block.text.length >= 10) {
      return {
        certainty: "FOUND_POSSIBLE",
        evidenceText: block.text.slice(0, 280),
        blockId: block.id,
        pageIndex: block.pageIndex,
        confidence: "low",
        source: "corpus",
      };
    }
  }
  if (confirmed.test(ctx.fullText)) {
    return {
      certainty: "FOUND_CONFIRMED",
      evidenceText: ctx.fullText.slice(0, 280),
      blockId: null,
      pageIndex: null,
      confidence: "medium",
      source: "corpus",
    };
  }
  if (possible.test(ctx.fullText)) {
    return {
      certainty: "NEEDS_REVIEW",
      evidenceText: null,
      blockId: null,
      pageIndex: null,
      confidence: "low",
      source: "inferred",
    };
  }
  return {
    certainty: "NOT_FOUND",
    evidenceText: null,
    blockId: null,
    pageIndex: null,
    confidence: "low",
    source: "inferred",
  };
}

export function buildNoticeFacts(form: NormalizedForm): NoticeFact[] {
  const ctx = buildSurveyFormContext(form);
  return (Object.keys(PATTERNS) as NoticeFactKey[]).map((key) => {
    const hit = findInBlocks(ctx, PATTERNS[key].confirmed, PATTERNS[key].possible);
    return { key, ...hit };
  });
}

export function noticeFactMap(form: NormalizedForm): Record<NoticeFactKey, NoticeFact> {
  const facts = buildNoticeFacts(form);
  return Object.fromEntries(facts.map((f) => [f.key, f])) as Record<
    NoticeFactKey,
    NoticeFact
  >;
}

/** Core privacy-notice obligation keys used for strong "고지 없음" claims. */
export const CORE_NOTICE_FACT_BY_OBLIGATION: Partial<
  Record<string, NoticeFactKey>
> = {
  collection_purpose: "collectionPurpose",
  collection_items: "collectionItems",
  retention_period: "retentionPeriod",
  consent_refusal_right: "refusalRight",
  refusal_disadvantage: "refusalRight",
  destruction_timing: "retentionPeriod",
  purpose_destruction: "retentionPeriod",
  processor_contact: "privacyContact",
  contact_department: "privacyContact",
};

export function isStrongMissingNoticeStatus(
  status: string,
  certainty: NoticeCertainty | undefined,
): boolean {
  if (certainty === "FOUND_CONFIRMED" || certainty === "FOUND_POSSIBLE") {
    return false;
  }
  if (certainty === "NEEDS_REVIEW") return false;
  return status === "missing";
}
