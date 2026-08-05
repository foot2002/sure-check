import * as cheerio from "cheerio";
import {
  collapseWhitespace,
  detectCategories,
  extractSentencesWithKeywords,
  isDirectPiiSolicitation,
  isMeaningfulText,
  NOTICE_KEYWORDS,
} from "@/lib/extractors/htmlTextUtils";
import type {
  MoaformExtractionMethod,
  MoaformFailureReason,
  MoaformPageMetadata,
  MoaformParsedQuestion,
  MoaformParseResult,
  MoaformQuestionType,
} from "@/lib/extractors/moaformTypes";
import {
  MOAFORM_ANSWER_JSON_BASE,
  MOAFORM_FAILURE_MESSAGES,
  extractMoaformId,
  resolveMoaformFailureReason,
} from "@/lib/extractors/moaformTypes";
import { fetchMoaformSpaForm } from "@/lib/extractors/moaformSpaClient";
import { safeUrlCheck } from "@/lib/security/urlSafety";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;

const LOGIN_MARKERS = [
  "sign in",
  "log in",
  "login",
  "로그인",
  "접근 권한",
  "permission to view",
  "do not have permission",
];

const CLOSED_MARKERS = [
  "closed",
  "no longer accepting",
  "응답이 마감",
  "설문이 종료",
  "응답 기간이 종료",
  "더 이상 응답",
];

const NOT_FOUND_MARKERS = [
  "cannot be found",
  "form cannot be found",
  "찾을 수 없",
  "존재하지 않",
];

/** UI chrome that must not be treated as questions */
const UI_NOISE_PATTERN =
  /^(다음|이전|뒤로|제출|확인|취소|필수|선택|닫기|시작|계속|완료|저장|공유|복사|인쇄|로그인|회원가입|다음\s*단계|Previous|Next|Submit|Continue|Back|Cancel|Required|Optional)$/i;

const OPERATOR_CONTEXT_PATTERN =
  /(?:주관|주최|운영|담당|문의|기관|회사|부서|수행|발주|조사기관|위탁)\s*[:：]?\s*([^\n|·•,/]{2,60})/gi;

const SKIP_BLOCK_TYPES = new Set([
  "information",
  "line_shape",
  "welcome_page",
  "thankyou_page",
  "page_break",
  "statement",
  "divider",
]);

const CHOICE_BLOCK_TYPES = new Set([
  "single_choice",
  "dropdown",
  "multiple_choice",
  "media_single_choice",
  "media_multiple_choice",
  "ranking",
  "media_ranking",
]);

