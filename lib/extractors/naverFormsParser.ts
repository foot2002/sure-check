import * as cheerio from "cheerio";
import {
  collapseWhitespace,
  detectCategories,
  extractSentencesWithKeywords,
  isMeaningfulText,
  NOTICE_KEYWORDS,
} from "@/lib/extractors/htmlTextUtils";
import type {
  NaverFormsParsedQuestion,
  NaverFormsParseResult,
  NaverFormsQuestionType,
} from "@/lib/extractors/naverFormsTypes";
import {
  extractNaverSurveyId,
  NAVER_CLOSED_STATUSES,
  NAVER_FORMS_API_BASE,
  unwrapNestedNaverSurveyUrl,
} from "@/lib/extractors/naverFormsTypes";
import {
  htmlLooksClosedSurvey,
  htmlLooksLoginRequired,
} from "@/lib/scan/surveyStatusSignals";
import { readCapturedNetworkJsonFromHtml } from "@/lib/extractors/networkCaptureHtml";
import { safeUrlCheck } from "@/lib/security/urlSafety";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;

const LOGIN_MARKERS = [
  "nid.naver.com/nidlogin",
  "로그인이 필요",
  "로그인 후 이용",
  "접근 권한이 없",
  "권한이 필요",
];

const CLOSED_MARKERS = [
  "응답이 마감",
  "설문이 종료",
  "더 이상 응답",
  "응답 기간이 종료",
];

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

function richTextToPlain(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((block) => {
      const record = asRecord(block);
      return record ? asString(record.insert) : "";
    })
    .filter(Boolean)
    .join("\n");
}

function collectNoticeTexts(...texts: string[]): string[] {
  return extractSentencesWithKeywords(texts.filter(Boolean).join("\n"), NOTICE_KEYWORDS);
}

function detectFormFlags(html: string): {
  loginRequired: boolean;
  closedForm: boolean;
} {
  const lower = html.toLowerCase();
  return {
    loginRequired:
      htmlLooksLoginRequired(html, null) ||
      LOGIN_MARKERS.some((marker) => lower.includes(marker.toLowerCase())),
    closedForm:
      htmlLooksClosedSurvey(html, null) ||
      CLOSED_MARKERS.some((marker) => lower.includes(marker.toLowerCase())),
  };
}

function extractHtmlMeta(html: string): {
  title: string;
  description: string;
  apiBase: string;
} {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    "";
  const description =
    $('meta[property="og:description"]').attr("content") ||
    "";
  const apiBase =
    $("#nsv_root").attr("data-url") ||
    NAVER_FORMS_API_BASE;

  return {
    title: collapseWhitespace(title).replace(/ - 네이버 폼$/, ""),
    description: collapseWhitespace(description),
    apiBase: collapseWhitespace(apiBase),
  };
}

