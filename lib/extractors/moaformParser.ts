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
  MoaformParsedQuestion,
  MoaformParseResult,
  MoaformQuestionType,
} from "@/lib/extractors/moaformTypes";
import {
  MOAFORM_ANSWER_JSON_BASE,
  extractMoaformId,
} from "@/lib/extractors/moaformTypes";
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

const SKIP_BLOCK_TYPES = new Set([
  "information",
  "line_shape",
  "welcome_page",
  "thankyou_page",
  "page_break",
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

function extractHtmlMeta(html: string): { title: string; description: string } {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    "";
  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";

  return {
    title: collapseWhitespace(title).replace(/\s*[|\-–—]\s*Moaform.*$/i, ""),
    description: collapseWhitespace(description),
  };
}

function mapMoaformBlockType(rawType: string, content: string): MoaformQuestionType {
  const type = rawType.toLowerCase();
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
    .map((choice) => asString(asRecord(choice)?.label))
    .filter(isMeaningfulText);
}

function isBlockRequired(block: Record<string, unknown>): boolean {
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

  const content = asString(block.content) || asString(block.ribbon_text);
  if (!isMeaningfulText(content, 1) && !CHOICE_BLOCK_TYPES.has(rawType)) {
    if (!MATRIX_BLOCK_TYPES.has(rawType)) return null;
  }

  const questionText = content || `[${rawType}]`;
  const properties = asRecord(block.properties) ?? {};
  const guidePhrase = asString(properties.guide_phrase);
  const combined = [questionText, guidePhrase, ...parseChoices(block)].join(" ");
  const questionType = mapMoaformBlockType(rawType, combined);
  const detectedCategories = detectCategories(combined);
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

  const title =
    asString(formRecord.name) ||
    asString(formRecord.title) ||
    asString(payload.name) ||
    "모아폼 설문";
  const welcome = asRecord(formRecord.welcome_page);
  const welcomeContent = asString(welcome?.content);
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

  const blocks = asArray(formRecord.blocks ?? payload.blocks);
  const questions: MoaformParsedQuestion[] = [];
  let questionIndex = 0;
  let branchDetected = false;

  for (const blockRaw of blocks) {
    const block = asRecord(blockRaw);
    if (!block) continue;

    const rawType = asString(block.type);
    if (rawType.includes("logic") || rawType.includes("jump")) {
      branchDetected = true;
    }

    const pageId = asString(asRecord(block.properties)?.page_id ?? block.page_id);
    const pageIndex = pageIndexById.get(pageId) ?? 0;

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
      continue;
    }

    const question = buildQuestionFromBlock(block, pageIndex, questionIndex);
    if (question) {
      questions.push(question);
      questionIndex += 1;
    }
  }

  const noticeTexts = collectNoticeTexts(title, description, welcomeContent);
  const emailCollectionPossible = questions.some(
    (question) =>
      question.questionType === "short_text" &&
      question.detectedCategories.includes("email"),
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
  htmlMeta: { title: string; description: string },
  flags: { loginRequired: boolean; closedForm: boolean; notFound: boolean },
): MoaformParseResult {
  const $ = cheerio.load(html);
  const questions: MoaformParsedQuestion[] = [];
  let questionIndex = 0;

  const title =
    collapseWhitespace($("h1").first().text()) ||
    htmlMeta.title ||
    "모아폼 설문";
  const description =
    collapseWhitespace($('[class*="Welcome"], [class*="Description"]').first().text()) ||
    htmlMeta.description;

  const labelSelectors = [
    ".AnswerInputBox__label",
    '[class*="BlockContent"]',
    '[class*="QuestionTitle"]',
    '[class*="BlockTitle"]',
    "legend",
    "label",
  ];

  const seen = new Set<string>();

  for (const selector of labelSelectors) {
    $(selector).each((_, el) => {
      const label = collapseWhitespace($(el).text());
      if (!isMeaningfulText(label, 2)) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const container = $(el).closest('[class*="Block"], fieldset, .AnswerInputBox, form');
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
        .filter(isMeaningfulText);

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
    });
  }

  const noticeTexts = collectNoticeTexts(title, description, htmlMeta.description);
  const isLimited = flags.loginRequired || flags.closedForm || flags.notFound || questions.length === 0;

  return {
    title,
    description,
    questions,
    noticeTexts,
    privacyPolicyUrls: extractPrivacyPolicyUrls(html, description),
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected: false,
    emailCollectionPossible: questions.some((q) => q.detectedCategories.includes("email")),
    privacyConsentPossible: questions.some((q) => q.questionType === "privacy_consent"),
    extractionMethod: questions.length > 0 ? "dom_fallback" : "none",
    partialScan: true,
    isLimited,
    limitedReason: isLimited
      ? flags.loginRequired
        ? "모아폼에 로그인 또는 접근 권한이 필요합니다."
        : flags.closedForm
          ? "모아폼 응답이 종료되었습니다."
          : flags.notFound
            ? "모아폼을 찾을 수 없거나 접근 권한이 없습니다."
            : "모아폼 HTML에서 질문을 확인하지 못했습니다."
      : undefined,
    warnings: questions.length > 0 ? ["DOM fallback으로 일부 문항만 추출했습니다."] : [],
  };
}

export async function fetchMoaformAnswerJson(
  formId: string,
  refererUrl: string,
): Promise<{ ok: boolean; data?: Record<string, unknown>; limitedReason?: string }> {
  const apiUrl = `${MOAFORM_ANSWER_JSON_BASE}/${formId}.json`;
  const safety = await safeUrlCheck(apiUrl);
  if (!safety.safe) {
    return { ok: false, limitedReason: safety.reason ?? "API URL 안전검사에서 차단됨" };
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
      return { ok: false, limitedReason: "모아폼에 로그인 또는 접근 권한이 필요합니다." };
    }

    const text = await response.text();
    if (text.length > MAX_BYTES) {
      return { ok: false, limitedReason: "모아폼 API 응답 크기가 2MB 제한을 초과했습니다." };
    }

    if (!text.trim()) {
      return { ok: false, limitedReason: "모아폼 JSON 응답이 비어 있습니다." };
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, limitedReason: "모아폼 JSON 파싱에 실패했습니다." };
    }

    const record = asRecord(data);
    if (!record) {
      return { ok: false, limitedReason: "모아폼 JSON 구조를 확인하지 못했습니다." };
    }

    if (response.status === 404) {
      return { ok: false, limitedReason: "모아폼을 찾을 수 없거나 비공개입니다." };
    }

    if (!response.ok) {
      return {
        ok: false,
        limitedReason: `모아폼 API 응답 오류(HTTP ${response.status})`,
      };
    }

    return { ok: true, data: record };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, limitedReason: "모아폼 API 응답 시간 초과(8초)" };
    }
    return { ok: false, limitedReason: "모아폼 API fetch 중 오류가 발생했습니다." };
  }
}