const MATRIX_BLOCK_TYPES = new Set([
  "matrix_single_choice",
  "matrix_multiple_choice",
  "matrix_ranking",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? collapseWhitespace(value) : "";
}

function collectNoticeTexts(...texts: string[]): string[] {
  return extractSentencesWithKeywords(texts.filter(Boolean).join("\n"), NOTICE_KEYWORDS);
}

function extractPrivacyPolicyUrls(html: string, description: string): string[] {
  const urls = new Set<string>();
  const combined = `${html}\n${description}`;
  const pattern =
    /https?:\/\/[^\s"'<>]+(?:privacy|개인정보|policy)[^\s"'<>]*/gi;
  for (const match of combined.match(pattern) ?? []) {
    urls.add(match.replace(/[),.;]+$/, ""));
  }
  return [...urls];
}

function detectFormFlags(html: string, status?: string): {
  loginRequired: boolean;
  closedForm: boolean;
  notFound: boolean;
} {
  const lower = html.toLowerCase();
  const statusUpper = (status ?? "").toUpperCase();
  return {
    loginRequired: LOGIN_MARKERS.some((marker) => lower.includes(marker.toLowerCase())),
    closedForm:
      statusUpper === "CLOSED" ||
      CLOSED_MARKERS.some((marker) => lower.includes(marker.toLowerCase())),
    notFound:
      lower.includes("errorpage") ||
      NOT_FOUND_MARKERS.some((marker) => lower.includes(marker.toLowerCase())),
  };
}

function extractHtmlMeta(html: string): MoaformPageMetadata {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    "";
  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";

  const headings = [
    ...$("h1, h2, h3")
      .map((_, el) => collapseWhitespace($(el).text()))
      .get(),
  ]
    .filter((text) => isMeaningfulText(text, 2) && !UI_NOISE_PATTERN.test(text))
    .slice(0, 8);

  const footerTexts = [
    ...$(".footer, footer, .wf-footer, [class*='footer']")
      .map((_, el) => collapseWhitespace($(el).text()))
      .get(),
  ]
    .map((text) => text.replace(/\.$/, ""))
    .filter((text) => isMeaningfulText(text, 4));

  const visibleChunks: string[] = [];
  $("body")
    .find("p, span, div, li, strong, em")
    .slice(0, 120)
    .each((_, el) => {
      const text = collapseWhitespace($(el).text());
      if (isMeaningfulText(text, 2) && text.length < 120) {
        visibleChunks.push(text);
      }
    });

  const searchable = [title, description, ...headings, ...visibleChunks].join(
    "\n",
  );
  const operatorCandidates: string[] = [...footerTexts];

  for (const match of searchable.matchAll(OPERATOR_CONTEXT_PATTERN)) {
    const candidate = collapseWhitespace(match[1] ?? "");
    if (
      isMeaningfulText(candidate, 2) &&
      !UI_NOISE_PATTERN.test(candidate) &&
      !/moaform|surveyl/i.test(candidate)
    ) {
      operatorCandidates.push(candidate);
    }
  }

  // Org-like phrases: 시/군/구 + 과, Marketing, Group, 주식회사 등
  const orgLike =
    searchable.match(
      /([가-힣A-Za-z0-9&().\s]{2,40}(?:시|군|구|청|과|팀|센터|공사|공단|재단|주식회사|㈜|Group|Marketing|Agency))/g,
    ) ?? [];
  for (const raw of orgLike) {
    const candidate = collapseWhitespace(raw);
    if (
      candidate.length >= 4 &&
      candidate.length <= 48 &&
      !/moaform|필수|선택|다음|제출|신청|참여|상담|사업/i.test(candidate)
    ) {
      operatorCandidates.push(candidate);
    }
  }

  // Prefer clean "기관 | 수행사" footers (Korean dept before pipe)
  for (const text of [...footerTexts, ...visibleChunks]) {
    const pipe = text.match(
      /([가-힣][가-힣A-Za-z0-9()\s]{1,30}(?:과|팀|센터|청|재단))\s*\|\s*([A-Za-z가-힣0-9().\s&]{2,40})/,
    );
    if (pipe) {
      operatorCandidates.unshift(
        collapseWhitespace(`${pipe[1]} | ${pipe[2]}`).replace(/\.$/, ""),
      );
    }
  }

  const uniqueOperators = [...new Set(operatorCandidates)]
    .map((candidate) => candidate.replace(/\.$/, ""))
    .filter((candidate) => !/^20\d{2}\s/.test(candidate))
    .filter((candidate) => !/신청서|참여\]|MD 상담/.test(candidate))
    .filter(
      (candidate) =>
        !/모아폼으로 제작|전문가들이 선택한 설문|www\.moaform|이 양식은/i.test(
          candidate,
        ),
    )
    .sort((a, b) => {
      const score = (value: string) => {
        let points = 0;
        if (/\|\s*/.test(value)) points += 5;
        if (/(과|팀|센터|정책과)\b/.test(value.split("|")[0]?.trim() ?? "")) {
          points += 3;
        }
        if (/시|군|구/.test(value)) points += 1;
        if (/신청|참여|상담|사업|WK Marketing Group\.\s*서울/.test(value)) {
          points -= 4;
        }
        return points;
      };
      return score(b) - score(a);
    })
    .slice(0, 5);
  const cleanedTitle = collapseWhitespace(title).replace(
    /\s*[|\-–—]\s*Moaform.*$/i,
    "",
  );

  return {
    title: cleanedTitle,
    description: collapseWhitespace(description),
    headings,
    operatorCandidates: uniqueOperators,
    operatorHint: uniqueOperators[0],
  };
}

function htmlToPlainText(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (!raw.includes("<") && !raw.includes("&")) {
    return collapseWhitespace(raw);
  }
  if (!raw.includes("<")) {
    return collapseWhitespace(
      raw
        .replace(/&nbsp;/gi, " ")
        .replace(/&middot;/gi, "·")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">"),
    );
  }
  const $ = cheerio.load(`<div id="sure-root">${raw}</div>`);
  return collapseWhitespace($("#sure-root").text());
}

