import type {
  ExtractedSurveyDocument,
  ExtractedSurveyQuestion,
} from "@/lib/file-extractors/fileExtractorTypes";
import {
  detectCategories,
  isDirectPiiSolicitation,
  isPersonalDataCategory,
} from "@/lib/extractors/htmlTextUtils";

const LIKERT_OPTIONS = [
  "매우 불만족",
  "불만족",
  "보통",
  "만족",
  "매우 만족",
] as const;

const AGREEMENT_OPTIONS = [
  "전혀 아니다",
  "아니다",
  "보통이다",
  "그렇다",
  "매우 그렇다",
] as const;

const NOISE_LINE_RE =
  /원본\s*그림의\s*이름|원본\s*그림의\s*크기|\.bmp|\.png|\.jpe?g|^\d+(?:\.\d+)?\s*mm$|^#?[0-9A-Fa-f]{6}$|^(?:UTF-?8|SOLID|TABLE|PICTURE|REAL_PIC|PARA|COLUMN|ABSOLUTE|SHOW_ALL|BOTH_SIDES|TOP_AND_BOTTOM|HWPUNIT)$/i;

function isNoiseLine(line: string): boolean {
  if (!line) return true;
  if (NOISE_LINE_RE.test(line)) return true;
  if (/^\d+(?:\.\d+)?$/.test(line) && line.length <= 12) return true;
  if (/^[A-Z_]{3,}$/.test(line)) return true;
  if (/^그림입니다\.?$/.test(line)) return true;
  return false;
}

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isNoiseLine(line));
}

function detectToolFromText(
  text: string,
): ExtractedSurveyDocument["detectedToolFromText"] {
  if (/forms\.gle|docs\.google\.com\/forms|google\.com\/forms/i.test(text)) {
    return "google_forms";
  }
  if (/form\.naver\.com|office\.naver\.com\/form/i.test(text)) {
    return "naver_forms";
  }
  if (/moaform\.com|surveyl\.ink|answer\.moaform/i.test(text)) {
    return "moaform";
  }
  return "unknown";
}

function findFirstMatch(lines: string[], patterns: RegExp[]): string | undefined {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]?.trim()) return match[1].trim();
      if (pattern.test(line) && !match?.[1]) {
        const parts = line.split(/[:：]/);
        if (parts[1]?.trim()) return parts[1].trim();
      }
    }
  }
  return undefined;
}

function extractNoticeBlock(lines: string[]): string | undefined {
  const startIndex = lines.findIndex((line) =>
    /개인정보\s*(수집|이용|처리)|수집\s*[·・‧]\s*이용|보유기간|파기|동의|거부권|제3자\s*제공|처리위탁|국외이전/.test(
      line,
    ),
  );
  if (startIndex < 0) return undefined;
  return lines.slice(startIndex, startIndex + 25).join("\n");
}

function isOptionLine(line: string): boolean {
  const compact = line.replace(/\s+/g, "");
  if (/^[-–—_·.]{1,8}$/.test(compact)) return false;
  if (/^(해당\s*없음|없음|모름)$/.test(line) && line.length <= 10) return false;
  return (
    /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(line) ||
    /^[○●◎□■☐☑]\s*/.test(line) ||
    /^[가나다라마바사아자차카타파하]\s*[.)．]/.test(line) ||
    /^[ⓐⓑⓒⓓⓔ]/.test(line) ||
    /^[-•▪◦]\s+\S+/.test(line) ||
    /^(매우\s*만족|만족|보통|불만족|매우\s*불만족|예|아니오|남|여|남성|여성|동의|비동의)\b/.test(
      line,
    ) ||
    /^\d+\s*대\b/.test(line)
  );
}

function isQuestionLine(line: string): boolean {
  if (isOptionLine(line)) return false;
  if (isNoiseLine(line)) return false;
  return (
    /^(?:Q\s*)?\d+(?:\s*[-–]\s*\d+)?\s*[.)．、]\s*\S+/.test(line) ||
    /^Q\d+(?:\s*[-–]\s*\d+)?\s*[.)．、:]\s*\S+/i.test(line) ||
    /^S(?:Q)?\s*\d+\s*[.)．、:]\s*\S+/i.test(line) ||
    /^D(?:Q)?\s*\d+\s*[.)．、:]\s*\S+/i.test(line) ||
    /^문항\s*\d+/.test(line) ||
    /^질문\s*\d+/.test(line) ||
    /^\[\s*문항\s*\d+\s*\]/.test(line) ||
    /^문\s*\d+/.test(line)
  );
}