function extractEmbeddedJsonFromHtml(html: string): Record<string, unknown> | null {
  const markers = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/,
    /"pages"\s*:\s*\[/,
  ];

  for (const marker of markers) {
    const match = html.match(marker);
    if (!match?.[1]) continue;
    try {
      const parsed = JSON.parse(match[1]);
      if (asRecord(parsed)) return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

function mapNaverQuestionType(
  rawType: string,
  options?: Record<string, unknown>,
): NaverFormsQuestionType {
  const type = rawType.toUpperCase();
  const multiSelect = options?.multiSelect === true;

  if (type === "SHORT_TEXT" || type === "TEXT") return "short_text";
  if (type === "LONG_TEXT" || type === "PARAGRAPH" || type === "MULTI_LINE") {
    return "long_text";
  }
  if (type === "MULTI_CHOICE") return "multiple_choice";
  if (type === "CHOICE") return multiSelect ? "multiple_choice" : "single_choice";
  if (type === "DROPDOWN" || type === "LIST") return "dropdown";
  if (type === "LINEAR_SCALE" || type === "SCALE" || type === "RATING" || type === "NPS") {
    return "linear_scale";
  }
  if (type === "CHECKBOX_GRID") return "grid_multiple";
  if (type === "GRID" || type === "MATRIX") return "grid_single";
  if (type === "DATE") return "date";
  if (type === "TIME") return "time";
  if (type === "FILE" || type === "FILE_UPLOAD") return "file_upload";
  return "unknown";
}

function parseQuestionItems(items: unknown[]): string[] {
  return items
    .map((item) => asString(asRecord(item)?.value))
    .filter(isMeaningfulText);
}

function parseSurveyPayload(
  payload: Record<string, unknown>,
  htmlFlags: { loginRequired: boolean; closedForm: boolean },
  htmlMeta: { title: string; description: string },
): NaverFormsParseResult {
  const title = asString(payload.title) || htmlMeta.title || "네이버폼 설문";
  const description =
    richTextToPlain(payload.richDescription) ||
    asString(payload.description) ||
    htmlMeta.description;
  const status = asString(payload.status).toUpperCase();
  const closedForm = htmlFlags.closedForm || NAVER_CLOSED_STATUSES.has(status);

  const questions: NaverFormsParsedQuestion[] = [];
  let branchDetected = false;
  let emailCollectionPossible = false;
  let questionIndex = 0;

  for (const [pageIndex, pageRaw] of asArray(payload.pages).entries()) {
    const page = asRecord(pageRaw);
    if (!page) continue;

    for (const questionRaw of asArray(page.questions)) {
      const question = asRecord(questionRaw);
      if (!question) continue;

      const questionText = asString(question.title);
      if (!isMeaningfulText(questionText, 1)) continue;

      const options = asRecord(question.options);
      const items = parseQuestionItems(asArray(question.items));
      const auxiliary = [
        asString(question.description),
        richTextToPlain(question.richDescription),
      ]
        .filter(Boolean)
        .join("\n");
      const combined = [questionText, auxiliary].filter(Boolean).join(" ");
      const detectedCategories = detectCategories(combined);
      const questionType = mapNaverQuestionType(asString(question.type), options ?? undefined);
      const required = options?.required === true;
      const riskTags: string[] = [];

      if (questionType === "file_upload") riskTags.push("file_upload");
      if (detectedCategories.includes("email") || /email|이메일/i.test(combined)) {
        emailCollectionPossible = true;
      }

      for (const item of asArray(question.items)) {
        const itemRecord = asRecord(item);
        if (itemRecord?.skipOffset != null) {
          branchDetected = true;
        }
      }

      questions.push({
        id: String(question.id ?? `q_${questionIndex}`),
        questionText,
        description: auxiliary || undefined,
        questionType,
        required,
        options: items,
        pageIndex,
        questionIndex,
        detectedCategories,
        riskTags,
      });
      questionIndex += 1;
    }
  }

  const noticeTexts = collectNoticeTexts(title, description, ...questions.map((q) => q.questionText));
  const isLimited = htmlFlags.loginRequired || closedForm || questions.length === 0;

  let limitedReason: string | undefined;
  if (htmlFlags.loginRequired) {
    limitedReason = "네이버폼에 로그인 또는 접근 권한이 필요합니다.";
  } else if (closedForm) {
    limitedReason = "네이버폼 응답이 종료되었습니다.";
  } else if (questions.length === 0) {
    limitedReason = "네이버폼 질문 데이터를 추출하지 못했습니다.";
  }

  return {
    title,
    description,
    questions,
    noticeTexts,
    loginRequired: htmlFlags.loginRequired,
    closedForm,
    branchDetected,
    emailCollectionPossible,
    extractionMethod: "access_api",
    partialScan: closedForm,
    isLimited,
    limitedReason,
    warnings: [],
  };
}

function parseDomFallback(
  html: string,
  htmlMeta: { title: string; description: string },
  flags: { loginRequired: boolean; closedForm: boolean },
): NaverFormsParseResult {
  const $ = cheerio.load(html);
  const questions: NaverFormsParsedQuestion[] = [];
  let questionIndex = 0;

  $(
    ".question_area, .questionnaire_item, [class*='question_area'], [class*='formItem'], [qid], [data-qid]",
  ).each((_, el) => {
    const $item = $(el);
    const questionText =
      collapseWhitespace(
        $item
          .find(
            ".question_title, .title, .question, [class*='question_title'], h3, h4, label, legend",
          )
          .first()
          .text(),
      ) || collapseWhitespace($item.attr("aria-label") ?? "");

    if (!isMeaningfulText(questionText, 2)) return;

    const options = $item
      .find('[class*="choice"], [role="radio"], [role="checkbox"], option')
      .map((__, option) => collapseWhitespace($(option).text()))
      .get()
      .filter(isMeaningfulText);

    let questionType: NaverFormsQuestionType = "short_text";
    const className = ($item.attr("class") ?? "").toLowerCase();
    if (className.includes("paragraph") || $item.find("textarea").length > 0) {
      questionType = "long_text";
    } else if (className.includes("multichoice") || className.includes("checkbox")) {
      questionType = "multiple_choice";
    } else if (className.includes("singlechoice") || className.includes("radio")) {
      questionType = "single_choice";
    } else if ($item.find("select").length > 0) {
      questionType = "dropdown";
    } else if ($item.find('input[type="file"]').length > 0) {
      questionType = "file_upload";
    }

    const detectedCategories = detectCategories(questionText);
    const riskTags: string[] = [];
    if (questionType === "file_upload") riskTags.push("file_upload");

    questions.push({
      id: $item.attr("qid") ?? `dom_q_${questionIndex}`,
      questionText,
      questionType,
      required: $item.find('[aria-required="true"], .required').length > 0,
      options,
      pageIndex: 0,
      questionIndex,
      detectedCategories,
      riskTags,
    });
    questionIndex += 1;
  });

  const noticeTexts = collectNoticeTexts(htmlMeta.title, htmlMeta.description);
  const isLimited = flags.loginRequired || flags.closedForm || questions.length === 0;

  return {
    title: htmlMeta.title || "네이버폼 설문",
    description: htmlMeta.description,
    questions,
    noticeTexts,
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected: false,
    emailCollectionPossible: questions.some((q) => q.detectedCategories.includes("email")),
    extractionMethod: questions.length > 0 ? "dom_fallback" : "none",
    partialScan: true,
    isLimited,
    limitedReason: isLimited
      ? flags.loginRequired
        ? "네이버폼에 로그인 또는 접근 권한이 필요합니다."
        : flags.closedForm
          ? "네이버폼 응답이 종료되었습니다."
          : "네이버폼 HTML에서 질문을 확인하지 못했습니다."
      : undefined,
    warnings: ["DOM fallback으로 일부 문항만 추출했습니다."],
  };
}

export async function fetchNaverFormAccessData(
  surveyId: string,
  refererUrl: string,
  apiBase = NAVER_FORMS_API_BASE,
): Promise<{ ok: boolean; data?: Record<string, unknown>; limitedReason?: string }> {
  const apiUrl = `${apiBase.replace(/\/$/, "")}/surveys/${surveyId}/access`;
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
        Origin: "https://form.naver.com",
      },
    });

    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      return { ok: false, limitedReason: "네이버폼에 로그인 또는 접근 권한이 필요합니다." };
    }

    if (!response.ok) {
      return {
        ok: false,
        limitedReason: `네이버폼 API 응답 오류(HTTP ${response.status})`,
      };
    }

    const text = await response.text();
    if (text.length > MAX_BYTES) {
      return { ok: false, limitedReason: "네이버폼 API 응답 크기가 2MB 제한을 초과했습니다." };
    }

    const data = JSON.parse(text) as unknown;
    const record = asRecord(data);
    if (!record) {
      return { ok: false, limitedReason: "네이버폼 API JSON 파싱에 실패했습니다." };
    }

    return { ok: true, data: record };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, limitedReason: "네이버폼 API 응답 시간 초과(8초)" };
    }
    return { ok: false, limitedReason: "네이버폼 API fetch 중 오류가 발생했습니다." };
  }
}