function buildParseResult(
  parsed: ReturnType<typeof parseBlocksPayload>,
  extractionMethod: MoaformExtractionMethod,
  flags: { loginRequired: boolean; closedForm: boolean; notFound: boolean },
  html: string,
  partialScan: boolean,
  warnings: string[] = [],
): MoaformParseResult {
  const isLimited =
    flags.loginRequired ||
    flags.closedForm ||
    flags.notFound ||
    parsed.closedForm ||
    parsed.questions.length === 0;

  let limitedReason: string | undefined;
  if (flags.loginRequired) {
    limitedReason = "모아폼에 로그인 또는 접근 권한이 필요합니다.";
  } else if (flags.closedForm || parsed.closedForm) {
    limitedReason = "모아폼 응답이 종료되었습니다.";
  } else if (flags.notFound) {
    limitedReason = "모아폼을 찾을 수 없거나 접근 권한이 없습니다.";
  } else if (parsed.questions.length === 0) {
    limitedReason = "모아폼 질문 데이터를 추출하지 못했습니다.";
  }

  return {
    title: parsed.title,
    description: parsed.description,
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
    warnings,
  };
}

export async function parseMoaformDocument(
  html: string,
  finalUrl: string,
): Promise<MoaformParseResult> {
  const htmlMeta = extractHtmlMeta(html);
  const flags = detectFormFlags(html);
  const formId = extractMoaformId(finalUrl) ?? extractMoaformId(html);

  const embedded = extractEmbeddedJsonFromHtml(html);
  if (embedded) {
    const parsed = parseBlocksPayload(embedded);
    if (parsed.questions.length > 0) {
      return {
        ...buildParseResult(parsed, "embedded_json", flags, html, false),
        formId: formId ?? undefined,
      };
    }
  }

  if (formId) {
    const access = await fetchMoaformAnswerJson(formId, finalUrl);
    if (access.ok && access.data) {
      const parsed = parseBlocksPayload(access.data);
      if (parsed.questions.length > 0) {
        return {
          ...buildParseResult(parsed, "answer_json", flags, html, false),
          formId,
        };
      }
    }

    if (access.limitedReason?.includes("로그인")) {
      return {
        title: htmlMeta.title || "모아폼 설문",
        description: htmlMeta.description,
        questions: [],
        noticeTexts: [],
        privacyPolicyUrls: [],
        loginRequired: true,
        closedForm: flags.closedForm,
        branchDetected: false,
        emailCollectionPossible: false,
        privacyConsentPossible: false,
        extractionMethod: "none",
        partialScan: true,
        isLimited: true,
        limitedReason: access.limitedReason,
        warnings: [access.limitedReason],
        formId,
      };
    }
  }

  const domParsed = parseDomFallback(html, htmlMeta, flags);
  return {
    ...domParsed,
    formId: formId ?? undefined,
  };
}