function isUiNoiseLabel(label: string): boolean {
  const text = collapseWhitespace(label);
  if (!isMeaningfulText(text, 2)) return true;
  if (text.length < 3) return true;
  if (UI_NOISE_PATTERN.test(text)) return true;
  if (/^(필수\s*항목|선택\s*항목|Required field)$/i.test(text)) return true;
  return false;
}

function mapMoaformBlockType(
  rawType: string,
  content: string,
  shape = "",
): MoaformQuestionType {
  const type = rawType.toLowerCase();
  const shapeLower = shape.toLowerCase();

  // Answer SPA block types
  if (type === "free" || type === "regex" || type === "number") {
    if (shapeLower === "long" || shapeLower === "essay" || shapeLower === "multiline") {
      return "long_text";
    }
    return "short_text";
  }
  if (type === "selectone") return "single_choice";
  if (type === "selectmany") return "multiple_choice";
  if (type === "fileupload") return "file_upload";

  if (type === "short_text" || type === "numeric_value" || type === "phone") {
    return "short_text";
  }
  if (type === "long_text") return "long_text";
  if (type === "single_choice" || type === "media_single_choice") return "single_choice";
  if (type === "multiple_choice" || type === "media_multiple_choice" || type === "ranking") {
    return "multiple_choice";
  }
  if (type === "dropdown") return "dropdown";
  if (type === "rating") return "rating";
  if (type === "point_scale" || type === "nps") return "linear_scale";
  if (MATRIX_BLOCK_TYPES.has(type)) return "grid_single";
  if (type === "matrix_multiple_choice" || type === "matrix_ranking") {
    return "grid_multiple";
  }
  if (type === "date") return "date";
  if (type === "time") return "time";
  if (type === "file_upload") return "file_upload";
  if (type === "email") return "short_text";
  if (type === "address") return "short_text";
  if (type === "url") return "short_text";
  if (/privacy|consent|동의/.test(type) || /개인정보.*동의|동의.*개인정보/.test(content)) {
    return "privacy_consent";
  }
  return "unknown";
}

function parseChoices(block: Record<string, unknown>): string[] {
  const properties = asRecord(block.properties) ?? {};
  const choices = asArray(properties.choices ?? block.choices);
  return choices
    .map((choice) => {
      const record = asRecord(choice);
      if (!record) return "";
      return (
        asString(record.strippedContent) ||
        htmlToPlainText(asString(record.content)) ||
        asString(record.label)
      );
    })
    .filter(isMeaningfulText);
}

function isBlockRequired(block: Record<string, unknown>): boolean {
  if (block.requiredAnswer === true || block.required === true) return true;
  const properties = asRecord(block.properties) ?? {};
  const validations = asRecord(properties.validations ?? block.validations);
  return validations?.required === true;
}