async function resolveNaverFormTargetUrl(finalUrl: string): Promise<string> {
  const nested = unwrapNestedNaverSurveyUrl(finalUrl);
  const candidate = nested || finalUrl;
  if (/form\.naver\.com\/response\//i.test(candidate)) return candidate;
  if (!/naver\.me\//i.test(candidate)) return finalUrl;

  const safety = await safeUrlCheck(candidate);
  if (!safety.safe) return finalUrl;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(candidate, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "SURE-Check/1.0 (Privacy Survey Scanner)",
      },
    });
    clearTimeout(timeout);
    if (response.url && /form\.naver\.com/i.test(response.url)) {
      return response.url;
    }
  } catch {
    clearTimeout(timeout);
  }
  return finalUrl;
}

export async function parseNaverFormsDocument(
  html: string,
  finalUrl: string,
): Promise<NaverFormsParseResult> {
  const resolvedUrl = await resolveNaverFormTargetUrl(finalUrl);
  const htmlMeta = extractHtmlMeta(html);
  const flags = detectFormFlags(html);
  const surveyId =
    extractNaverSurveyId(resolvedUrl) || extractNaverSurveyId(finalUrl);
  const embedded = extractEmbeddedJsonFromHtml(html);

  if (embedded && (embedded.pages || asString(embedded.status))) {
    const parsed = parseSurveyPayload(embedded, flags, htmlMeta);
    if (parsed.questions.length > 0) {
      return {
        ...parsed,
        extractionMethod: "embedded_json",
        loginRequired: false,
        isLimited: parsed.closedForm,
        limitedReason: parsed.closedForm ? parsed.limitedReason : undefined,
        surveyId: surveyId ?? undefined,
      };
    }
    if (parsed.closedForm) {
      return {
        ...parsed,
        extractionMethod: "embedded_json",
        loginRequired: false,
        isLimited: true,
        limitedReason: parsed.limitedReason || "네이버폼 응답이 종료되었습니다.",
        surveyId: surveyId ?? undefined,
      };
    }
  }

  // Prefer a survey payload with pages/status even when questions are empty
  // (FINISHED/CLOSED APIs return pages:[] — must not fall through to JS-limited).
  const preferSurveyPayload = (
    parsed: NaverFormsParseResult,
    method: NaverFormsParseResult["extractionMethod"],
    warnings: string[] = [],
  ): NaverFormsParseResult | null => {
    if (parsed.questions.length > 0) {
      return {
        ...parsed,
        extractionMethod: method,
        loginRequired: false,
        isLimited: parsed.closedForm,
        limitedReason: parsed.closedForm ? parsed.limitedReason : undefined,
        surveyId: surveyId ?? undefined,
        warnings: [...(parsed.warnings || []), ...warnings],
      };
    }
    if (parsed.closedForm) {
      return {
        ...parsed,
        extractionMethod: method,
        loginRequired: false,
        isLimited: true,
        limitedReason: parsed.limitedReason || "네이버폼 응답이 종료되었습니다.",
        surveyId: surveyId ?? undefined,
        warnings: [...(parsed.warnings || []), ...warnings],
      };
    }
    return null;
  };

  // Browser fallback may inject XHR/fetch JSON (survey-api /access).
  for (const captured of readCapturedNetworkJsonFromHtml(html)) {
    const record =
      typeof captured.json === "object" && captured.json !== null
        ? (captured.json as Record<string, unknown>)
        : null;
    if (!record) continue;
    // Unwrap common envelopes if present.
    const payload =
      asRecord(record.result) ||
      asRecord(record.data) ||
      asRecord(record.survey) ||
      asRecord(record.form) ||
      record;
    const parsed = parseSurveyPayload(payload, flags, htmlMeta);
    const preferred = preferSurveyPayload(parsed, "access_api", [
      `browser_network_capture:${captured.url.slice(0, 120)}`,
    ]);
    if (preferred) return preferred;
  }

  if (surveyId) {
    const access = await fetchNaverFormAccessData(
      surveyId,
      resolvedUrl || finalUrl,
      htmlMeta.apiBase,
    );
    if (access.ok && access.data) {
      const payload =
        asRecord(access.data.result) ||
        asRecord(access.data.data) ||
        asRecord(access.data.survey) ||
        asRecord(access.data.form) ||
        access.data;
      const parsed = parseSurveyPayload(payload, flags, htmlMeta);
      const preferred = preferSurveyPayload(parsed, "access_api");
      if (preferred) return preferred;
    }

    if (!access.ok && access.limitedReason?.includes("로그인")) {
      return {
        title: htmlMeta.title || "네이버폼 설문",
        description: htmlMeta.description,
        questions: [],
        noticeTexts: [],
        loginRequired: true,
        closedForm: flags.closedForm,
        branchDetected: false,
        emailCollectionPossible: false,
        extractionMethod: "none",
        partialScan: true,
        isLimited: true,
        limitedReason: access.limitedReason,
        warnings: [access.limitedReason],
        surveyId,
      };
    }
  }

  const domParsed = parseDomFallback(html, htmlMeta, flags);
  if (domParsed.questions.length > 0) {
    return {
      ...domParsed,
      loginRequired: false,
      isLimited: flags.closedForm,
      surveyId: surveyId ?? undefined,
    };
  }

  return {
    title: htmlMeta.title || "네이버폼 설문",
    description: htmlMeta.description,
    questions: [],
    noticeTexts: collectNoticeTexts(htmlMeta.title, htmlMeta.description),
    loginRequired: flags.loginRequired,
    closedForm: flags.closedForm,
    branchDetected: false,
    emailCollectionPossible: false,
    extractionMethod: "none",
    partialScan: true,
    isLimited: true,
    limitedReason: flags.loginRequired
      ? "네이버폼에 로그인 또는 접근 권한이 필요합니다."
      : flags.closedForm
        ? "네이버폼 응답이 종료되었습니다."
        : "JavaScript 실행 후 문항이 로딩되는 구조로 fetch 기반 추출이 제한됩니다.",
    warnings: [
      "HTML, 공개 API, DOM fallback 모두에서 문항을 확인하지 못했습니다.",
    ],
    surveyId: surveyId ?? undefined,
  };
}
