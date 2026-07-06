import * as cheerio from "cheerio";
import type { ExtractorInput, QuestionCandidate } from "@/lib/extractors/types";
import type {
  DetectedCategory,
  NormalizedForm,
  NormalizedQuestion,
  QuestionRiskTag,
} from "@/lib/types/scan";
import {
  categoriesToDataLevel,
  collapseWhitespace,
  dedupeKey,
  detectCategories,
  extractSentencesWithKeywords,
  getDetectedCategoryDisplayLabel,
  isPersonalDataCategory,
  isMeaningfulText,
  mapInputType,
  NOTICE_KEYWORDS,
} from "@/lib/extractors/htmlTextUtils";
import { EXTRACTION_LIMITED_REASON } from "@/lib/scan/limitedReport";

function getLabelForInput(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any,
): string | undefined {
  const id = $(el).attr("id");
  if (id) {
    const label = $(`label[for="${id}"]`).first().text();
    if (isMeaningfulText(label)) return collapseWhitespace(label);
  }

  const parentLabel = $(el).closest("label").first().text();
  if (isMeaningfulText(parentLabel)) return collapseWhitespace(parentLabel);

  const aria = $(el).attr("aria-label");
  if (isMeaningfulText(aria ?? "")) return collapseWhitespace(aria!);

  return undefined;
}

function buildQuestionCandidate(
  $: cheerio.CheerioAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  el: any,
  tag: "input" | "textarea" | "select",
  index: number,
): QuestionCandidate | null {
  const $el = $(el);
  const label = getLabelForInput($, el);
  const placeholder = $el.attr("placeholder");
  const name = $el.attr("name");
  const required = $el.is("[required]") || $el.attr("aria-required") === "true";

  let questionText = label;
  if (!questionText && placeholder) questionText = collapseWhitespace(placeholder);
  if (!questionText && name && isMeaningfulText(name, 3)) {
    questionText = collapseWhitespace(name.replace(/[_-]/g, " "));
  }

  if (!questionText || !isMeaningfulText(questionText, 2)) return null;

  let questionType = "short_text";
  const riskTags: string[] = [];
  const detectedCategories = detectCategories(
    [questionText, placeholder ?? "", name ?? ""].join(" "),
  );

  if (tag === "textarea") {
    questionType = "long_text";
  } else if (tag === "select") {
    questionType = "dropdown";
  } else {
    const inputType = ($el.attr("type") ?? "text").toLowerCase();
    const mapped = mapInputType(inputType);
    questionType = mapped.questionType;
    riskTags.push(...mapped.riskTags);
    if (inputType === "email" && !detectedCategories.includes("email")) {
      detectedCategories.push("email");
    }
    if (inputType === "tel" && !detectedCategories.includes("phone")) {
      detectedCategories.push("phone");
    }
  }

  return {
    id: `q_${index}`,
    questionText,
    questionType,
    required,
    auxiliaryText: name ? `name=${name}` : undefined,
    detectedCategories,
    riskTags,
    source: tag,
  };
}

function dedupeQuestions(candidates: QuestionCandidate[]): QuestionCandidate[] {
  const seen = new Set<string>();
  const result: QuestionCandidate[] = [];
  for (const c of candidates) {
    const key = dedupeKey(c.questionText);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }
  return result;
}

function toNormalizedQuestion(candidate: QuestionCandidate): NormalizedQuestion {
  const categories = candidate.detectedCategories as DetectedCategory[];
  const personalDataTypes = categories.map(
    (category) => getDetectedCategoryDisplayLabel(category, candidate.questionText),
  );
  const hasPersonalData = categories.some(isPersonalDataCategory);
  const dataRiskLevel = hasPersonalData
    ? categoriesToDataLevel(categories)
    : "D1";

  return {
    id: candidate.id,
    label: candidate.questionText,
    questionText: candidate.questionText,
    type: candidate.questionType,
    required: candidate.required,
    hasPersonalData,
    personalDataTypes: personalDataTypes.length > 0 ? personalDataTypes : undefined,
    dataRiskLevel,
    detectedCategories: categories,
    riskTags: candidate.riskTags as QuestionRiskTag[],
    auxiliaryText: candidate.auxiliaryText,
  };
}