function stripQuestionPrefix(line: string): { number?: number; title: string } {
  const numbered = line.match(
    /^(?:Q\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\s*[.)．、:]\s*(.+)$|^(?:DQ|SQ|S|D)\s*(\d+)\s*[.)．、:]\s*(.+)$|^(?:문항|질문|문)\s*(\d+)\s*[.)．:]?\s*(.+)$|^\[\s*문항\s*(\d+)\s*\]\s*(.+)$/i,
  );
  if (numbered) {
    const number = Number(
      numbered[1] || numbered[4] || numbered[6] || numbered[8],
    );
    const title = (
      numbered[3] ||
      numbered[5] ||
      numbered[7] ||
      numbered[9] ||
      ""
    ).trim();
    return { number: Number.isFinite(number) ? number : undefined, title };
  }
  return { title: line };
}

function isRequiredHint(text: string): boolean {
  return /필수|required|반드시\s*응답|반드시\s*작성/i.test(text);
}

function isOptionalHint(text: string): boolean {
  return /선택\s*사항|선택응답|해당\s*시|optional/i.test(text);
}

function guessTitle(lines: string[]): string {
  const explicit = findFirstMatch(lines, [
    /(?:설문명|조사명|설문\s*제목|조사\s*제목)\s*[:：]\s*(.+)/,
  ]);
  if (explicit) return explicit;

  const candidate = lines.find((line) =>
    /(설문|조사|신청서|수요조사|만족도|의견\s*수렴|진단)/.test(line),
  );
  return candidate ?? lines[0] ?? "업로드된 설문 파일";
}

const PII_FIELD_LABEL_PATTERN =
  /^(이름|성명|성함|연락처|휴대\s*전화|휴대폰|핸드폰(?:\s*번호)?|전화번호|전화|이메일|e-?mail|주소|생년월일|소속|회사명)$/i;

function isPrivacyConsentLine(line: string): boolean {
  if (/개인정보\s*수집\s*·?\s*이용\s*동의/.test(line)) return true;
  const hasAgree = /(^|[^비])동의/.test(line) || /동의함|동의합니다/.test(line);
  const hasDisagree = /비동의|동의하지\s*않|거부/.test(line);
  return hasAgree && hasDisagree;
}

function isPiiFieldOrSolicitation(line: string): boolean {
  if (
    /개인정보를 제공받는 자|수집\s*·?\s*이용\s*목적|보유\s*(및|&)?\s*이용\s*기간|귀하는 개인정보/.test(
      line,
    ) &&
    line.length > 80
  ) {
    return false;
  }
  if (PII_FIELD_LABEL_PATTERN.test(line)) return true;
  if (isDirectPiiSolicitation(line)) return true;
  if (
    /(답례품|경품|상품권|이벤트).{0,40}(연락처|성함|성명|이름|핸드폰|휴대폰|전화)/.test(
      line,
    )
  ) {
    return true;
  }
  if (
    /(연락처|성함|성명|이름|핸드폰|휴대폰).{0,20}(작성|입력|기재|남겨)/.test(line)
  ) {
    return true;
  }
  const cats = detectCategories(line).filter(isPersonalDataCategory);
  return (
    line.length <= 60 &&
    cats.some((c) =>
      ["name", "phone", "email", "address", "birthdate"].includes(c),
    ) &&
    !/개인정보|수집\s*목적|보유기간|파기|동의/.test(line)
  );
}