function buildQuestionFromBlock(
  block: Record<string, unknown>,
  pageIndex: number,
  questionIndex: number,
): MoaformParsedQuestion | null {
  const rawType = asString(block.type);
  if (!rawType || SKIP_BLOCK_TYPES.has(rawType)) return null;

  const content =
    htmlToPlainText(asString(block.content)) ||
    htmlToPlainText(asString(block.title)) ||
    asString(block.ribbon_text);
  const spaChoiceTypes = new Set(["selectone", "selectmany"]);
  if (
    !isMeaningfulText(content, 1) &&
    !CHOICE_BLOCK_TYPES.has(rawType) &&
    !spaChoiceTypes.has(rawType)
  ) {
    if (!MATRIX_BLOCK_TYPES.has(rawType)) return null;
  }

  const questionText = content || `[${rawType}]`;
  const properties = asRecord(block.properties) ?? {};
  const guidePhrase =
    asString(properties.guide_phrase) || asString(block.placeholder);
  const combined = [questionText, guidePhrase, ...parseChoices(block)].join(" ");
  const questionType = mapMoaformBlockType(
    rawType,
    combined,
    asString(block.shape),
  );
  const detectedCategories =
    questionType === "privacy_consent" ? [] : detectCategories(combined);
  const riskTags: string[] = [];

  if (questionType === "file_upload") riskTags.push("file_upload");
  if (questionType === "privacy_consent") riskTags.push("privacy_consent");
  if (
    (questionType === "long_text" || questionType === "short_text") &&
    !detectedCategories.length &&
    !isDirectPiiSolicitation(combined)
  ) {
    riskTags.push("free_text_possible_pii");
  }
  if (rawType === "email" && !detectedCategories.includes("email")) {
    detectedCategories.push("email");
  }
  if (rawType === "address" && !detectedCategories.includes("address")) {
    detectedCategories.push("address");
  }

  // Consent-style single choice on privacy pages
  if (
    questionType === "single_choice" &&
    /개인정보|수집\s*[·⋅.]?\s*이용|제공에 관한|동의/.test(combined)
  ) {
    return {
      id: asString(block.id) || `block_${questionIndex}`,
      questionText,
      description: guidePhrase || undefined,
      questionType: "privacy_consent",
      required: isBlockRequired(block),
      options: parseChoices(block),
      pageIndex,
      questionIndex,
      detectedCategories,
      riskTags: [...riskTags, "privacy_consent"],
    };
  }

  return {
    id: asString(block.id) || `block_${questionIndex}`,
    questionText,
    description: guidePhrase || undefined,
    questionType,
    required: isBlockRequired(block),
    options: parseChoices(block),
    pageIndex,
    questionIndex,
    detectedCategories,
    riskTags,
  };
}

function parseBlocksPayload(payload: Record<string, unknown>): {
  title: string;
  description: string;
  questions: MoaformParsedQuestion[];
  noticeTexts: string[];
  branchDetected: boolean;
  emailCollectionPossible: boolean;
  privacyConsentPossible: boolean;
  closedForm: boolean;
} {
  const formRecord =
    asRecord(payload.form) ??
    asRecord(payload.survey) ??
    payload;

  const titleRecord = asRecord(formRecord.title);
  const title =
    asString(formRecord.name) ||
    htmlToPlainText(asString(titleRecord?.content)) ||
    asString(formRecord.title) ||
    asString(payload.name) ||
    "모아폼 설문";
  const welcome =
    asRecord(formRecord.welcome_page) ?? asRecord(formRecord.welcome);
  const welcomeContent = htmlToPlainText(asString(welcome?.content));
  const description =
    welcomeContent ||
    asString(formRecord.description) ||
    asString(payload.description);

  const pages = asArray(formRecord.pages);
  const pageIndexById = new Map<string, number>();
  pages.forEach((pageRaw, index) => {
    const page = asRecord(pageRaw);
    if (page?.id) pageIndexById.set(asString(page.id), index);
  });

  const questions: MoaformParsedQuestion[] = [];
  let questionIndex = 0;
  let branchDetected = false;

  const pushFromBlock = (block: Record<string, unknown>, pageIndex: number) => {
    const rawType = asString(block.type);
    if (rawType.includes("logic") || rawType.includes("jump")) {
      branchDetected = true;
    }

    if (MATRIX_BLOCK_TYPES.has(rawType)) {
      const subBlocks = asArray(asRecord(block.properties)?.blocks ?? block.blocks);
      for (const subRaw of subBlocks) {
        const subBlock = asRecord(subRaw);
        if (!subBlock) continue;
        const merged = {
          ...block,
          ...subBlock,
          type: rawType.includes("multiple") ? "matrix_multiple_choice" : rawType,
          content: asString(subBlock.content) || asString(block.content),
        };
        const question = buildQuestionFromBlock(merged, pageIndex, questionIndex);
        if (question) {
          questions.push(question);
          questionIndex += 1;
        }
      }
      return;
    }

    const question = buildQuestionFromBlock(block, pageIndex, questionIndex);
    if (question) {
      questions.push(question);
      questionIndex += 1;
    }
  };

  // SPA next2 walk: pages[].blocks
  const spaPagesWithBlocks = pages.filter((pageRaw) => {
    const page = asRecord(pageRaw);
    return page != null && asArray(page.blocks).length > 0;
  });

  if (spaPagesWithBlocks.length > 0) {
    spaPagesWithBlocks.forEach((pageRaw, index) => {
      const page = asRecord(pageRaw);
      if (!page) return;
      const pageIndex =
        typeof page.number === "number" && page.number > 0
          ? page.number - 1
          : index;
      for (const blockRaw of asArray(page.blocks)) {
        const block = asRecord(blockRaw);
        if (block) pushFromBlock(block, pageIndex);
      }
    });
  } else {
    const blocks = asArray(formRecord.blocks ?? payload.blocks);
    for (const blockRaw of blocks) {
      const block = asRecord(blockRaw);
      if (!block) continue;
      const pageId = asString(
        asRecord(block.properties)?.page_id ?? block.page_id,
      );
      const pageIndex = pageIndexById.get(pageId) ?? 0;
      pushFromBlock(block, pageIndex);
    }
  }

  const noticeTexts = collectNoticeTexts(
    title,
    description,
    welcomeContent,
    ...questions.map((question) => question.questionText),
  );
  const emailCollectionPossible = questions.some(
    (question) =>
      question.detectedCategories.includes("email") ||
      (question.questionType === "short_text" &&
        /이메일|email/i.test(question.questionText)),
  );
  const privacyConsentPossible = questions.some(
    (question) => question.questionType === "privacy_consent",
  );
  const status = asString(formRecord.status ?? payload.status).toLowerCase();

  return {
    title,
    description,
    questions,
    noticeTexts,
    branchDetected,
    emailCollectionPossible,
    privacyConsentPossible,
    closedForm: status === "closed",
  };
}

