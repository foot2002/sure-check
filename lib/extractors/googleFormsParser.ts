import * as cheerio from "cheerio";
import {
  collapseWhitespace,
  detectCategories,
  extractSentencesWithKeywords,
  isMeaningfulText,
  NOTICE_KEYWORDS,
} from "@/lib/extractors/htmlTextUtils";
import type {
  GoogleFormsExtractionMethod,
  GoogleFormsParsedQuestion,
  GoogleFormsParseResult,
  GoogleFormsQuestionType,
} from "@/lib/extractors/googleFormsTypes";

const PAGE_BREAK_TYPE = 8;

const TYPE_CODE_MAP: Record<number, GoogleFormsQuestionType> = {
  0: "short_text",
  1: "long_text",
  2: "single_choice",
  3: "dropdown",
  4: "multiple_choice",
  5: "linear_scale",
  7: "grid_single",
  9: "date",
  10: "time",
  13: "file_upload",
};

const LOGIN_MARKERS = [
  "Sign in to continue",
  "Sign in to Google to view this form",
  "You need permission",
  "requires you to sign in",
  "로그인하여 Google 계정",
  "Google 계정으로 로그인",
  "로그인이 필요",
  "계정에 로그인",
];

const CLOSED_MARKERS = [
  "no longer accepting responses",
  "더 이상 응답을 받지 않",
  "응답이 마감",
  "설문이 종료",
  "This form is closed",
];

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? collapseWhitespace(value) : "";
}

