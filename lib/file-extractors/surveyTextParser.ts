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

const IMPORTANCE_OPTIONS = [
  "매우 낮음",
  "낮음",
  "보통",
  "높음",
  "매우 높음",
] as const;

const SCALE_LABEL_RE =
  /매우\s*불만족|불만족|보통(?:이다)?|만족|매우\s*만족|전혀\s*그렇지\s*않다|그렇지\s*않다|전혀\s*아니다|아니다|매우\s*그렇다|그렇다|매우\s*낮음|낮음|높음|매우\s*높음/;

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

function isMatrixStemPrompt(line: string): boolean {
  if (
    /아래\s*제시/.test(line) &&
    /(중요|필요|선택해\s*주십시오|응답을\s*선택)/.test(line)
  ) {
    return true;
  }
  // Instructor/course evaluation grids: "Q1-1. …강사에 대해서 평가해주시기 바랍니다."
  if (
    /^Q\s*\d+/i.test(line) &&
    /(평가해\s*주시기\s*바랍니다|대해서\s*평가|대해\s*평가)/.test(line)
  ) {
    return true;
  }
  return false;
}

function extractQuestionLabel(line: string): string | null {
  const match = line.match(/^(Q\s*\d+(?:\s*[-–]\s*\d+)?)/i);
  return match?.[1]?.replace(/\s+/g, "") ?? null;
}

function stripQuestionPrefix(line: string): { number?: number; title: string } {
  const labeled = line.match(
    /^(Q\s*\d+(?:\s*[-–]\s*\d+)?)\s*[.)．、:]\s*(.+)$/i,
  );
  if (labeled) {
    const label = labeled[1]!.replace(/\s+/g, "");
    const rest = labeled[2]!.trim();
    const number = Number(label.match(/\d+/)?.[0]);
    return {
      number: Number.isFinite(number) ? number : undefined,
      title: `${label}) ${rest}`,
    };
  }
  const numbered = line.match(
    /^(?:DQ|SQ|S|D)\s*(\d+)\s*[.)．、:]\s*(.+)$|^(?:문항|질문|문)\s*(\d+)\s*[.)．:]?\s*(.+)$|^\[\s*문항\s*(\d+)\s*\]\s*(.+)$|^(?:Q\s*)?(\d+)\s*[.)．、:]\s*(.+)$/i,
  );
  if (numbered) {
    const number = Number(
      numbered[1] || numbered[3] || numbered[5] || numbered[7],
    );
    const title = (
      numbered[2] ||
      numbered[4] ||
      numbered[6] ||
      numbered[8] ||
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
  if (
    /개인정보.{0,24}동의하/.test(line) &&
    /(예|아니요|아니오|비동의)/.test(line)
  ) {
    return true;
  }
  if (
    /consent to (?:the )?collection and use of personal information/i.test(line) &&
    /(yes|no)\b/i.test(line)
  ) {
    return true;
  }
  const hasAgree = /(^|[^비])동의/.test(line) || /동의함|동의합니다/.test(line);
  const hasDisagree = /비동의|동의하지\s*않|거부|아니요|아니오/.test(line);
  return hasAgree && hasDisagree;
}

function isBracketQuestionLine(line: string): boolean {
  return /^\[\s*(?:질문|Q|Question)\s*\]/i.test(line);
}

function isCompetencyItemLabel(line: string): boolean {
  // e.g. "1-1. 자아인식" / "1-1. self-awareness"
  return (
    /^\d+\s*[-–]\s*\d+\s*[.)．]\s*\S+/.test(line) && !isBracketQuestionLine(line)
  );
}

function isLevelDescriptorLine(line: string): boolean {
  return (
    /^\(\s*[1-5]\s*수준\s*\)/.test(line) || /^\(\s*level\s*[1-5]\s*\)/i.test(line)
  );
}

function isCompetencyStructureNoise(line: string): boolean {
  return (
    /^(질문|및|행동기준척도|상황|스토리|하위역량|본인의\s*수준)$/.test(line) ||
    /^(Questions?|and|behaviorally|anchored|rating\s*scale|Situational|story|Your\s*level)$/i.test(
      line,
    ) ||
    /^Subcategory\b/i.test(line) ||
    /^--\s*\d+\s*of\s*\d+\s*--$/i.test(line) ||
    /^-\s*\d+\s*-$/.test(line) ||
    /^[1-5](?:\s+[1-5]){4}$/.test(line) ||
    /^[WwIiEeSs]\s*\([^)]+\)$/.test(line)
  );
}