function extractJsonObjectContaining(html: string, needle: string): unknown | null {
  const idx = html.indexOf(needle);
  if (idx === -1) return null;

  let start = -1;
  for (let i = idx; i >= 0; i -= 1) {
    if (html[i] === "{") {
      start = i;
      break;
    }
    if (idx - i > 5000) break;
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractEmbeddedJsonFromHtml(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  const scriptCandidates: string[] = [];

  $('script[type="application/json"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text) scriptCandidates.push(text);
  });

  for (const marker of ["__INITIAL_STATE__", "__PRELOADED_STATE__", "__NUXT__"]) {
    const match = html.match(new RegExp(`${marker}\\s*=\\s*(\\{[\\s\\S]*?\\});`));
    if (match?.[1]) scriptCandidates.push(match[1]);
  }

  const blocksObject = extractJsonObjectContaining(html, '"blocks":[');
  if (blocksObject) scriptCandidates.push(JSON.stringify(blocksObject));

  for (const candidate of scriptCandidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const record = asRecord(parsed);
      if (!record) continue;
      if (asArray(record.blocks).length > 0) return record;
      const nested = asRecord(record.form) ?? asRecord(record.survey);
      if (nested && asArray(nested.blocks).length > 0) return record;
    } catch {
      continue;
    }
  }

  return null;
}