function detectNoticeFlags(noticeTexts: string[]): {
  hasPrivacyNotice: boolean;
  hasConsent: boolean;
  hasRetentionNotice: boolean;
  hasOverseasTransferNotice: boolean;
} {
  const joined = noticeTexts.join(" ");
  return {
    hasPrivacyNotice: /개인정보/.test(joined),
    hasConsent: /동의/.test(joined),
    hasRetentionNotice: /보유|이용기간/.test(joined),
    hasOverseasTransferNotice: /국외/.test(joined),
  };
}

export function extractGenericHtml(input: ExtractorInput): NormalizedForm {
  const $ = cheerio.load(input.html);
  const title =
    collapseWhitespace($("title").first().text()) ||
    collapseWhitespace($("h1").first().text()) ||
    "온라인 설문";

  const headings = $("h1, h2, h3")
    .map((_, el) => collapseWhitespace($(el).text()))
    .get()
    .filter(isMeaningfulText);

  const formTexts = $("form")
    .map((_, el) => collapseWhitespace($(el).text()).slice(0, 500))
    .get()
    .filter((t) => t.length > 10);

  const bodyText = collapseWhitespace($("body").text());
  const noticeTexts = extractSentencesWithKeywords(bodyText, NOTICE_KEYWORDS);

  const privacyPolicyUrls = $("a[href]")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = collapseWhitespace($(el).text());
      if (!href) return null;
      if (
        /privacy|개인정보|policy/i.test(href) ||
        /개인정보|처리방침/.test(text)
      ) {
        try {
          return new URL(href, input.finalUrl).toString();
        } catch {
          return null;
        }
      }
      return null;
    })
    .get()
    .filter((u): u is string => Boolean(u));

  const candidates: QuestionCandidate[] = [];
  let index = 0;

  $("input, textarea, select").each((_, el) => {
    const tag = "tagName" in el ? String(el.tagName).toLowerCase() : "";
    if (tag === "input") {
      const type = ($(el).attr("type") ?? "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
    }
    if (!["input", "textarea", "select"].includes(tag)) return;
    const candidate = buildQuestionCandidate(
      $,
      el,
      tag as "input" | "textarea" | "select",
      index++,
    );
    if (candidate) candidates.push(candidate);
  });

  const questions = dedupeQuestions(candidates).map(toNormalizedQuestion);
  const noticeFlags = detectNoticeFlags(noticeTexts);
  const hasNoQuestions = questions.length === 0;

  const descriptionParts = [
    headings[0],
    ...noticeTexts.slice(0, 3),
    ...formTexts.slice(0, 2),
  ].filter(Boolean);

  const page = {
    id: "page_1",
    title: headings[0] ?? title,
    questions,
  };

  return {
    platform: "generic",
    title,
    url: input.finalUrl,
    operatorType: "미확인",
    questions,
    pages: [page],
    partialScan: true,
    isLimited: hasNoQuestions,
    confidence: hasNoQuestions ? "none" : "low",
    limitedReason: hasNoQuestions ? EXTRACTION_LIMITED_REASON : undefined,
    loginRequired: false,
    branchDetected: false,
    extractedFromHtml: true,
    hasPrivacyNotice: noticeFlags.hasPrivacyNotice,
    hasConsent: noticeFlags.hasConsent,
    hasRetentionNotice: noticeFlags.hasRetentionNotice,
    hasOverseasTransferNotice: noticeFlags.hasOverseasTransferNotice,
    notices: {
      description: descriptionParts.join("\n").slice(0, 1500),
      privacyPolicyUrl: privacyPolicyUrls[0],
      privacyNotice: noticeTexts.slice(0, 5).join("\n"),
    },
    metadata: {
      noticeTexts,
      privacyPolicyUrls: [...new Set(privacyPolicyUrls)],
      headings,
      extractionWarnings: [],
    },
    management: {
      officialAccount: null,
      accessControl: null,
      rawDataDownloadControl: null,
      retentionManagement: null,
      resultDisclosurePrevention: null,
      rawDataScopeDefined: null,
      institutionalControl: null,
      anonymityGuarantee: null,
      csapVerified: false,
      trusteeDisclosed: false,
      domesticStorage: null,
    },
    detectedFields: questions.map(
      (q) => `${q.type}: ${q.label}${q.required ? " (필수)" : ""}`,
    ),
  };
}
