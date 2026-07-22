import type { NormalizedForm } from "@/lib/types/scan";
import type { AuthorityTextCandidate } from "@/lib/public-sector/types";

/**
 * Authority-side texts only — excludes answer options to avoid
 * residence-choice false positives (서울/경기/인천 …).
 */
export function collectAuthorityTextCandidates(
  form: NormalizedForm,
): AuthorityTextCandidate[] {
  const candidates: AuthorityTextCandidate[] = [];
  const push = (text: string | undefined, source: string) => {
    const value = (text ?? "").trim();
    if (value.length >= 2) candidates.push({ text: value, source });
  };

  push(form.title, "title");
  push(form.operatorType, "operator");
  push(form.notices?.description, "description");
  push(form.notices?.purpose, "purpose");
  push(form.notices?.privacyNotice, "privacy_notice");
  push(form.notices?.processor, "processor");
  push(form.notices?.trustee, "trustee");
  push(form.notices?.contactDepartment, "contact");
  push(form.contextHints?.prizeDescription, "prize_description");

  for (const text of form.metadata?.noticeTexts ?? []) {
    push(text, "notice_text");
  }
  for (const text of form.metadata?.headings ?? []) {
    push(text, "heading");
  }
  if (form.metadata?.operatorHint) {
    push(form.metadata.operatorHint, "operator_hint");
  }
  for (const text of form.metadata?.operatorCandidates ?? []) {
    push(text, "operator_candidate");
  }

  for (const question of form.questions) {
    push(question.label, "question_label");
    push(question.questionText, "question_text");
    push(question.auxiliaryText, "question_aux");
    // Intentionally skip question.options — residence choices must not drive subject.
  }

  return candidates;
}