function parseDomFallback(
  html: string,
  htmlMeta: MoaformPageMetadata,
  flags: { loginRequired: boolean; closedForm: boolean; notFound: boolean },
): MoaformParseResult {
  const $ = cheerio.load(html);
  const questions: MoaformParsedQuestion[] = [];
  let questionIndex = 0;

  const title =
    collapseWhitespace($("h1").first().text()) ||
    htmlMeta.headings[0] ||
    htmlMeta.title ||
    "모아폼 설문";
  const description =
    collapseWhitespace($('[class*="Welcome"], [class*="Description"]').first().text()) ||
    htmlMeta.description;

  const labelSelectors = [
    ".AnswerInputBox__label",
    '[class*="BlockContent"]',
    '[class*="QuestionTitle"]',
    '[class*="questionTitle"]',
    '[class*="BlockTitle"]',
    '[class*="question"]',
    '[class*="Question"]',
    '[class*="survey"]',
    '[class*="Survey"]',
    '[class*="field-label"]',
    '[class*="FieldLabel"]',
    '[class*="answer"] label',
    '[class*="form"] label',
    '[role="group"]',
    '[role="radiogroup"]',
    "fieldset legend",
    "legend",
    "label",
    "h2",
    "h3",
    "textarea[placeholder]",
    "input[placeholder]",
    "select[aria-label]",
    "[data-question]",
    "[data-item]",
    "[data-field]",
    "[data-qid]",
  ];

  const seen = new Set<string>();

  const pushCandidate = (label: string, containerRoot: unknown) => {
    if (isUiNoiseLabel(label)) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const container = containerRoot ? $(containerRoot as never) : $();
    let questionType: MoaformQuestionType = "short_text";
    const riskTags: string[] = [];

    if (container.find('input[type="file"]').length > 0) {
      questionType = "file_upload";
      riskTags.push("file_upload");
    } else if (container.find("textarea").length > 0) {
      questionType = "long_text";
    } else if (container.find('input[type="checkbox"]').length > 1) {
      questionType = "multiple_choice";
    } else if (
      container.find('input[type="radio"]').length > 0 ||
      container.find('[role="radio"]').length > 0
    ) {
      questionType = "single_choice";
    } else if (container.find("select").length > 0) {
      questionType = "dropdown";
    }

    const options = container
      .find('[class*="Choice"], option, [role="radio"], [role="checkbox"]')
      .map((__, option) => collapseWhitespace($(option).text()))
      .get()
      .filter((text) => isMeaningfulText(text) && !isUiNoiseLabel(text));

    const combined = [label, ...options].join(" ");
    const detectedCategories = detectCategories(combined);
    if (
      (questionType === "long_text" || questionType === "short_text") &&
      !detectedCategories.length
    ) {
      riskTags.push("free_text_possible_pii");
    }
    if (/개인정보.*동의|동의.*개인정보/.test(combined)) {
      questionType = "privacy_consent";
      riskTags.push("privacy_consent");
    }

    questions.push({
      id: `dom_q_${questionIndex}`,
      questionText: label,
      questionType,
      required:
        container.find("[required], [aria-required='true'], .required").length > 0,
      options: [...new Set(options)].slice(0, 30),
      pageIndex: 0,
      questionIndex,
      detectedCategories,
      riskTags,
    });
    questionIndex += 1;
  };

  for (const selector of labelSelectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const tag = (($el.prop("tagName") as string) || "").toLowerCase();
      let label = "";
      if (tag === "textarea" || tag === "input" || tag === "select") {
        label =
          collapseWhitespace($el.attr("aria-label") || "") ||
          collapseWhitespace($el.attr("placeholder") || "");
      } else {
        label = collapseWhitespace($el.text());
      }
      // Prefer shorter labels — long nav/footer blobs are not questions
      if (label.length > 160) return;

      const closest = $el.closest(
        '[class*="Block"], [class*="question"], [class*="field"], [class*="answer"], fieldset, .AnswerInputBox, form, [role="group"]',
      );
      pushCandidate(label, closest.length ? closest.get(0) ?? el : el);
    });
  }

  const noticeTexts = collectNoticeTexts(
    title,
    description,
    htmlMeta.description,
    ...htmlMeta.headings,
  );
  const failureReason = resolveMoaformFailureReason({
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    notFound: flags.notFound,
    htmlFetched: true,
    questionCount: questions.length,
  });
  const messages = MOAFORM_FAILURE_MESSAGES[failureReason];
  const isLimited =
    flags.loginRequired ||
    flags.closedForm ||
    flags.notFound ||
    questions.length === 0;

  return {
    title,
    description,
    questions,
    noticeTexts,
    privacyPolicyUrls: extractPrivacyPolicyUrls(html, description),
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected: false,
    emailCollectionPossible: questions.some((q) =>
      q.detectedCategories.includes("email"),
    ),
    privacyConsentPossible: questions.some(
      (q) => q.questionType === "privacy_consent",
    ),
    extractionMethod: questions.length > 0 ? "dom_fallback" : "none",
    partialScan: true,
    isLimited,
    limitedReason: isLimited ? messages.limitedReason : undefined,
    failureReason: isLimited ? failureReason : undefined,
    warnings: [
      `Moaform HTML fetched`,
      `Embedded JSON: absent (DOM path)`,
      `DOM fallback question count: ${questions.length}`,
      ...(isLimited
        ? [`Final limitation reason: ${failureReason}`]
        : ["DOM fallback으로 일부 문항만 추출했습니다."]),
    ],
    pageMeta: htmlMeta,
    operatorHint: htmlMeta.operatorHint,
    operatorCandidates: htmlMeta.operatorCandidates,
  };
}