function splitCells(line: string): string[] {
  return line
    .split(/\s*\|\s*/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function isLikertHeaderRow(cells: string[]): boolean {
  const joined = cells.join(" ");
  const scaleHits = cells.filter((cell) =>
    /매우\s*불만족|불만족|보통|만족|매우\s*만족|전혀\s*아니다|아니다|그렇다|매우\s*그렇다/.test(
      cell,
    ),
  ).length;
  return scaleHits >= 3 || (/항목|항\s*목/.test(joined) && scaleHits >= 2);
}

function scaleOptionsFromHeader(cells: string[]): string[] {
  const labels = cells.filter((cell) =>
    /불만족|만족|보통|아니다|그렇다/.test(cell),
  );
  if (labels.length >= 3) return labels;
  if (/전혀\s*아니다|그렇다/.test(cells.join(" "))) return [...AGREEMENT_OPTIONS];
  return [...LIKERT_OPTIONS];
}

function isScaleOnlyCell(cell: string): boolean {
  return (
    /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(cell) ||
    /^(매우\s*)?(불)?만족$/.test(cell) ||
    /^보통(?:이다)?$/.test(cell) ||
    /^(전혀\s*)?아니다$/.test(cell) ||
    /^(매우\s*)?그렇다$/.test(cell)
  );
}

function looksLikeStatement(cell: string): boolean {
  if (cell.length < 8) return false;
  if (isOptionLine(cell)) return false;
  if (isScaleOnlyCell(cell)) return false;
  if (/^(프로그램|물리적|상호작용|홍보|수준|환경|항목|구분|사회|경제|심미|항\s*목)/.test(cell) && cell.length <= 14) {
    return false;
  }
  // Incomplete matrix stems: "보령컵…개최는(로)", "보령컵…대회는"
  if (/\(로\)\s*$/.test(cell) || /(?:는|은|이|가)\s*$/.test(cell)) return false;
  return (
    /(다|까|요|습니다|습니까|이다|인가|것이다)\s*[.…]?$/.test(cell) ||
    (/보령|행사|프로그램|만족|접근성|홍보|요원|환경|다양|매끄럽/.test(cell) &&
      /(다|요|까|것이다)\s*$/.test(cell))
  );
}

function parseTableRowLine(line: string): {
  kind: "options" | "likert_question" | "header" | "ignore";
  title?: string;
  options?: string[];
  useScale?: boolean;
} | null {
  if (!line.includes("|")) return null;
  const cells = splitCells(line);
  if (cells.length < 2) return null;
  if (isLikertHeaderRow(cells)) return { kind: "header" };

  if (cells.every((cell) => isOptionLine(cell) || isScaleOnlyCell(cell))) {
    return {
      kind: "options",
      options: cells.map((cell) =>
        cell.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").trim(),
      ),
    };
  }

  const contentCells = cells.filter((cell) => !isScaleOnlyCell(cell));
  const statement =
    contentCells.find((cell) => /(다|것이다|까|요|습니다)\s*[.…]?$/.test(cell) && cell.length >= 8) ||
    contentCells.find((cell) => looksLikeStatement(cell)) ||
    contentCells
      .filter((cell) => cell.length >= 12 && !/(?:는|은|이|가|\(로\))\s*$/.test(cell))
      .sort((a, b) => b.length - a.length)[0];

  if (statement && (looksLikeStatement(statement) || /(다|것이다|까|요)\s*$/.test(statement))) {
    const stem = contentCells.find((cell) => /(?:는|은|\(로\))\s*$/.test(cell));
    const title =
      stem && statement !== stem && !statement.includes(stem.replace(/\s*\(로\)\s*$/, "").slice(-6))
        ? `${stem.replace(/\s*\(로\)\s*$/, "")} ${statement}`.replace(/\s+/g, " ").trim()
        : statement;
    const hasScale = cells.some((cell) => isScaleOnlyCell(cell));
    return {
      kind: "likert_question",
      title,
      useScale: hasScale,
    };
  }

  return { kind: "ignore" };
}

function normalizeOptionText(line: string): string[] {
  const option = line
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩가-하ⓐ-ⓔ○●◎□■☐☑]\s*[.)．]?\s*/, "")
    .replace(/^[-•▪◦]\s+/, "")
    .trim();
  if (!option || /^[-–—_·.]{1,8}$/.test(option.replace(/\s+/g, ""))) return [];
  const parts = option
    .split(/\s*[○●◎□■☐☑]\s*/)
    .map((part) => part.trim())
    .filter(
      (part) => part && !/^[-–—_·.]{1,8}$/.test(part.replace(/\s+/g, "")),
    );
  return parts.length > 1 ? parts : [option];
}

