export type PublicEvidenceKind =
  | "first_page"
  | "notice"
  | "pii_question"
  | "sensitive_question"
  | "high_risk_question"
  | "final_page";

export const PUBLIC_EVIDENCE_KIND_LABEL: Record<PublicEvidenceKind, string> = {
  first_page: "첫 페이지 캡처",
  notice: "고지문 캡처",
  pii_question: "개인정보 문항 캡처",
  sensitive_question: "민감정보 문항 캡처",
  high_risk_question: "고위험정보 문항 캡처",
  final_page: "제출 직전 페이지 캡처",
};

const SKIP_TYPES = new Set([
  "temporary_zip",
  "summary_document",
  "metadata",
]);

export function classifyPublicEvidenceKind(file: {
  evidenceType: string;
  label?: string | null;
  pageNumber?: number | null;
}): PublicEvidenceKind | null {
  const t = (file.evidenceType || "").trim();
  if (!t || SKIP_TYPES.has(t)) return null;
  if (t === "notice_screenshot") return "notice";
  if (t === "pii_question_screenshot") return "pii_question";
  if (t === "sensitive_question_screenshot") return "sensitive_question";
  if (t === "high_risk_question_screenshot") return "high_risk_question";
  if (t === "first_page_screenshot") return "first_page";
  if (t === "final_page_screenshot") return "final_page";

  const label = `${file.label || ""}`;
  if (/제출|직전|final|submit/i.test(label)) return "final_page";
  if (/고지|안내문|안내\s*문/i.test(label)) return "notice";
  if (/개인정보 문항/.test(label)) return "pii_question";
  if (/민감정보 문항/.test(label)) return "sensitive_question";
  if (/고위험정보 문항/.test(label)) return "high_risk_question";
  if (/첫\s*페이지|first/i.test(label) || file.pageNumber === 1) {
    return "first_page";
  }
  if (t === "key_screenshot") return "first_page";
  return null;
}

export function isDefaultSelectedPublicKind(kind: PublicEvidenceKind): boolean {
  return kind === "first_page" || kind === "notice";
}

export function needsPiiEvidenceConfirmation(
  kinds: Array<PublicEvidenceKind | null | undefined>,
): boolean {
  return kinds.some(
    (kind) =>
      kind === "pii_question" ||
      kind === "sensitive_question" ||
      kind === "high_risk_question",
  );
}
