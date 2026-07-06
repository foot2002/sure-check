export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isMeaningfulText(text: string, minLength = 2): boolean {
  const cleaned = collapseWhitespace(text);
  if (cleaned.length < minLength) return false;
  if (/^(submit|제출|확인|ok|send|next|이전|다음)$/i.test(cleaned)) return false;
  return true;
}

export function dedupeKey(text: string): string {
  return collapseWhitespace(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function extractSentencesWithKeywords(
  text: string,
  keywords: string[],
): string[] {
  const sentences = text
    .split(/(?<=[.!?。])\s+|[\n\r]+/)
    .map(collapseWhitespace)
    .filter((s) => s.length >= 8);

  const found: string[] = [];
  for (const sentence of sentences) {
    if (keywords.some((k) => sentence.includes(k))) {
      found.push(sentence.slice(0, 300));
    }
  }
  return [...new Set(found)].slice(0, 12);
}

export function mapInputType(
  type: string,
): { questionType: string; riskTags: string[] } {
  const t = type.toLowerCase();
  if (t === "email") return { questionType: "email", riskTags: [] };
  if (t === "tel") return { questionType: "phone", riskTags: [] };
  if (t === "file") return { questionType: "file", riskTags: ["file_upload"] };
  if (t === "checkbox") return { questionType: "checkbox", riskTags: [] };
  if (t === "radio") return { questionType: "radio", riskTags: [] };
  if (t === "number") return { questionType: "number", riskTags: [] };
  if (t === "date") return { questionType: "date", riskTags: [] };
  return { questionType: "short_text", riskTags: [] };
}

const EXCLUDED_QUESTION_PATTERNS = [
  /(?:이용|방문|주된|서비스)\s*목적/,
  /이용\s*목적/,
  /방문\s*목적/,
  /만족도/,
  /추천\s*의향/,
  /이용\s*경험/,
  /불편\s*사항/,
  /개선\s*사항/,
];

const PROGRAM_PREFERENCE_PATTERNS = [
  /선호.*프로그램.*주제/,
  /바라.*프로그램.*주제/,
  /선호(?:하는)?\s*(?:프로그램|주제|분야|강좌)/,
  /바라(?:는)?\s*(?:프로그램|주제|분야|강좌)/,
  /관심(?:\s*있는)?\s*(?:프로그램|주제|분야|강좌)/,
  /(?:프로그램|강좌).*(?:관심|선호|희망)/,
  /희망(?:하는)?\s*(?:프로그램|주제|분야|강좌)/,
  /희망.*(?:교육|강좌).*주제/,
  /(?:교육|강좌|도서관|문화|관광|여가|복지|건강|심리|상담|독서|취미|가족|육아|운동|체육)\s*(?:프로그램|주제|분야|강좌)/,
  /프로그램\s*(?:주제|선호|관심|희망)/,
  /향후\s*전시\s*주제/,
  /향후\s*기획.*주제/,
  /전시\s*주제/,
];

const POLICY_OPINION_PATTERNS = [
  /정책\s*방향/,
  /추진해야\s*할\s*방향/,
  /역할\s*확대\s*방향/,
  /지역\s*사회.*문제/,
  /가장\s*시급한.*문제/,
  /공공\s*데이터.*활용/,
  /활용성이\s*높은/,
];

const SERVICE_FEEDBACK_PATTERNS = [
  /서비스\s*개선\s*방향/,
  /서비스\s*개선/,
  /바라는\s*점/,
  /의견/,
  /제안/,
  /건의/,
  /박물관에\s*바라는\s*점/,
];

const VISIT_PURPOSE_PATTERNS = [
  /이용\s*목적/,
  /방문\s*목적/,
  /이용\s*횟수/,
  /방문\s*횟수/,
  /방문\s*경로/,
  /관람\s*방식/,
];

const SATISFACTION_PATTERNS = [
  /만족도/,
  /추천\s*의향/,
  /만족(?:한)?\s*점/,
];

const IMPROVEMENT_OPINION_PATTERNS = [
  /불편\s*사항/,
  /개선\s*사항/,
  /개선되어야\s*할\s*점/,
];

const PREFERENCE_PATTERNS = [
  /기억에\s*남는\s*전시물/,
  /전시\s*이해.*도움/,
];

const GENERAL_OPINION_PATTERNS = [
  /관람객\s*의견\s*수렴/,
  /자유\s*의견/,
  /기타\s*의견/,
];

const ACTUAL_HEALTH_SENSITIVE_PATTERNS = [
  /현재\s*건강\s*상태/,
  /건강\s*상태/,
  /앓고\s*있는\s*질병/,
  /질환명/,
  /병력/,
  /진료\s*이력/,
  /치료\s*이력/,
  /복용\s*약/,
  /장애\s*(?:여부|유형|등급)/,
  /정신\s*건강\s*상태/,
  /우울/,
  /불안/,
  /자살\s*생각/,
  /상담\s*치료\s*이력/,
  /건강검진\s*결과/,
  /의료기관\s*이용\s*이력/,
];

const DIRECT_PII_SOLICITATION =
  /(이름|연락처|주소|전화번호|이메일|휴대폰).*(적어|입력|기재|작성)/;

export function isExcludedSurveyQuestion(text: string): boolean {
  const normalized = collapseWhitespace(text);
  if (!EXCLUDED_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return !DIRECT_PII_SOLICITATION.test(normalized);
}

export function isProgramPreferenceQuestion(text: string): boolean {
  const normalized = collapseWhitespace(text);
  return PROGRAM_PREFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isGeneralOpinionQuestion(text: string): boolean {
  const normalized = collapseWhitespace(text);
  return [
    ...GENERAL_OPINION_PATTERNS,
    ...POLICY_OPINION_PATTERNS,
    ...SERVICE_FEEDBACK_PATTERNS,
    ...VISIT_PURPOSE_PATTERNS,
    ...SATISFACTION_PATTERNS,
    ...IMPROVEMENT_OPINION_PATTERNS,
    ...PREFERENCE_PATTERNS,
  ].some((pattern) => pattern.test(normalized));
}

export function isPreferenceOrGeneralOpinionQuestion(text: string): boolean {
  return isProgramPreferenceQuestion(text) || isGeneralOpinionQuestion(text);
}

export function isSensitiveHealthQuestion(text: string): boolean {
  const normalized = collapseWhitespace(text);
  if (isPreferenceOrGeneralOpinionQuestion(normalized)) return false;
  return ACTUAL_HEALTH_SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isDirectPiiSolicitation(text: string): boolean {
  return DIRECT_PII_SOLICITATION.test(collapseWhitespace(text));
}

const CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  { category: "name", patterns: [/이름/, /성명/, /신청자명/, /담당자명/] },
  { category: "phone", patterns: [/휴대\s*전화/, /휴대폰/, /핸드폰/, /전화번호/, /연락처/, /\btel\b/i] },
  { category: "email", patterns: [/이메일/, /e-?mail/i, /(?<!메일\s)메일(?!링)/] },
  {
    category: "address",
    patterns: [
      /(?<!거)주소(?!지)/,
      /상세주소/,
      /도로명주소/,
      /지번주소/,
      /배송지/,
      /우편번호/,
    ],
  },
  { category: "birthdate", patterns: [/생년월일/, /생일/, /출생연도/] },
  { category: "affiliation", patterns: [/회사명/, /기관명/, /학교명/, /소속/] },
  { category: "department", patterns: [/부서/, /팀/] },
  { category: "position", patterns: [/직급/, /직책/] },
  { category: "tenure", patterns: [/근속\s*연수/, /근무\s*연수/, /재직\s*기간/] },
  { category: "organization_identifier", patterns: [/사번/] },
  {
    category: "gender",
    patterns: [/성별/, /남자/, /여자/, /남성/, /여성/],
  },
  {
    category: "child_age_range",
    patterns: [
      /자녀.*연령/,
      /자녀.*나이/,
      /아이.*연령/,
      /아이.*나이/,
      /(?:영아|유아|아동)\s*(?:선택|해당|구분|연령|나이)/,
      /어린이\s*연령대/,
    ],
  },
  {
    category: "respondent_age",
    patterns: [/귀하.*연령/, /귀하.*나이/, /만\s*나이/],
  },
  {
    category: "age_range",
    patterns: [/연령/, /나이/, /연령대/],
  },
  {
    category: "residence_area",
    patterns: [
      /거주\s*권역/,
      /거주지/,
      /거주지역/,
      /관내/,
      /인접\s*시군/,
      /타지역/,
      /시\s*\/\s*군/,
      /시군구/,
    ],
  },
  {
    category: "quasi_identifier",
    patterns: [],
  },
  {
    category: "sensitive_health",
    patterns: ACTUAL_HEALTH_SENSITIVE_PATTERNS,
  },
  {
    category: "sensitive_belief_union",
    patterns: [/노조\s*가입/, /노동조합\s*가입/, /사상/, /신념/],
  },
  {
    category: "sensitive_political",
    patterns: [/정당\s*가입/, /정치적\s*견해/, /정치\s*성향/],
  },
  {
    category: "sensitive_religion",
    patterns: [/종교/, /신앙/],
  },
  {
    category: "sensitive_complaint",
    patterns: [
      /성희롱/,
      /성폭력/,
      /괴롭힘/,
      /갑질/,
      /직장\s*내\s*고충/,
      /고충/,
      /징계/,
      /인사평가/,
      /상사평가/,
    ],
  },
  {
    category: "resident_registration_number",
    patterns: [/주민등록번호/, /주민번호/],
  },
  {
    category: "passport_number",
    patterns: [/여권번호/],
  },
  {
    category: "driver_license_number",
    patterns: [/운전면허번호/],
  },
  {
    category: "foreign_registration_number",
    patterns: [/외국인등록번호/],
  },
  {
    category: "id_document",
    patterns: [/신분증/, /학생증/, /사원증/],
  },
  {
    category: "financial_account",
    patterns: [/계좌번호/, /예금주/, /은행/],
  },
  {
    category: "authentication_secret",
    patterns: [/비밀번호/, /인증번호/],
  },
];

export function detectCategories(text: string): string[] {
  if (isProgramPreferenceQuestion(text)) {
    return ["program_preference"];
  }

  const normalized = collapseWhitespace(text);

  if (POLICY_OPINION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["policy_opinion"];
  }

  if (GENERAL_OPINION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["general_opinion"];
  }

  if (SERVICE_FEEDBACK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["service_feedback"];
  }

  if (VISIT_PURPOSE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["visit_purpose"];
  }

  if (SATISFACTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["satisfaction"];
  }

  if (IMPROVEMENT_OPINION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["improvement_opinion"];
  }

  if (PREFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return ["preference"];
  }

  if (isGeneralOpinionQuestion(text) || isExcludedSurveyQuestion(text)) {
    return ["general_opinion"];
  }

  const categories = new Set<string>();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      categories.add(rule.category);
    }
  }
  if (categories.has("child_age_range")) {
    categories.delete("respondent_age");
    categories.delete("age_range");
  }
  if (categories.has("respondent_age")) categories.delete("age_range");
  if (
    categories.has("gender") ||
    categories.has("respondent_age") ||
    categories.has("age_range") ||
    categories.has("child_age_range") ||
    categories.has("residence_area") ||
    categories.has("department") ||
    categories.has("position") ||
    categories.has("tenure")
  ) {
    categories.delete("quasi_identifier");
  }
  return [...categories];
}

export const NOTICE_KEYWORDS = [
  "개인정보",
  "수집·이용",
  "수집 이용",
  "보유기간",
  "이용기간",
  "파기",
  "동의 거부",
  "불이익",
  "제3자 제공",
  "위탁",
  "수탁자",
  "국외이전",
  "국외 보관",
  "개인정보처리방침",
  "담당자",
  "문의처",
];

export const CATEGORY_TO_PERSONAL_LABEL: Record<string, string> = {
  name: "이름",
  phone: "연락처",
  email: "이메일",
  address: "상세주소",
  birthdate: "생년월일",
  affiliation: "소속",
  organization_identifier: "조직식별정보",
  gender: "성별",
  respondent_age: "연령대",
  age_range: "연령대",
  child_age_range: "자녀 연령대",
  residence_area: "거주권역",
  department: "부서",
  position: "직급",
  tenure: "근속연수",
  quasi_identifier: "준식별정보",
  sensitive_health: "민감정보(건강)",
  sensitive_belief_union: "민감정보(신념/노조)",
  sensitive_complaint: "민감정보(고충/신고)",
  sensitive_political: "민감정보(정치)",
  sensitive_religion: "민감정보(종교)",
  unique_identifier: "고유식별정보",
  financial: "금융정보",
  resident_registration_number: "주민등록번호",
  passport_number: "여권번호",
  driver_license_number: "운전면허번호",
  foreign_registration_number: "외국인등록번호",
  id_document: "신분증",
  financial_account: "계좌번호",
  authentication_secret: "비밀번호/인증번호",
  program_preference: "일반 의견/프로그램 선호도",
  policy_opinion: "정책 방향",
  service_feedback: "서비스 의견",
  visit_purpose: "방문/이용 목적",
  satisfaction: "만족도",
  preference: "선호도",
  improvement_opinion: "개선사항",
  general_opinion: "일반 의견",
};

export function getDetectedCategoryDisplayLabel(
  category: string,
  questionText = "",
): string {
  const text = collapseWhitespace(questionText);

  if (category === "quasi_identifier") {
    if (/성별|남자|여자|남성|여성/.test(text)) return "성별";
    if (/자녀|아이|영아|유아|아동|어린이/.test(text) && /연령|나이|연령대/.test(text)) {
      return "자녀 연령대";
    }
    if (/연령|나이|연령대|출생연도/.test(text)) return "연령대";
    if (/거주|권역|관내|인접\s*시군|타지역|시군구|시\s*\/\s*군|지역/.test(text)) {
      return "거주권역";
    }
    return "준식별정보";
  }

  if (category === "phone" && /경품|응모|당첨|추첨|쿠폰/.test(text)) {
    return "경품 응모용 연락처";
  }

  if (category === "general_opinion") {
    if (/자유\s*의견|기타\s*의견|건의/.test(text)) return "자유의견";
  }

  if (category === "program_preference") {
    if (/향후\s*전시\s*주제|전시\s*주제/.test(text)) return "향후 전시주제";
    if (/프로그램\s*주제|주제/.test(text)) return "프로그램 주제";
    return "프로그램 선호도";
  }

  if (category === "policy_opinion") return "정책 방향";
  if (category === "service_feedback") return "서비스 의견";
  if (category === "visit_purpose") {
    if (/이용\s*횟수|방문\s*횟수/.test(text)) return "이용 횟수";
    if (/방문\s*경로/.test(text)) return "방문경로";
    if (/관람\s*방식/.test(text)) return "관람 방식";
    return "이용 목적";
  }
  if (category === "satisfaction") return "만족도";
  if (category === "preference") {
    if (/전시\s*이해.*도움/.test(text)) return "전시 이해 도움 요소";
    if (/기억에\s*남는\s*전시물/.test(text)) return "기억에 남는 전시물";
    return "선호도";
  }
  if (category === "improvement_opinion") return "개선사항";

  return CATEGORY_TO_PERSONAL_LABEL[category] ?? category;
}

export function formatDetectedCategoryWithDisplayLabel(
  category: string,
  questionText = "",
): string {
  return `${category}: ${getDetectedCategoryDisplayLabel(category, questionText)}`;
}

export function isPersonalDataCategory(category: string): boolean {
  return ![
    "program_preference",
    "policy_opinion",
    "service_feedback",
    "visit_purpose",
    "satisfaction",
    "preference",
    "improvement_opinion",
    "general_opinion",
  ].includes(category);
}

export function categoriesToDataLevel(categories: string[]): "D0" | "D1" | "D2" | "D3" | "D4" | "D5" {
  if (
    categories.some((c) =>
      [
        "unique_identifier",
        "financial",
        "resident_registration_number",
        "passport_number",
        "driver_license_number",
        "foreign_registration_number",
        "id_document",
        "financial_account",
        "authentication_secret",
      ].includes(c),
    )
  ) {
    return "D5";
  }
  if (
    categories.some((c) =>
      [
        "sensitive_health",
        "sensitive_belief_union",
        "sensitive_complaint",
        "sensitive_political",
        "sensitive_religion",
      ].includes(c),
    )
  ) {
    return "D4";
  }
  if (
    categories.some((c) =>
      ["name", "phone", "email", "address", "birthdate"].includes(c),
    )
  ) {
    return "D3";
  }
  if (
    categories.some((c) =>
      ["affiliation", "organization_identifier", "quasi_identifier"].includes(c),
    )
  ) {
    return "D2";
  }
  if (
    categories.some((c) =>
      [
        "gender",
        "respondent_age",
        "age_range",
        "child_age_range",
        "residence_area",
        "department",
        "position",
        "tenure",
      ].includes(c),
    )
  ) {
    return "D2";
  }
  return "D1";
}