function makeQuestion(
  line: string,
  extras?: Partial<ExtractedSurveyQuestion>,
): ExtractedSurveyQuestion {
  const parsed = stripQuestionPrefix(line);
  const title = (parsed.title || line).trim();
  const cats = detectCategories(`${title}\n${line}`);
  return {
    questionNumber: parsed.number,
    title: title || line,
    rawText: line,
    required: isRequiredHint(line) && !isOptionalHint(line),
    options: [],
    detectedPersonalDataTypes: cats,
    confidence: extras?.confidence ?? "medium",
    ...extras,
  };
}

function isGarbageQuestion(question: ExtractedSurveyQuestion): boolean {
  const title = question.title.trim();
  if (!title || title.length < 2) return true;
  if (isNoiseLine(title)) return true;
  if (/^\d+$/.test(title)) return true;
  if (/원본\s*그림|\.bmp|\.png/i.test(title)) return true;
  if (/^\d+(?:\.\d+)?\s*mm$/i.test(title)) return true;
  if (/안녕하십니까|설문에\s*응답해\s*주셔서|대단히\s*감사/.test(title)) return true;
  if (/참여자\s*,\s*관람객|대회참여자|조사\s*대상/.test(title) && title.length <= 40) {
    return true;
  }
  if (
    title.length <= 8 &&
    /^(관광객|참여자|관람객|프로그램|홍보|환경|상호작용)$/.test(title)
  ) {
    return true;
  }
  // Title-only lines without a prompt
  if (
    /만족도\s*및\s*파급효과\s*조사|만족도\s*조사\s*설문/.test(title) &&
    !/[?？]$/.test(title) &&
    question.options.length === 0
  ) {
    return true;
  }
  return false;
}

/**
 * 추출된 원문 텍스트를 설문 구조로 정리한다.
 */