function skipCompetencyNoise(lines: string[], start: number): number {
  let cursor = start;
  while (cursor < lines.length && isCompetencyStructureNoise(lines[cursor]!)) {
    cursor += 1;
  }
  return cursor;
}

function stripBracketQuestionPrefix(line: string): string {
  return line.replace(/^\[\s*(?:질문|Q|Question)\s*\]\s*/i, "").trim();
}

function joinPdfWrappedText(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`.replace(/\s+/g, " ").trim();
}

function levelOptionLabel(line: string): string {
  const ko = line.match(/^\(\s*([1-5])\s*수준\s*\)/);
  if (ko) return `${ko[1]}수준`;
  const en = line.match(/^\(\s*level\s*([1-5])\s*\)/i);
  if (en) return `level ${en[1]}`;
  return line;
}

function defaultLevelOptions(sampleRaw: string[]): string[] {
  if (sampleRaw.some((raw) => /^\(\s*level\s*[1-5]\s*\)/i.test(raw))) {
    return ["level 5", "level 4", "level 3", "level 2", "level 1"];
  }
  return ["5수준", "4수준", "3수준", "2수준", "1수준"];
}

function looksLikeCompetencyPrompt(line: string): boolean {
  if (
    isLevelDescriptorLine(line) ||
    isCompetencyItemLabel(line) ||
    isCompetencyStructureNoise(line) ||
    isBracketQuestionLine(line)
  ) {
    return false;
  }
  if (line.length < 12 || line.length > 320) return false;
  if (/^○|^Consent to|^Information collected|^Purpose of|^The duration/i.test(line)) {
    return false;
  }
  return (
    /[?？]/.test(line) ||
    /^(What|How|To what extent|Do you|When|Are you|You need|Please)\b/i.test(
      line,
    ) ||
    /습니까|입니까|인가요|어느\s*정도|어떻게|얼마나|어느\s*정도입/.test(line)
  );
}

/**
 * Competency diagnostic PDFs: label like "1-1. self-awareness" then
 * "[질문]"/"[Q]" (sometimes omitted) then "(5수준)"/"(level 5)" rows.
 * Page breaks often interrupt prompts/levels — those markers are skipped.
 */
function extractBracketLabeledQuestions(
  lines: string[],
): ExtractedSurveyQuestion[] | null {
  const questions: ExtractedSurveyQuestion[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!isCompetencyItemLabel(line)) {
      index += 1;
      continue;
    }

    const label = line.replace(/\s+/g, " ").trim();
    let cursor = skipCompetencyNoise(lines, index + 1);

    let prompt = "";
    let hadBracket = false;
    if (cursor < lines.length && isBracketQuestionLine(lines[cursor]!)) {
      prompt = stripBracketQuestionPrefix(lines[cursor]!);
      hadBracket = true;
      cursor += 1;
    } else if (
      cursor < lines.length &&
      looksLikeCompetencyPrompt(lines[cursor]!)
    ) {
      prompt = lines[cursor]!;
      cursor += 1;
    } else {
      index += 1;
      continue;
    }

    while (cursor < lines.length) {
      cursor = skipCompetencyNoise(lines, cursor);
      if (cursor >= lines.length) break;
      if (isLevelDescriptorLine(lines[cursor]!)) break;
      if (isCompetencyItemLabel(lines[cursor]!)) break;
      if (isBracketQuestionLine(lines[cursor]!)) break;
      if (/^※/.test(lines[cursor]!)) break;
      if (
        /개인정보|Consent to collection|personal information/i.test(
          lines[cursor]!,
        )
      ) {
        break;
      }
      if (
        looksLikeCompetencyPrompt(lines[cursor]!) ||
        lines[cursor]!.length <= 140
      ) {
        prompt = joinPdfWrappedText(prompt, lines[cursor]!);
        cursor += 1;
        continue;
      }
      break;
    }

    cursor = skipCompetencyNoise(lines, cursor);
    if (cursor >= lines.length || !isLevelDescriptorLine(lines[cursor]!)) {
      const promptCleanEarly = prompt.replace(/\s+/g, " ").trim();
      if (hadBracket && promptCleanEarly.length >= 12) {
        questions.push(
          makeQuestion(`${label} — ${promptCleanEarly}`, {
            options: defaultLevelOptions([]),
            rawText: `${label}\n${promptCleanEarly}`,
            confidence: "medium",
          }),
        );
        index = cursor > index ? cursor : index + 1;
        continue;
      }
      index += 1;
      continue;
    }

    const options: string[] = [];
    const optionRaw: string[] = [];
    while (cursor < lines.length) {
      cursor = skipCompetencyNoise(lines, cursor);
      if (cursor >= lines.length) break;
      if (!isLevelDescriptorLine(lines[cursor]!)) break;

      let raw = lines[cursor]!;
      cursor += 1;
      while (cursor < lines.length) {
        if (isLevelDescriptorLine(lines[cursor]!)) break;
        if (isBracketQuestionLine(lines[cursor]!)) break;
        if (isCompetencyItemLabel(lines[cursor]!)) break;
        if (isCompetencyStructureNoise(lines[cursor]!)) {
          cursor += 1;
          continue;
        }
        if (/^※/.test(lines[cursor]!)) break;
        raw = joinPdfWrappedText(raw, lines[cursor]!);
        cursor += 1;
      }
      options.push(levelOptionLabel(raw));
      optionRaw.push(raw);
    }

    const promptClean = prompt.replace(/\s+/g, " ").trim();
    if (promptClean.length < 8) {
      index += 1;
      continue;
    }

    const title = `${label} — ${promptClean}`;
    const numberMatch = label.match(/^(\d+)\s*[-–]\s*(\d+)/);
    const questionNumber = numberMatch
      ? Number(`${numberMatch[1]}${numberMatch[2]}`)
      : undefined;

    questions.push(
      makeQuestion(title, {
        questionNumber: Number.isFinite(questionNumber)
          ? questionNumber
          : undefined,
        options:
          options.length >= 3 ? options : defaultLevelOptions(optionRaw),
        rawText: [label, promptClean, ...optionRaw].filter(Boolean).join("\n"),
        confidence: options.length >= 3 ? "high" : "medium",
      }),
    );
    index = cursor > index ? cursor : index + 1;
  }

  return questions.length >= 3 ? questions : null;
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
  const scaleHits = cells.filter((cell) => SCALE_LABEL_RE.test(cell)).length;
  return scaleHits >= 3 || (/항목|항\s*목/.test(joined) && scaleHits >= 2);
}

function scaleOptionsFromHeader(cells: string[]): string[] {
  const labels = cells.filter((cell) => SCALE_LABEL_RE.test(cell));
  if (labels.length >= 3) return labels;
  const joined = cells.join(" ");
  if (/그렇지\s*않다|매우\s*그렇다|전혀\s*그렇지/.test(joined)) {
    return [...AGREEMENT_OPTIONS];
  }
  if (/전혀\s*아니다|그렇다/.test(joined)) return [...AGREEMENT_OPTIONS];
  if (/낮음|높음/.test(joined)) return [...IMPORTANCE_OPTIONS];
  return [...LIKERT_OPTIONS];
}

function isBlankScaleMark(cell: string): boolean {
  return /^[○●◎□■☐☑]$/.test(cell) || cell === "";
}

function isScaleOnlyCell(cell: string): boolean {
  return (
    /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(cell) ||
    isBlankScaleMark(cell) ||
    SCALE_LABEL_RE.test(cell)
  );
}

function isMatrixItemRow(cells: string[]): { item: string } | null {
  if (cells.length < 3) return null;
  const item = cells[0]?.trim() ?? "";
  if (!item || item.length < 2) return null;
  if (/^Q\s*\d+|아래\s*제시|선택해\s*주십시오|항\s*목|구분/.test(item)) {
    return null;
  }
  if (isOptionLine(item) || isLikertHeaderRow(cells)) return null;
  const rest = cells.slice(1);
  const scaleMarks = rest.filter(
    (cell) => isBlankScaleMark(cell) || /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(cell),
  ).length;
  // Excel/HWP matrix rows: label + empty circles/checkboxes across the scale.
  if (scaleMarks >= 3 && scaleMarks === rest.length) {
    return { item };
  }
  return null;
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
  kind: "options" | "likert_question" | "header" | "ignore" | "matrix_item";
  title?: string;
  options?: string[];
  useScale?: boolean;
} | null {
  if (!line.includes("|")) return null;
  const cells = splitCells(line);
  if (cells.length < 2) return null;
  if (isLikertHeaderRow(cells)) return { kind: "header" };

  const matrixItem = isMatrixItemRow(cells);
  if (matrixItem) {
    return {
      kind: "matrix_item",
      title: matrixItem.item,
      useScale: true,
    };
  }

  if (cells.every((cell) => isOptionLine(cell) || isScaleOnlyCell(cell))) {
    return {
      kind: "options",
      options: cells.map((cell) =>
        cell.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").trim(),
      ),
    };
  }

  const contentCells = cells.filter(
    (cell) => !isScaleOnlyCell(cell) && !isBlankScaleMark(cell),
  );
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
    const hasScale = cells.some(
      (cell) => isScaleOnlyCell(cell) || isBlankScaleMark(cell),
    );
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

function isOpenEndedPromptLine(line: string): boolean {
  const text = line.replace(/^※\s*/, "").trim();
  if (text.length < 12 || text.length > 400) return false;
  // Instructional section headers, not answer prompts
  if (/^다음은\b/.test(text) && !/자유롭게|기재|기술해|적어/.test(text)) {
    return false;
  }
  return (
    /(자유롭게|자유\s*의견|기타\s*의견).{0,24}(기재|기술|작성|적어)/.test(text) ||
    (/(기재|기술|작성)해주시/.test(text) &&
      /(개선|의견|느낌|건의|바람|제안|애로|기타)/.test(text)) ||
    /^기타\b.{0,40}(의견|사항)/.test(text) ||
    (/핵심역량\s*진단/.test(text) &&
      /(소감|개선|건의)/.test(text) &&
      /(작성|기재|기술)/.test(text)) ||
    (/provide your thoughts freely|raise suggestions/i.test(text) &&
      /(improve|survey|competenc)/i.test(text))
  );
}

function mergeOpenEndedPrompt(
  lines: string[],
  startIndex: number,
): { title: string; endIndex: number } {
  let title = lines[startIndex]!.replace(/^※\s*/, "").trim();
  let end = startIndex;
  for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 6); i += 1) {
    const next = lines[i]!;
    if (
      isBracketQuestionLine(next) ||
      isCompetencyItemLabel(next) ||
      isLevelDescriptorLine(next) ||
      isPrivacyConsentLine(next) ||
      /^조사\s*참여에\s*감사/.test(next) ||
      /^Your cooperation is highly appreciated/i.test(next) ||
      /^--\s*\d+\s*of\s*\d+\s*--/i.test(next)
    ) {
      break;
    }
    if (
      isOpenEndedPromptLine(next) ||
      /자유롭게|작성해\s*주시|건의사항|개선|수준척도|결과\s*활용|suggestions|improve the survey|rating scale/i.test(
        next,
      )
    ) {
      title = joinPdfWrappedText(title, next.replace(/^※\s*/, ""));
      end = i;
      continue;
    }
    break;
  }
  return { title: title.replace(/\s+/g, " ").trim(), endIndex: end };
}

function isGarbageQuestion(question: ExtractedSurveyQuestion): boolean {
  const title = question.title.trim();
  if (!title || title.length < 2) return true;
  if (isNoiseLine(title)) return true;
  if (/^\d+$/.test(title)) return true;
  if (/원본\s*그림|\.bmp|\.png/i.test(title)) return true;
  if (/^\d+(?:\.\d+)?\s*mm$/i.test(title)) return true;
  if (/안녕하십니까|안녕하세요\s*\?|설문에\s*응답해\s*주셔서|대단히\s*감사/.test(title)) {
    return true;
  }
  if (/^Dear\b|kind cooperation would be highly appreciated/i.test(title)) {
    return true;
  }
  if (/IR\s*센터입니다|성실한\s*참여를\s*부탁드립니다/.test(title)) return true;
  if (/참여자\s*,\s*관람객|대회참여자|조사\s*대상/.test(title) && title.length <= 40) {
    return true;
  }
  if (
    title.length <= 8 &&
    /^(관광객|참여자|관람객|프로그램|홍보|환경|상호작용)$/.test(title)
  ) {
    return true;
  }
  // Privacy notice bullets are not survey prompts.
  if (
    /^[○●◎]\s*수집\s*및\s*이용\s*항목/.test(title) ||
    /^[○●◎]\s*수집\s*및\s*이용\s*목적/.test(title) ||
    /^[○●◎]\s*보유\s*및\s*이용기간/.test(title) ||
    /^[○●◎]\s*Information collected and used/i.test(title) ||
    /^[○●◎]\s*Purpose of collecting/i.test(title) ||
    /^[○●◎]\s*The duration that the data/i.test(title)
  ) {
    return true;
  }
  // Refuse-rights notice without a yes/no prompt.
  if (
    /동의를\s*거부할\s*권리/.test(title) &&
    !/동의하(시겠|십니|느냐)/.test(title)
  ) {
    return true;
  }
  if (
    /right to refuse consent/i.test(title) &&
    !/Do you consent/i.test(title)
  ) {
    return true;
  }
  // Competency category labels without the actual [질문]/[Q] prompt.
  if (
    isCompetencyItemLabel(title) &&
    !/\[\s*(?:질문|Q|Question)\s*\]|[?？]|습니까|입니까|하시겠|인가요|어느\s*정도|\bWhat\b|\bHow\b|\bTo what extent\b|\bDo you\b/i.test(
      title,
    ) &&
    question.options.every(
      (opt) => /^[1-5]수준$/.test(opt) || /^level\s*[1-5]$/i.test(opt) || opt.length === 0,
    )
  ) {
    // Keep only if title already embeds a long prompt (label + question text).
    if (title.length < 40) return true;
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

  const bracketQuestions = extractBracketLabeledQuestions(lines);
  const preferBracketQuestions = Boolean(bracketQuestions);

  const questions: ExtractedSurveyQuestion[] = [];
  let current: ExtractedSurveyQuestion | null = null;
  let activeScaleOptions: string[] = [...LIKERT_OPTIONS];
  let activeMatrixPrefix: string | null = null;

  const pushCurrent = () => {
    if (current) {
      questions.push(current);
      current = null;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    // Competency PDFs: skip labels/prompts/level rows already handled by
    // extractBracketLabeledQuestions so intro noise does not become items.
    if (preferBracketQuestions) {
      if (
        isBracketQuestionLine(line) ||
        isCompetencyItemLabel(line) ||
        isLevelDescriptorLine(line) ||
        isCompetencyStructureNoise(line)
      ) {
        continue;
      }
    }

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
      if (tableRow.kind === "matrix_item" && tableRow.title) {
        pushCurrent();
        const itemText = tableRow.title.replace(/^\d+\s*[.)．、]\s*/, "").trim();
        const title = activeMatrixPrefix
          ? `${activeMatrixPrefix}) ${itemText}`
          : itemText;
        current = makeQuestion(title, { confidence: "medium" });
        current.options.push(
          ...(activeScaleOptions.length > 0
            ? activeScaleOptions
            : [...AGREEMENT_OPTIONS]),
        );
        current.rawText = line;
        pushCurrent();
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
      if (isMatrixStemPrompt(line)) {
        activeMatrixPrefix = extractQuestionLabel(line);
        if (/평가/.test(line)) {
          activeScaleOptions = [...AGREEMENT_OPTIONS];
        }
        // Stem is a matrix intro — wait for item rows instead of emitting alone.
        continue;
      }
      activeMatrixPrefix = null;
      current = makeQuestion(line);
      continue;
    }

    // Section headers clear the active matrix context.
    if (/^[ⅣⅤⅥⅦⅧⅨⅩIVX\d]+[\.．、)]/.test(line) || /^[ⅣⅤⅥⅦⅧⅨⅩ]/.test(line)) {
      activeMatrixPrefix = null;
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

    if (
      isOpenEndedPromptLine(line) ||
      (/^※/.test(line) && /핵심역량\s*진단|소감|건의/.test(line)) ||
      /^Please provide your thoughts freely/i.test(line) ||
      /^\(Open-ended Question\)/i.test(line)
    ) {
      pushCurrent();
      const start =
        /^\(Open-ended Question\)/i.test(line) && index + 1 < lines.length
          ? index + 1
          : index;
      const merged = mergeOpenEndedPrompt(lines, start);
      if (
        isOpenEndedPromptLine(merged.title) ||
        /자유롭게\s*작성|provide your thoughts freely/i.test(merged.title)
      ) {
        questions.push(makeQuestion(merged.title, { confidence: "medium" }));
        index = Math.max(merged.endIndex, start);
        continue;
      }
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
      !preferBracketQuestions &&
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
      !preferBracketQuestions &&
      !current &&
      line.length <= 80 &&
      detectCategories(line).some(isPersonalDataCategory) &&
      !/개인정보|수집\s*목적|보유기간|파기|동의/.test(line)
    ) {
      questions.push(makeQuestion(line, { confidence: "low" }));
    }
  }

  pushCurrent();

  const extras = questions.splice(0, questions.length);
  if (bracketQuestions) {
    const privacyExtras = extras.filter(
      (q) =>
        /개인정보|동의|소속|학번|성별|이름|연락처|이메일|consent|personal information|department|gender|student\s*no/i.test(
          q.title,
        ) || q.detectedPersonalDataTypes.length > 0,
    );
    const otherExtras = extras.filter((q) => !privacyExtras.includes(q));
    questions.push(...privacyExtras, ...bracketQuestions, ...otherExtras);
  } else {
    questions.push(...extras);
  }

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