export async function fetchMoaformAnswerJson(
  formId: string,
  refererUrl: string,
): Promise<{
  ok: boolean;
  data?: Record<string, unknown>;
  limitedReason?: string;
  softFail?: boolean;
}> {
  const apiUrl = `${MOAFORM_ANSWER_JSON_BASE}/${formId}.json`;
  const safety = await safeUrlCheck(apiUrl);
  if (!safety.safe) {
    return {
      ok: false,
      softFail: true,
      limitedReason: safety.reason ?? "API URL 안전검사에서 차단됨",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "SURE-Check/1.0 (Privacy Survey Scanner)",
        Referer: refererUrl,
      },
    });

    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        limitedReason: "모아폼에 로그인 또는 접근 권한이 필요합니다.",
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼을 찾을 수 없거나 비공개입니다.",
      };
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const text = await response.text();
    if (text.length > MAX_BYTES) {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 API 응답 크기가 2MB 제한을 초과했습니다.",
      };
    }

    if (!text.trim()) {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 JSON 응답이 비어 있습니다.",
      };
    }

    // HTML or non-JSON → quiet fallback (do not break the scan)
    if (
      contentType.includes("text/html") ||
      /^\s*</.test(text) ||
      (!contentType.includes("json") && !/^\s*[{\[]/.test(text))
    ) {
      return {
        ok: false,
        softFail: true,
        limitedReason: "Public JSON endpoint returned non-JSON",
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 JSON 파싱에 실패했습니다.",
      };
    }

    const record = asRecord(data);
    if (!record) {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 JSON 구조를 확인하지 못했습니다.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        softFail: true,
        limitedReason: `모아폼 API 응답 오류(HTTP ${response.status})`,
      };
    }

    return { ok: true, data: record };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        softFail: true,
        limitedReason: "모아폼 API 응답 시간 초과(8초)",
      };
    }
    return {
      ok: false,
      softFail: true,
      limitedReason: "모아폼 API fetch 중 오류가 발생했습니다.",
    };
  }
}

function buildParseResult(
  parsed: ReturnType<typeof parseBlocksPayload>,
  extractionMethod: MoaformExtractionMethod,
  flags: { loginRequired: boolean; closedForm: boolean; notFound: boolean },
  html: string,
  partialScan: boolean,
  warnings: string[] = [],
  pageMeta?: MoaformPageMetadata,
): MoaformParseResult {
  const isLimited =
    flags.loginRequired ||
    flags.closedForm ||
    flags.notFound ||
    parsed.closedForm ||
    parsed.questions.length === 0;

  let failureReason: MoaformFailureReason | undefined;
  if (isLimited) {
    failureReason = resolveMoaformFailureReason({
      loginRequired: flags.loginRequired,
      closedForm: flags.closedForm || parsed.closedForm,
      notFound: flags.notFound,
      htmlFetched: true,
      questionCount: parsed.questions.length,
      hadEmbeddedJson: extractionMethod === "embedded_json",
      hadAnswerJson: extractionMethod === "answer_json",
      hadSpaSession: extractionMethod === "spa_session",
    });
  }

  const limitedReason = failureReason
    ? MOAFORM_FAILURE_MESSAGES[failureReason].limitedReason
    : undefined;

  return {
    title: parsed.title || pageMeta?.title || "모아폼 설문",
    description: parsed.description || pageMeta?.description || "",
    questions: parsed.questions,
    noticeTexts: parsed.noticeTexts,
    privacyPolicyUrls: extractPrivacyPolicyUrls(html, parsed.description),
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm || parsed.closedForm,
    branchDetected: parsed.branchDetected,
    emailCollectionPossible: parsed.emailCollectionPossible,
    privacyConsentPossible: parsed.privacyConsentPossible,
    extractionMethod,
    partialScan,
    isLimited,
    limitedReason,
    failureReason,
    warnings,
    pageMeta,
    operatorHint: pageMeta?.operatorHint,
    operatorCandidates: pageMeta?.operatorCandidates,
  };
}