export function parseSurveyText(
  rawText: string,
  base: Pick<
    ExtractedSurveyDocument,
    "fileName" | "fileExtension" | "mimeType"
  > & {
    extractionLimitations?: string[];
    metadata?: Partial<ExtractedSurveyDocument["metadata"]>;
  },
): ExtractedSurveyDocument {
  const lines = cleanLines(rawText);
  const text = lines.join("\n");
  const limitations = [...(base.extractionLimitations ?? [])];

  const questions: ExtractedSurveyQuestion[] = [];
  let current: ExtractedSurveyQuestion | null = null;
  let activeScaleOptions: string[] = [...LIKERT_OPTIONS];

  const pushCurrent = () => {
    if (current) {
      questions.push(current);
      current = null;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    const tableRow = parseTableRowLine(line);
    if (tableRow) {
      if (tableRow.kind === "header") {
        const cells = splitCells(line);
        activeScaleOptions = scaleOptionsFromHeader(cells);
        continue;
      }
      if (tableRow.kind === "ignore") continue;
      if (tableRow.kind === "options") {
        if (current && tableRow.options?.length) {
          current.options.push(...tableRow.options.filter(Boolean));
          current.rawText += `\n${line}`;
        }
        continue;
      }
      if (tableRow.kind === "likert_question" && tableRow.title) {
        pushCurrent();
        current = makeQuestion(tableRow.title, { confidence: "medium" });
        if (tableRow.useScale) {
          current.options.push(...activeScaleOptions);
        } else if (tableRow.options?.length) {
          current.options.push(...tableRow.options);
        }
        current.rawText = line;
        pushCurrent();
        continue;
      }
    }

    if (isQuestionLine(line)) {
      pushCurrent();
      current = makeQuestion(line);
      continue;
    }

    if (isPrivacyConsentLine(line)) {
      pushCurrent();
      const context = lines.slice(Math.max(0, index - 4), index + 1).join("\n");
      const consent = makeQuestion(
        /동의/.test(line) && line.length <= 40
          ? `개인정보 수집·이용 동의 (${line})`
          : line,
        { confidence: "high" },
      );
      const contextCats = detectCategories(context).filter(isPersonalDataCategory);
      consent.detectedPersonalDataTypes = [
        ...new Set([...consent.detectedPersonalDataTypes, ...contextCats]),
      ];
      questions.push(consent);
      continue;
    }

    if (isPiiFieldOrSolicitation(line)) {
      pushCurrent();
      current = makeQuestion(line, {
        confidence: PII_FIELD_LABEL_PATTERN.test(line) ? "high" : "medium",
      });
      continue;
    }

    if (current && isOptionLine(line)) {
      current.options.push(...normalizeOptionText(line));
      current.rawText += `\n${line}`;
      continue;
    }

    // Open numeric age field under DQ age questions.
    if (current && /만\s*\(.*\)\s*세/.test(line)) {
      current.rawText += `\n${line}`;
      if (current.options.length === 0) current.options.push(line);
      const cats = detectCategories(`${current.title}\n${line}`);
      current.detectedPersonalDataTypes = [
        ...new Set([...current.detectedPersonalDataTypes, ...cats]),
      ];
      continue;
    }

    if (current && /필수|선택|required|optional/i.test(line) && line.length < 40) {
      if (isRequiredHint(line)) current.required = true;
      if (isOptionalHint(line)) current.required = false;
      current.rawText += `\n${line}`;
      continue;
    }

    // Unnumbered statement rows (common in HWPX Likert tables without pipes).
    if (
      !current &&
      looksLikeStatement(line) &&
      !/다음은|바랍니다|작성하여|평가해|해당되는|일환으로|목적으로\s*작성|알아보기\s*위한/.test(
        line,
      ) &&
      line.length <= 120
    ) {
      questions.push(makeQuestion(line, { confidence: "low" }));
      continue;
    }

    if (
      !current &&
      line.length <= 80 &&
      detectCategories(line).some(isPersonalDataCategory) &&
      !/개인정보|수집\s*목적|보유기간|파기|동의/.test(line)
    ) {
      questions.push(makeQuestion(line, { confidence: "low" }));
    }
  }

  pushCurrent();

  const notice = extractNoticeBlock(lines);
  const subject = findFirstMatch(lines, [
    /(?:주관|주최|시행|조사기관|운영기관|담당기관|기관명|회사명)\s*[:：]\s*(.+)/,
  ]);
  const department = findFirstMatch(lines, [
    /(?:담당부서|부서명|부서)\s*[:：]\s*(.+)/,
  ]);
  const contact = findFirstMatch(lines, [
    /(?:담당자|문의|연락처|이메일|전화|대표번호)\s*[:：]\s*(.+)/,
  ]);
  const title = guessTitle(lines);

  const filteredQuestions = questions.filter((question) => {
    if (isGarbageQuestion(question)) return false;
    if (question.title === title) return false;
    if (subject && question.title.includes(subject) && question.title.length < 40) {
      return false;
    }
    return !/(?:주관|주최|시행|조사기관|운영기관)\s*[:：]/.test(question.rawText);
  });

  // Deduplicate identical titles keeping the richer options set.
  const deduped: ExtractedSurveyQuestion[] = [];
  const seen = new Map<string, number>();
  for (const question of filteredQuestions) {
    const key = question.title.replace(/\s+/g, "");
    const existing = seen.get(key);
    if (existing == null) {
      seen.set(key, deduped.length);
      deduped.push(question);
      continue;
    }
    if (question.options.length > deduped[existing]!.options.length) {
      deduped[existing] = question;
    }
  }

  const status: ExtractedSurveyDocument["extractionStatus"] =
    deduped.length >= 2
      ? "success"
      : deduped.length === 1 || text.length > 400
        ? "partial"
        : "failed";

  if (deduped.length === 0 && questions.length > 0) {
    limitations.push("문항으로 보이는 줄이 제목·안내와 겹쳐 제외되었습니다.");
  }

  return {
    sourceType: "file",
    fileName: base.fileName,
    fileExtension: base.fileExtension,
    mimeType: base.mimeType,
    extractedText: text,
    title,
    detectedSubject: subject,
    detectedDepartment: department,
    detectedContact: contact,
    detectedNoticeText: notice,
    detectedPrivacyNoticeText: notice,
    questions: deduped,
    extractionStatus: status,
    extractionLimitations: limitations,
    detectedToolFromText: detectToolFromText(text),
    metadata: {
      textLength: text.length,
      ...base.metadata,
    },
  };
}
