import type { NormalizedForm } from "@/lib/types/scan";
import type { ContextFlag } from "@/lib/types/analyzer";
import {
  detectPublicSector,
  isPublicSectorContext,
} from "@/lib/rules/publicSectorRules";

const EVENT_KEYWORDS = ["이벤트", "경품", "응모", "추첨", "쿠폰", "당첨"];
const EMPLOYEE_SURVEY_PATTERNS = [
  /직원/,
  /근로자/,
  /재직자/,
  /조직\s*진단/,
  /인사\s*평가/,
  /상사\s*평가/,
  /직장\s*내\s*고충/,
  /근속\s*연수/,
  /직원\s*만족/,
  /근로자\s*만족/,
];
const NON_EMPLOYEE_PATTERNS = [
  /시티투어/,
  /관광/,
  /이용\s*목적/,
  /방문\s*목적/,
  /주된\s*목적/,
  /서비스\s*이용\s*경험/,
  /고객\s*설문/,
  /이용자\s*설문/,
  /만족도\s*조사/,
];
const MARKETING_KEYWORDS = ["마케팅", "광고", "뉴스레터", "프로모션", "홍보"];
const COMPLAINT_KEYWORDS = ["민원", "피해", "고발", "제보"];
const CHILD_KEYWORDS = ["아동", "청소년", "학생", "미성년", "어린이", "자녀", "유아"];

function buildSurveyText(form: NormalizedForm): string {
  return [
    form.title,
    form.operatorType,
    form.notices?.description,
    form.notices?.purpose,
    form.notices?.privacyNotice,
    form.contextHints?.prizeDescription,
    ...(form.metadata?.noticeTexts ?? []),
    ...form.questions.map((question) => question.label),
    ...form.questions.flatMap((question) => question.options ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function detectContextFlags(form: NormalizedForm): ContextFlag[] {
  const text = buildSurveyText(form);
  const publicSector = detectPublicSector(form);
  const flags = new Set<ContextFlag>();

  if (
    form.contextHints?.isPublicAgency ||
    form.operatorType?.includes("공공") ||
    isPublicSectorContext(publicSector)
  ) {
    flags.add("public_agency");
  } else if (publicSector.possibleOnly) {
    flags.add("public_sector_possible");
  }

  if (form.contextHints?.isEvent || EVENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    flags.add("event_prize");
  }

  const isNonEmployeeSurvey = NON_EMPLOYEE_PATTERNS.some((pattern) => pattern.test(text));
  const isEmployeeSurvey =
    !isNonEmployeeSurvey &&
    (form.contextHints?.isEmployeeSurvey ||
      EMPLOYEE_SURVEY_PATTERNS.some((pattern) => pattern.test(text)));

  if (isEmployeeSurvey) {
    flags.add("employee_survey");
  }

  if (form.contextHints?.isMarketing || MARKETING_KEYWORDS.some((keyword) => text.includes(keyword))) {
    flags.add("marketing");
  }

  if (form.contextHints?.isComplaint || COMPLAINT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    flags.add("complaint_report");
  }

  if (form.contextHints?.childPossible || CHILD_KEYWORDS.some((keyword) => text.includes(keyword))) {
    flags.add("child_possible");
  }

  if (
    !flags.has("public_agency") &&
    !flags.has("employee_survey") &&
    (form.operatorType?.includes("기업") || form.operatorType?.includes("회사"))
  ) {
    flags.add("general_company");
  }

  if (flags.size === 0 && publicSector.subjectType === "company") {
    flags.add("general_company");
  }

  if (flags.size === 0) {
    flags.add("general_company");
  }

  return Array.from(flags);
}

export { detectPublicSector, isPublicSectorContext };
