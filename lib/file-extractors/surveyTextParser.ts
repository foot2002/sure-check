import type {
  ExtractedSurveyDocument,
  ExtractedSurveyQuestion,
} from "@/lib/file-extractors/fileExtractorTypes";
import { detectCategories } from "@/lib/extractors/htmlTextUtils";

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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
  return (
    /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(line) ||
    /^[가나다라마바사아자차카타파하]\s*[.)．]/.test(line) ||
    /^[ⓐⓑⓒⓓⓔ]/.test(line) ||
    /^[-•▪◦]\s+\S+/.test(line) ||
    /^(매우\s*만족|만족|보통|불만족|매우\s*불만족|예|아니오|남|여)\b/.test(line) ||
    /^\d+\s*대\b/.test(line)
  );
}

function isQuestionLine(line: string): boolean {
  if (isOptionLine(line)) return false;
  return (
    /^(?:Q\s*)?\d+\s*[.)．、]/.test(line) ||
    /^문항\s*\d+/.test(line) ||
    /^질문\s*\d+/.test(line) ||
    /^\[\s*문항\s*\d+\s*\]/.test(line) ||
    /^문\s*\d+/.test(line)
  );
}

function stripQuestionPrefix(line: string): { number?: number; title: string } {
  const numbered = line.match(
    /^(?:Q\s*)?(\d+)\s*[.)．、]\s*(.+)$|^(?:문항|질문|문)\s*(\d+)\s*[.)．:]?\s*(.+)$|^\[\s*문항\s*(\d+)\s*\]\s*(.+)$/i,
  );
  if (numbered) {
    const number = Number(numbered[1] || numbered[3] || numbered[5]);
    const title = (numbered[2] || numbered[4] || numbered[6] || "").trim();
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

  for (const line of lines) {
    if (isQuestionLine(line)) {
      if (current) questions.push(current);
      const parsed = stripQuestionPrefix(line);
      const cats = detectCategories(parsed.title);
      current = {
        questionNumber: parsed.number,
        title: parsed.title || line,
        rawText: line,
        required: isRequiredHint(line) && !isOptionalHint(line),
        options: [],
        detectedPersonalDataTypes: cats,
        confidence: "medium",
      };
      continue;
    }

    if (current && isOptionLine(line)) {
      const option = line
        .replace(/^[①②③④⑤⑥⑦⑧⑨⑩가-하ⓐ-ⓔ]\s*[.)．]?\s*/, "")
        .replace(/^[-•▪◦]\s+/, "")
        .trim();
      if (option) current.options.push(option);
      current.rawText += `\n${line}`;
      continue;
    }

    if (current && /필수|선택|required|optional/i.test(line) && line.length < 40) {
      if (isRequiredHint(line)) current.required = true;
      if (isOptionalHint(line)) current.required = false;
      current.rawText += `\n${line}`;
      continue;
    }

    // 문항 번호 없이 개인정보/준식별 키워드만 있는 짧은 줄도 문항 후보로 채택
    if (
      !current &&
      line.length <= 80 &&
      detectCategories(line).length > 0 &&
      !/개인정보|수집\s*목적|보유기간|파기|동의/.test(line)
    ) {
      const cats = detectCategories(line);
      questions.push({
        title: line,
        rawText: line,
        required: isRequiredHint(line),
        options: [],
        detectedPersonalDataTypes: cats,
        confidence: "low",
      });
    }
  }

  if (current) questions.push(current);

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

  // 제목·주체 안내 줄은 문항 후보에서 제외
  const filteredQuestions = questions.filter((question) => {
    if (question.title === title) return false;
    if (subject && question.title.includes(subject)) return false;
    return !/(?:주관|주최|시행|조사기관|운영기관)\s*[:：]/.test(question.rawText);
  });

  const status: ExtractedSurveyDocument["extractionStatus"] =
    filteredQuestions.length >= 2
      ? "success"
      : filteredQuestions.length === 1 || text.length > 400
        ? "partial"
        : "failed";

  if (filteredQuestions.length === 0 && questions.length > 0) {
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
    questions: filteredQuestions,
    extractionStatus: status,
    extractionLimitations: limitations,
    detectedToolFromText: detectToolFromText(text),
    metadata: {
      textLength: text.length,
      ...base.metadata,
    },
  };
}