function extractFbPublicLoadDataJson(html: string): unknown[] | null {
  const marker = "FB_PUBLIC_LOAD_DATA_";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const startIdx = html.indexOf("[", markerIdx);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = html.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(jsonText);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function mapTypeCode(typeCode: number, field: unknown[]): GoogleFormsQuestionType {
  if (typeCode === 10 && looksLikeCheckboxGrid(field)) {
    return "grid_multiple";
  }
  return TYPE_CODE_MAP[typeCode] ?? "unknown";
}

function looksLikeCheckboxGrid(field: unknown[]): boolean {
  const entry = asArray(field[4])[0];
  if (!Array.isArray(entry)) return false;
  const options = entry[1];
  if (!Array.isArray(options) || options.length === 0) return false;
  const first = options[0];
  return Array.isArray(first) && first.length > 2;
}

function extractChoiceOptions(entry: unknown): string[] {
  if (!Array.isArray(entry) || !Array.isArray(entry[1])) return [];
  return entry[1]
    .filter(Array.isArray)
    .map((option) => asString(option[0]))
    .filter(isMeaningfulText);
}

function extractGridRowsColumns(entry: unknown): { rows: string[]; columns: string[] } {
  if (!Array.isArray(entry) || !Array.isArray(entry[1])) {
    return { rows: [], columns: [] };
  }
  const rows = entry[1]
    .filter(Array.isArray)
    .map((row) => asString(row[0]))
    .filter(isMeaningfulText);
  const columns = asArray(entry[2])
    .filter(Array.isArray)
    .map((col) => asString(col[0]))
    .filter(isMeaningfulText);
  return { rows, columns };
}

function isRequired(entry: unknown): boolean {
  if (!Array.isArray(entry)) return false;
  return entry[2] === 1 || entry[2] === true;
}

function detectBranching(field: unknown[]): boolean {
  const entry = asArray(field[4])[0];
  if (!Array.isArray(entry)) return false;
  return entry.some(
    (value) =>
      typeof value === "number" && value > 0 && value !== 1,
  );
}

function collectNoticeTexts(...texts: string[]): string[] {
  const joined = texts.filter(Boolean).join("\n");
  return extractSentencesWithKeywords(joined, NOTICE_KEYWORDS);
}

function detectFormFlags(html: string): {
  loginRequired: boolean;
  closedForm: boolean;
} {
  const lower = html.toLowerCase();
  return {
    loginRequired: LOGIN_MARKERS.some((m) => lower.includes(m.toLowerCase())),
    closedForm: CLOSED_MARKERS.some((m) => lower.includes(m.toLowerCase())),
  };
}

function parseFbPublicLoadData(
  data: unknown[],
  flags: { loginRequired: boolean; closedForm: boolean },
): GoogleFormsParseResult {
  const formInfo = asArray(data[1]);
  const description = asString(formInfo[0]);
  const title =
    asString(formInfo[8]) ||
    asString(data[3]) ||
    asString(formInfo[9]) ||
    "Google Forms 설문";
  const rawFields = asArray(formInfo[1]);

  const questions: GoogleFormsParsedQuestion[] = [];
  const warnings: string[] = [];
  let pageIndex = 0;
  let questionIndex = 0;
  let branchDetected = false;
  let emailCollectionPossible = false;

  for (const rawField of rawFields) {
    if (!Array.isArray(rawField) || rawField.length < 4) continue;

    const fieldId = String(rawField[0] ?? `q_${questionIndex}`);
    const questionText = asString(rawField[1]);
    const fieldDescription = asString(rawField[2]);
    const typeCode = typeof rawField[3] === "number" ? rawField[3] : -1;
    const entry = asArray(rawField[4])[0];

    if (typeCode === PAGE_BREAK_TYPE) {
      pageIndex += 1;
      questionIndex = 0;
      questions.push({
        id: `section_${pageIndex}`,
        questionText: questionText || `섹션 ${pageIndex + 1}`,
        description: fieldDescription || undefined,
        questionType: "unknown",
        required: false,
        options: [],
        rows: [],
        columns: [],
        pageIndex,
        questionIndex: -1,
        detectedCategories: [],
        riskTags: [],
        isPageBreak: true,
        sectionTitle: questionText || undefined,
        sectionDescription: fieldDescription || undefined,
      });
      continue;
    }

    if (!isMeaningfulText(questionText, 1)) continue;

    const questionType = mapTypeCode(typeCode, rawField);
    const options = extractChoiceOptions(entry);
    const { rows, columns } = extractGridRowsColumns(entry);
    const required = isRequired(entry);
    const combinedText = [questionText, fieldDescription, ...options, ...rows, ...columns].join(
      " ",
    );
    const detectedCategories = detectCategories(combinedText);
    const riskTags: string[] = [];

    if (questionType === "file_upload") {
      riskTags.push("file_upload");
    }
    if (
      detectedCategories.includes("email") ||
      /email|이메일/i.test(combinedText)
    ) {
      emailCollectionPossible = true;
    }
    if (detectBranching(rawField)) {
      branchDetected = true;
    }

    questions.push({
      id: fieldId,
      questionText,
      description: fieldDescription || undefined,
      questionType,
      required,
      options,
      rows,
      columns,
      pageIndex,
      questionIndex,
      detectedCategories,
      riskTags,
    });
    questionIndex += 1;
  }

  const answerable = questions.filter((q) => !q.isPageBreak);
  const noticeTexts = collectNoticeTexts(title, description, ...answerable.map((q) => q.questionText));

  if (pageIndex > 0 || questions.some((q) => q.isPageBreak)) {
    branchDetected = true;
  }

  const isLimited =
    flags.loginRequired ||
    flags.closedForm ||
    answerable.length === 0;

  let limitedReason: string | undefined;
  if (flags.loginRequired) {
    limitedReason = "Google Forms에 로그인 또는 접근 권한이 필요합니다.";
  } else if (flags.closedForm) {
    limitedReason = "Google Forms 응답이 종료되었습니다.";
  } else if (answerable.length === 0) {
    limitedReason = "Google Forms 질문 데이터를 추출하지 못했습니다.";
  }

  return {
    title,
    description,
    questions,
    noticeTexts,
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected,
    emailCollectionPossible,
    extractionMethod: "fb_public_data",
    partialScan: flags.closedForm,
    isLimited,
    limitedReason,
    warnings,
  };
}

function parseDomFallback(
  html: string,
  flags: { loginRequired: boolean; closedForm: boolean },
): GoogleFormsParseResult {
  const $ = cheerio.load(html);
  const title =
    collapseWhitespace($("title").first().text()).replace(/ - Google Forms$/, "") ||
    collapseWhitespace($('[role="heading"]').first().text()) ||
    "Google Forms 설문";

  const description =
    collapseWhitespace($(".freebirdFormviewerViewHeaderDescription").first().text()) ||
    collapseWhitespace($('[data-params*="description"]').first().text()) ||
    "";

  const questions: GoogleFormsParsedQuestion[] = [];
  let questionIndex = 0;

  $('[role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot').each((_, el) => {
    const $item = $(el);
    const questionText =
      collapseWhitespace($item.find('[role="heading"], .M7eMe, .freebirdFormviewerComponentsQuestionBaseTitle').first().text()) ||
      collapseWhitespace($item.find("span").first().text());

    if (!isMeaningfulText(questionText, 2)) return;

    const options = $item
      .find('[role="radio"], [role="checkbox"], [role="option"]')
      .map((__, option) => collapseWhitespace($(option).text()))
      .get()
      .filter(isMeaningfulText);

    let questionType: GoogleFormsQuestionType = "short_text";
    if ($item.find("textarea").length > 0) questionType = "long_text";
    else if ($item.find('input[type="file"]').length > 0) questionType = "file_upload";
    else if ($item.find('[role="radiogroup"]').length > 0) questionType = "single_choice";
    else if ($item.find('[role="group"]').length > 0 && options.length > 1) {
      questionType = "multiple_choice";
    } else if ($item.find("select").length > 0) questionType = "dropdown";

    const required =
      $item.find('[aria-required="true"], .freebirdFormviewerComponentsQuestionBaseRequiredAsterisk').length > 0;
    const detectedCategories = detectCategories(
      [questionText, ...options].join(" "),
    );
    const riskTags: string[] = [];
    if (questionType === "file_upload") riskTags.push("file_upload");

    questions.push({
      id: `dom_q_${questionIndex}`,
      questionText,
      questionType,
      required,
      options,
      rows: [],
      columns: [],
      pageIndex: 0,
      questionIndex,
      detectedCategories,
      riskTags,
    });
    questionIndex += 1;
  });

  const noticeTexts = collectNoticeTexts(title, description, ...questions.map((q) => q.questionText));
  const answerable = questions.filter((q) => !q.isPageBreak);
  const isLimited =
    flags.loginRequired || flags.closedForm || answerable.length === 0;

  let limitedReason: string | undefined;
  if (flags.loginRequired) {
    limitedReason = "Google Forms에 로그인 또는 접근 권한이 필요합니다.";
  } else if (flags.closedForm) {
    limitedReason = "Google Forms 응답이 종료되었습니다.";
  } else if (answerable.length === 0) {
    limitedReason = "Google Forms HTML에서 질문을 확인하지 못했습니다.";
  }

  return {
    title,
    description,
    questions,
    noticeTexts,
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected: false,
    emailCollectionPossible: answerable.some((q) =>
      q.detectedCategories.includes("email"),
    ),
    extractionMethod: answerable.length > 0 ? "dom_fallback" : "none",
    partialScan: true,
    isLimited,
    limitedReason,
    warnings: ["DOM 텍스트 기반 fallback으로 일부 문항만 추출했습니다."],
  };
}

export function parseGoogleFormsHtml(html: string): GoogleFormsParseResult {
  const flags = detectFormFlags(html);
  const fbData = extractFbPublicLoadDataJson(html);

  if (fbData) {
    const parsed = parseFbPublicLoadData(fbData, flags);
    const answerable = parsed.questions.filter((q) => !q.isPageBreak);
    if (answerable.length > 0) {
      return {
        ...parsed,
        loginRequired: false,
        isLimited: flags.closedForm,
        limitedReason: flags.closedForm ? parsed.limitedReason : undefined,
      };
    }
    if (!parsed.isLimited || answerable.length > 0) {
      return parsed;
    }
  }

  const domParsed = parseDomFallback(html, flags);
  if (domParsed.questions.some((q) => !q.isPageBreak)) {
    return {
      ...domParsed,
      loginRequired: false,
      isLimited: flags.closedForm,
      limitedReason: flags.closedForm ? domParsed.limitedReason : undefined,
    };
  }

  if (fbData) {
    return parseFbPublicLoadData(fbData, flags);
  }

  return {
    title: "Google Forms 설문",
    description: "",
    questions: [],
    noticeTexts: [],
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected: false,
    emailCollectionPossible: false,
    extractionMethod: "none",
    partialScan: true,
    isLimited: true,
    limitedReason: flags.loginRequired
      ? "Google Forms에 로그인 또는 접근 권한이 필요합니다."
      : flags.closedForm
        ? "Google Forms 응답이 종료되었습니다."
        : "Google Forms HTML 파싱에 실패했습니다.",
    warnings: ["FB_PUBLIC_LOAD_DATA_ 및 DOM fallback 모두 실패했습니다."],
  };
}

export function toExtractionMethodLabel(method: GoogleFormsExtractionMethod): string {
  switch (method) {
    case "fb_public_data":
      return "공개 데이터 파싱";
    case "dom_fallback":
      return "DOM fallback";
    default:
      return "추출 실패";
  }
}