export async function parseMoaformDocument(
  html: string,
  finalUrl: string,
): Promise<MoaformParseResult> {
  const htmlMeta = extractHtmlMeta(html);
  const flags = detectFormFlags(html);
  const formId = extractMoaformId(finalUrl) ?? extractMoaformId(html);
  const trace: string[] = ["Moaform HTML fetched"];

  const embedded = extractEmbeddedJsonFromHtml(html);
  trace.push(
    embedded ? "Embedded JSON: present" : "Embedded JSON: absent",
  );

  if (embedded) {
    const parsed = parseBlocksPayload(embedded);
    if (parsed.questions.length > 0) {
      return {
        ...buildParseResult(
          parsed,
          "embedded_json",
          flags,
          html,
          false,
          [...trace, `Question count: ${parsed.questions.length}`],
          htmlMeta,
        ),
        formId: formId ?? undefined,
      };
    }
  }

  let answerJsonSoftFail = false;
  if (formId) {
    const spa = await fetchMoaformSpaForm(formId);
    if (spa.ok && spa.data) {
      trace.push(
        `SPA session success/fail: success (pages=${spa.pageCount ?? 0}, blocks=${spa.blockCount ?? 0})`,
      );
      const parsed = parseBlocksPayload(spa.data);
      if (parsed.questions.length > 0) {
        return {
          ...buildParseResult(
            parsed,
            "spa_session",
            flags,
            html,
            false,
            [
              ...trace,
              `Question count: ${parsed.questions.length}`,
              "Extraction method: spa_session (form2/next2)",
            ],
            htmlMeta,
          ),
          formId,
        };
      }
      trace.push("SPA session had no question blocks");
      if (spa.softFail) answerJsonSoftFail = true;
    } else {
      trace.push(
        `SPA session success/fail: fail (${spa.limitedReason ?? "unknown"})`,
      );
      answerJsonSoftFail = Boolean(spa.softFail);
    }

    const access = await fetchMoaformAnswerJson(formId, finalUrl);
    if (access.ok && access.data) {
      trace.push("Public JSON endpoint success/fail: success");
      const parsed = parseBlocksPayload(access.data);
      if (parsed.questions.length > 0) {
        return {
          ...buildParseResult(
            parsed,
            "answer_json",
            flags,
            html,
            false,
            [...trace, `Question count: ${parsed.questions.length}`],
            htmlMeta,
          ),
          formId,
        };
      }
      trace.push("Public JSON endpoint had no question blocks");
    } else {
      trace.push(
        `Public JSON endpoint success/fail: fail (${access.limitedReason ?? "unknown"})`,
      );
      answerJsonSoftFail = answerJsonSoftFail || Boolean(access.softFail);

      // Hard access restriction — return early limited result with metadata
      if (access.limitedReason?.includes("로그인") && !access.softFail) {
        const failureReason: MoaformFailureReason = "MOAFORM_ACCESS_RESTRICTED";
        const messages = MOAFORM_FAILURE_MESSAGES[failureReason];
        return {
          title: htmlMeta.title || htmlMeta.headings[0] || "모아폼 설문",
          description: htmlMeta.description,
          questions: [],
          noticeTexts: collectNoticeTexts(
            htmlMeta.title,
            htmlMeta.description,
            ...htmlMeta.headings,
          ),
          privacyPolicyUrls: [],
          loginRequired: true,
          closedForm: flags.closedForm,
          branchDetected: false,
          emailCollectionPossible: false,
          privacyConsentPossible: false,
          extractionMethod: "none",
          partialScan: true,
          isLimited: true,
          limitedReason: messages.limitedReason,
          failureReason,
          warnings: [
            ...trace,
            `Final limitation reason: ${failureReason}`,
            access.limitedReason ?? messages.limitedReason,
          ],
          formId,
          pageMeta: htmlMeta,
          operatorHint: htmlMeta.operatorHint,
          operatorCandidates: htmlMeta.operatorCandidates,
        };
      }
    }

    void answerJsonSoftFail;
  } else {
    trace.push("Public JSON endpoint success/fail: skipped (no formId)");
  }

  const domParsed = parseDomFallback(html, htmlMeta, flags);
  return {
    ...domParsed,
    formId: formId ?? undefined,
    warnings: [...trace, ...domParsed.warnings],
  };
}
