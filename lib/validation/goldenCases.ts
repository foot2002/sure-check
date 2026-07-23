import type { ExpectedContext } from "@/lib/validation/types";
import type {
  DetectedCategory,
  NormalizedForm,
  NormalizedQuestion,
  Platform,
  RiskGrade,
} from "@/lib/types/scan";
import type { VerdictType } from "@/lib/reporting/verdictTypes";
import {
  categoriesToDataLevel,
  detectCategories,
  getDetectedCategoryDisplayLabel,
  isPersonalDataCategory,
} from "@/lib/extractors/htmlTextUtils";

export type GoldenScenarioType =
  | "public_facility_satisfaction"
  | "public_museum_satisfaction"
  | "public_library_policy_survey"
  | "company_event_contact"
  | "google_forms_direct_identifier"
  | "employee_diagnosis"
  | "employee_complaint"
  | "health_sensitive_survey"
  | "high_risk_identifier_survey"
  | "generic_no_questions"
  | "program_preference"
  | "health_program_preference"
  | "health_status_sensitive"
  | "disability_sensitive"
  | "policy_opinion"
  | "child_facility_survey"
  | "public_google_forms_pii"
  | "moaform_dynamic_limited";

export interface GoldenGradeRange {
  minScore?: number;
  maxScore?: number;
  allowedGrades?: RiskGrade[];
}

export interface GoldenExpectedDataItems {
  directIdentifiers?: string[];
  quasiIdentifiers?: string[];
  generalOpinions?: string[];
  sensitiveItems?: string[];
  highRiskItems?: string[];
}

export interface GoldenExpectedOperatorFixes {
  required?: string[];
  recommended?: string[];
  any?: string[];
}

export interface GoldenCase {
  id: string;
  name: string;
  description: string;
  platform: Platform;
  scenarioType: GoldenScenarioType;
  sampleUrl?: string;
  sampleNormalizedForm?: NormalizedForm;
  expectedDecision?: VerdictType | VerdictType[];
  expectedGradeRange?: GoldenGradeRange;
  expectedDataItems?: GoldenExpectedDataItems;
  expectedNotDataItems?: string[];
  expectedContext?: ExpectedContext | ExpectedContext[];
  expectedOperatorFixes?: GoldenExpectedOperatorFixes;
  forbiddenPhrases?: string[];
  requiredPhrases?: string[];
  expectedIsLimited?: boolean;
  notes?: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function question(
  label: string,
  index: number,
  options: string[] = [],
  type = options.length > 0 ? "single_choice" : "long_text",
): NormalizedQuestion {
  const detectedCategories = detectCategories(label) as DetectedCategory[];
  const hasPersonalData = detectedCategories.some(isPersonalDataCategory);

  return {
    id: `q${index}`,
    label,
    questionText: label,
    type,
    required: false,
    hasPersonalData,
    personalDataTypes:
      detectedCategories.length > 0
        ? unique(
            detectedCategories.map((category) =>
              getDetectedCategoryDisplayLabel(category, label),
            ),
          )
        : undefined,
    dataRiskLevel: hasPersonalData
      ? categoriesToDataLevel(detectedCategories)
      : "D1",
    detectedCategories,
    riskTags: [],
    options: options.length > 0 ? options : undefined,
    pageIndex: 0,
    questionIndex: index,
  };
}

function form(input: {
  platform: Platform;
  title: string;
  url: string;
  description?: string;
  questions: Array<string | { label: string; options?: string[]; type?: string }>;
  operatorType?: string;
  noticeTexts?: string[];
  privacyNotice?: string;
  purpose?: string;
  retention?: string;
  processor?: string;
  consentText?: string;
  sensitiveConsent?: string;
  contextHints?: NormalizedForm["contextHints"];
  management?: NormalizedForm["management"];
  isLimited?: boolean;
  limitedReason?: string;
}): NormalizedForm {
  const normalizedQuestions = input.questions.map((item, index) =>
    typeof item === "string"
      ? question(item, index + 1)
      : question(item.label, index + 1, item.options, item.type),
  );

  return {
    platform: input.platform,
    title: input.title,
    url: input.url,
    operatorType: input.operatorType,
    questions: normalizedQuestions,
    pages: [{ id: "page-1", title: input.title, questions: normalizedQuestions }],
    hasPrivacyNotice: Boolean(input.privacyNotice),
    hasConsent: Boolean(input.consentText),
    hasRetentionNotice: Boolean(input.retention),
    hasOverseasTransferNotice: false,
    partialScan: false,
    isLimited: input.isLimited,
    limitedReason: input.limitedReason,
    confidence: input.isLimited ? "none" : "high",
    notices: {
      description: input.description,
      privacyNotice: input.privacyNotice,
      purpose: input.purpose,
      retention: input.retention,
      processor: input.processor,
      consentText: input.consentText,
      sensitiveConsent: input.sensitiveConsent,
    },
    contextHints: input.contextHints,
    management: input.management,
    metadata: {
      noticeTexts: input.noticeTexts ?? [],
      headings: [],
      ...(input.isLimited && input.platform === "moaform"
        ? {
            failureReason: "MOAFORM_DYNAMIC_RENDERING",
            diagnosisScope: "limited" as const,
            operatorHint: input.operatorType?.replace(/\s*\(확인 필요\)\s*$/, ""),
            extractionMethod: "none",
          }
        : {}),
    },
  };
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "golden_public_museum_satisfaction",
    name: "공공 문화시설 만족도 조사",
    description:
      "공공 박물관 만족도 설문에서 거주지 선택지 지자체명을 공공부문 근거로 쓰지 않는지 검증합니다.",
    platform: "naver_forms",
    scenarioType: "public_museum_satisfaction",
    sampleUrl: "https://form.naver.com/golden/public-museum",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/public-museum",
      title: "용인시박물관 기획전 <함께 킥오프, 우리들의 축구 도시 용인> 만족도 조사",
      description: "관람객 의견 수렴을 위한 만족도 조사",
      questions: [
        "연령대",
        { label: "거주권역", options: ["용인", "경기도", "서울", "기타"] },
        "방문경로",
        "관람 방식",
        "전반적 만족도",
        "자유의견",
      ],
    }),
    expectedDecision: "RESPOND_WITH_CAUTION",
    expectedGradeRange: { minScore: 70, maxScore: 80, allowedGrades: ["caution"] },
    expectedDataItems: {
      quasiIdentifiers: ["연령대", "거주권역"],
      generalOpinions: ["방문경로", "관람 방식", "만족도", "자유의견"],
    },
    expectedNotDataItems: ["이름", "연락처", "민감정보", "주민등록번호"],
    expectedContext: "public_sector",
    expectedOperatorFixes: {
      any: ["보유기간", "담당자", "수집 항목", "외부 설문 SaaS", "자유의견"],
    },
    forbiddenPhrases: ["경기도", "공공재단 성격 키워드", "민감정보 경고", "응답 보류", "직원 설문", "주의 후 응답", "강력히 권고합니다", "CSAP 인증 도구 사용을 강력히"],
    requiredPhrases: ["용인시박물관", "공공 문화시설", "자유의견", "개인정보는 쓰지 마세요"],
    notes: "응답 선택지의 지역명은 residence_area 판단에는 쓰되 공공부문 근거에는 쓰지 않는다.",
  },
  {
    id: "golden_public_google_forms_pii",
    name: "공공기관 Google Forms 개인정보 설문",
    description:
      "공공부문 + Google Forms + 직접식별정보 조합에서 CSAP 강력 권고 블록과 Hero 근거가 표시되는지 검증합니다.",
    platform: "google_forms",
    scenarioType: "public_google_forms_pii",
    sampleUrl: "https://docs.google.com/forms/d/e/golden/public-pii/viewform",
    sampleNormalizedForm: form({
      platform: "google_forms",
      url: "https://docs.google.com/forms/d/e/golden/public-pii/viewform",
      title: "서울특별시청 민원 만족도 및 개선 의견 조사",
      description: "서울특별시청에서 민원 서비스 개선을 위해 실시하는 설문입니다.",
      questions: ["이름", "연락처", "이메일", "민원 만족도", "개선 의견"],
    }),
    expectedDecision: ["CHECK_NOTICE_BEFORE_INPUT", "DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 70, allowedGrades: ["risk", "high_risk"] },
    expectedDataItems: {
      directIdentifiers: ["이름", "연락처", "이메일"],
      generalOpinions: ["만족도"],
    },
    expectedNotDataItems: ["주민등록번호", "민감정보"],
    expectedContext: "public_sector",
    expectedOperatorFixes: {
      any: ["CSAP", "국외이전", "보유기간", "파기"],
    },
    forbiddenPhrases: ["불법", "반드시 위반", "미인증 도구"],
    requiredPhrases: [
      "CSAP",
      "강력히 권고",
      "Google Forms",
      "국외 보관",
      "Cloud Security Assurance Program",
    ],
    notes: "공공부문 + 직접식별정보 + Google Forms에서 CSAP 강력 권고가 표시되어야 한다.",
  },
  {
    id: "golden_child_facility_satisfaction",
    name: "공공 어린이시설 만족도 조사",
    description:
      "아동 관련 시설 만족도 설문에서 자녀 연령대와 거주권역만 준식별정보로 표시되는지 검증합니다.",
    platform: "naver_forms",
    scenarioType: "child_facility_survey",
    sampleUrl: "https://form.naver.com/golden/child-facility",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/child-facility",
      title: "물맑은양평종합운동장 어린이물놀이시설 고객만족도 조사",
      description:
        "보다 나은 서비스 제공을 위한 기초자료로 활용되며 통계적인 분석 목적 외에는 사용되지 않습니다.",
      questions: [
        "이용 횟수",
        "자녀 연령대",
        { label: "거주권역", options: ["양평군 관내", "인접 시군", "타지역"] },
        "시설 만족도",
        "자유의견",
      ],
    }),
    expectedDecision: "RESPOND_WITH_CAUTION",
    expectedGradeRange: { minScore: 70, maxScore: 80, allowedGrades: ["caution"] },
    expectedDataItems: {
      quasiIdentifiers: ["자녀 연령대", "거주권역"],
      generalOpinions: ["이용 횟수", "만족도", "자유의견"],
    },
    expectedNotDataItems: ["성별", "이름", "연락처", "민감정보", "주민등록번호"],
    expectedContext: "public_sector",
    expectedOperatorFixes: { any: ["자유의견", "보유기간", "담당자", "외부 설문 SaaS"] },
    forbiddenPhrases: ["성별", "민감한 아동정보", "아동 개인정보 고위험", "응답 보류", "강력히 권고합니다", "CSAP 인증 도구 사용을 강력히"],
    requiredPhrases: ["자녀 연령대", "거주권역", "자유의견", "개인정보는 쓰지 마세요"],
  },
  {
    id: "golden_public_library_policy",
    name: "공공 도서관 프로그램/정책 설문",
    description:
      "프로그램 주제의 건강 키워드와 정책 방향 문항이 민감정보나 직원 설문으로 오탐되지 않는지 검증합니다.",
    platform: "naver_forms",
    scenarioType: "public_library_policy_survey",
    sampleUrl: "https://form.naver.com/golden/library-policy",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/library-policy",
      title: "마포구립도서관 프로그램 및 정책 방향 설문",
      description: "도서관 서비스 개선과 정책 방향 수립을 위한 의견 수렴 설문입니다.",
      questions: [
        "성별",
        "연령대",
        "선호하는 건강 프로그램 주제는 무엇입니까?",
        "마포구에서 가장 중요하게 추진해야 할 도서관 정책 방향은 무엇이라고 생각하십니까?",
        "서비스 개선사항",
      ],
    }),
    expectedDecision: ["RESPOND_WITH_CAUTION", "CHECK_NOTICE_BEFORE_INPUT"],
    expectedGradeRange: { minScore: 60, maxScore: 80, allowedGrades: ["caution", "risk"] },
    expectedDataItems: {
      quasiIdentifiers: ["성별", "연령대"],
      generalOpinions: ["프로그램 주제", "정책 방향", "서비스 의견"],
    },
    expectedNotDataItems: ["건강정보", "민감정보", "직원/조직진단", "마케팅"],
    expectedContext: "public_sector",
    forbiddenPhrases: ["민감정보 입력", "직원/조직진단", "마케팅 동의", "응답 보류", "강력히 권고합니다", "CSAP 인증 도구 사용을 강력히"],
    requiredPhrases: ["프로그램 주제", "정책 방향", "개인정보는 쓰지 마세요"],
  },
  {
    id: "golden_event_contact",
    name: "기업 또는 공공 경품 설문",
    description:
      "경품 응모용 연락처를 직접식별정보로 표시하되 연락처 하나만으로 응답 보류 권고하지 않는지 검증합니다.",
    platform: "naver_forms",
    scenarioType: "company_event_contact",
    sampleUrl: "https://form.naver.com/golden/event-contact",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/event-contact",
      title: "전시 관람 이벤트 만족도 및 경품 응모 설문",
      description: "이벤트 경품 응모와 관람 만족도 확인을 위한 설문입니다.",
      questions: ["전반적 만족도", "경품 응모용 연락처", "자유의견"],
      contextHints: { isEvent: true },
    }),
    expectedDecision: ["RESPOND_WITH_CAUTION", "CHECK_NOTICE_BEFORE_INPUT"],
    expectedGradeRange: { minScore: 40, maxScore: 75, allowedGrades: ["caution", "risk"] },
    expectedDataItems: {
      directIdentifiers: ["경품 응모용 연락처"],
      generalOpinions: ["만족도", "자유의견"],
    },
    expectedNotDataItems: ["주민등록번호", "계좌번호", "신분증"],
    expectedContext: "event",
    expectedOperatorFixes: { any: ["보유기간", "파기", "경품 정보와 설문 응답 분리"] },
    forbiddenPhrases: ["응답 보류"],
    requiredPhrases: ["경품 응모용 연락처", "경품"],
  },
  {
    id: "golden_google_forms_direct_identifier",
    name: "Google Forms 직접식별정보 설문",
    description:
      "이름, 연락처, 이메일이 모두 직접식별정보로 표시되고 고위험정보와 분리되는지 검증합니다.",
    platform: "google_forms",
    scenarioType: "google_forms_direct_identifier",
    sampleUrl: "https://docs.google.com/forms/d/e/golden/viewform",
    sampleNormalizedForm: form({
      platform: "google_forms",
      url: "https://docs.google.com/forms/d/e/golden/viewform",
      title: "행사 신청 설문",
      description: "행사 참석자 확인을 위한 신청 설문입니다.",
      questions: ["이름", "연락처", "이메일", "참석 목적"],
    }),
    expectedDecision: ["CHECK_NOTICE_BEFORE_INPUT", "DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 65, allowedGrades: ["risk", "high_risk"] },
    expectedDataItems: {
      directIdentifiers: ["이름", "연락처", "이메일"],
    },
    expectedNotDataItems: ["주민등록번호", "계좌번호", "신분증"],
    expectedContext: "company",
    expectedOperatorFixes: { any: ["국외이전", "보유기간", "파기", "ISMS-P", "보안 인증"] },
    forbiddenPhrases: ["불법", "반드시 써야", "위법입니다"],
    requiredPhrases: [
      "이름",
      "연락처",
      "이메일",
      "국외",
      "ISMS-P",
      "보안 인증",
      "강력히 권고",
    ],
  },
  {
    id: "golden_employee_diagnosis",
    name: "직원 조직진단 설문",
    description:
      "부서/직급/근속연수 식별 가능 조합과 직원 설문 보완사항을 검증합니다.",
    platform: "naver_forms",
    scenarioType: "employee_diagnosis",
    sampleUrl: "https://form.naver.com/golden/employee-diagnosis",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/employee-diagnosis",
      title: "직원 조직진단 및 조직문화 설문",
      description: "조직진단과 직원 만족도 개선을 위한 설문입니다.",
      questions: ["부서", "직급", "근속연수", "상사평가", "조직문화 만족도"],
      contextHints: { isEmployeeSurvey: true },
    }),
    expectedDecision: ["DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 60, allowedGrades: ["high_risk", "risk"] },
    expectedDataItems: {
      quasiIdentifiers: ["부서", "직급", "근속연수"],
      sensitiveItems: ["민감정보(고충/신고)"],
    },
    expectedContext: "employee",
    expectedOperatorFixes: { any: ["원자료 제공 범위", "익명성", "소수집단", "ISMS-P", "보안 인증"] },
    forbiddenPhrases: ["불법", "반드시 써야"],
    requiredPhrases: [
      "직원",
      "원자료",
      "소수집단",
      "응답하지 말",
      "ISMS-P",
      "보안 인증",
      "강력히 권고",
    ],
  },
  {
    id: "golden_health_sensitive",
    name: "건강 민감정보 설문",
    description:
      "실제 건강상태/질병/장애/치료 이력은 민감정보로, 건강 프로그램 선호는 일반 선호도로 분리합니다.",
    platform: "naver_forms",
    scenarioType: "health_sensitive_survey",
    sampleUrl: "https://form.naver.com/golden/health-sensitive",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/health-sensitive",
      title: "건강지원 서비스 신청 설문",
      description: "건강지원 서비스 제공을 위한 신청 설문입니다.",
      questions: ["현재 건강상태", "앓고 있는 질병", "장애 여부", "치료 이력", "선호하는 건강 프로그램 주제"],
    }),
    expectedDecision: ["DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 60, allowedGrades: ["high_risk", "risk"] },
    expectedDataItems: {
      sensitiveItems: ["민감정보(건강)"],
      generalOpinions: ["프로그램 주제"],
    },
    expectedNotDataItems: ["주민등록번호", "계좌번호"],
    expectedContext: "company",
    expectedOperatorFixes: { any: ["민감정보", "별도 동의", "ISMS-P", "보안 인증"] },
    forbiddenPhrases: ["불법", "반드시 써야"],
    requiredPhrases: [
      "민감정보",
      "응답하지 말",
      "ISMS-P",
      "CSAP",
      "보안 인증",
      "강력히 권고",
    ],
  },
  {
    id: "golden_high_risk_identifier",
    name: "고위험정보 설문",
    description:
      "주민등록번호, 여권번호, 운전면허번호, 신분증, 계좌번호 등 고위험정보 탐지를 검증합니다.",
    platform: "generic",
    scenarioType: "high_risk_identifier_survey",
    sampleUrl: "https://example.org/golden/high-risk",
    sampleNormalizedForm: form({
      platform: "generic",
      url: "https://example.org/golden/high-risk",
      title: "본인확인 및 지급정보 제출 설문",
      description: "본인확인과 지급 처리를 위한 정보 제출 설문입니다.",
      questions: ["주민등록번호", "여권번호", "운전면허번호", "신분증 첨부", "계좌번호"],
    }),
    expectedDecision: ["DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 55, allowedGrades: ["high_risk"] },
    expectedDataItems: {
      highRiskItems: ["주민등록번호", "여권번호", "운전면허번호", "신분증", "계좌번호"],
    },
    expectedOperatorFixes: { any: ["보유기간", "ISMS-P", "보안 인증"] },
    forbiddenPhrases: ["불법"],
    requiredPhrases: ["고위험정보", "응답하지 말", "ISMS-P", "보안 인증"],
  },
  {
    id: "golden_generic_no_questions",
    name: "문항 없는 일반 페이지",
    description: "문항을 확인하지 못한 페이지는 진단 제한, 점수 산정 불가로 처리합니다.",
    platform: "generic",
    scenarioType: "generic_no_questions",
    sampleUrl: "https://example.com",
    sampleNormalizedForm: form({
      platform: "generic",
      url: "https://example.com",
      title: "Example Domain",
      questions: [],
      isLimited: true,
      limitedReason: "설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다.",
    }),
    expectedDecision: "LIMITED_DIAGNOSIS",
    expectedIsLimited: true,
    expectedGradeRange: { allowedGrades: [] },
    expectedDataItems: {},
    expectedNotDataItems: ["이름", "연락처", "성별", "민감정보", "고위험정보"],
    forbiddenPhrases: ["고위험", "응답 보류", "민감정보 입력"],
    requiredPhrases: ["진단 제한", "점수 산정 불가"],
  },
  {
    id: "golden_moaform_dynamic_limited",
    name: "Moaform dynamic rendering limited diagnosis",
    description:
      "모아폼 문항 추출에 실패했을 때(세션/JSON/DOM 모두 실패) 문항 분석 불가로 안전하게 처리합니다.",
    platform: "moaform",
    scenarioType: "moaform_dynamic_limited",
    sampleUrl: "https://answer.moaform.com/answers/M1Q1nB",
    sampleNormalizedForm: form({
      platform: "moaform",
      url: "https://answer.moaform.com/answers/M1Q1nB",
      title: "2026 서울시 소상공인 온라인 유통 MD 상담 참여 신청서",
      description: "모아폼 문항 추출 실패 시 제한 진단 샘플입니다.",
      questions: [],
      isLimited: true,
      limitedReason:
        "모아폼 페이지는 확인했지만, 설문 문항을 자동으로 읽지 못했습니다.",
      operatorType: "서울시 소상공인정책과 (확인 필요)",
    }),
    expectedDecision: "LIMITED_DIAGNOSIS",
    expectedIsLimited: true,
    expectedGradeRange: { allowedGrades: [] },
    expectedDataItems: {},
    expectedNotDataItems: ["이름", "연락처", "민감정보", "고위험정보"],
    expectedOperatorFixes: {
      any: ["모아폼 문항 자동 확인 제한", "외부 설문도구"],
    },
    forbiddenPhrases: [
      "불법",
      "응답해도 무리가 낮습니다",
      "개인정보 없음",
      "위반 소지가 큽니다",
      "CSAP 위반",
      "판단불가형",
    ],
    requiredPhrases: [
      "문항 분석이 안 되어 판단이 어렵습니다",
      "문항 분석 불가",
      "점수 산정 불가",
      "Moaform",
      "문항 자동",
    ],
  },
  {
    id: "golden_health_program_preference",
    name: "건강 프로그램 선호도",
    description:
      "건강/문화/교육/독서/여가 선택지가 있는 프로그램 주제 선호 문항은 민감정보가 아님을 검증합니다.",
    platform: "naver_forms",
    scenarioType: "health_program_preference",
    sampleUrl: "https://form.naver.com/golden/health-program-preference",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/health-program-preference",
      title: "도서관 프로그램 선호도 조사",
      description: "프로그램 편성을 위한 선호도 조사입니다.",
      questions: [
        {
          label: "선호하는 프로그램 주제는 무엇입니까?",
          options: ["건강", "문화", "교육", "독서", "여가"],
        },
      ],
    }),
    expectedDecision: ["SAFE_TO_RESPOND", "RESPOND_WITH_CAUTION"],
    expectedGradeRange: { minScore: 70, maxScore: 95, allowedGrades: ["safe", "caution"] },
    expectedDataItems: {
      generalOpinions: ["프로그램 주제"],
    },
    expectedNotDataItems: ["민감정보", "건강정보"],
    forbiddenPhrases: ["민감정보 또는 민감 맥락 확인 필요", "응답자에게 부담이 큰 정보"],
    requiredPhrases: ["프로그램 주제", "개인정보는 쓰지 마세요"],
  },
  {
    id: "golden_health_status_sensitive",
    name: "건강상태 직접 질문",
    description: "현재 건강상태를 직접 묻는 문항은 민감정보로 분류합니다.",
    platform: "naver_forms",
    scenarioType: "health_status_sensitive",
    sampleUrl: "https://form.naver.com/golden/health-status",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/health-status",
      title: "건강지원 신청 설문",
      description: "건강지원 서비스 신청 설문입니다.",
      questions: ["현재 건강상태는 어떻습니까?"],
    }),
    expectedDecision: ["DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 60, allowedGrades: ["risk", "high_risk"] },
    expectedDataItems: {
      sensitiveItems: ["민감정보(건강)"],
    },
    requiredPhrases: ["민감정보", "응답하지 말", "ISMS-P", "보안 인증"],
  },
  {
    id: "golden_disability_sensitive",
    name: "장애 여부 질문",
    description: "장애 여부를 직접 묻는 문항은 민감정보로 분류합니다.",
    platform: "naver_forms",
    scenarioType: "disability_sensitive",
    sampleUrl: "https://form.naver.com/golden/disability",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/disability",
      title: "편의지원 신청 설문",
      description: "편의지원 제공을 위한 신청 설문입니다.",
      questions: ["장애 여부를 선택해 주세요."],
    }),
    expectedDecision: ["DO_NOT_RESPOND", "REPORT_OR_INQUIRE"],
    expectedGradeRange: { minScore: 0, maxScore: 60, allowedGrades: ["risk", "high_risk"] },
    expectedDataItems: {
      sensitiveItems: ["민감정보(건강)"],
    },
    requiredPhrases: ["민감정보", "응답하지 말", "ISMS-P", "보안 인증"],
  },
  {
    id: "golden_policy_opinion",
    name: "도서관 정책 방향",
    description: "도서관 정책 방향 문항은 민감정보가 아니라 정책 의견입니다.",
    platform: "naver_forms",
    scenarioType: "policy_opinion",
    sampleUrl: "https://form.naver.com/golden/policy-opinion",
    sampleNormalizedForm: form({
      platform: "naver_forms",
      url: "https://form.naver.com/golden/policy-opinion",
      title: "도서관 정책 방향 의견 조사",
      description: "서비스 개선과 정책 방향 수립을 위한 의견 조사입니다.",
      questions: ["도서관 정책 방향은 무엇이라고 생각하십니까?"],
    }),
    expectedDecision: ["SAFE_TO_RESPOND", "RESPOND_WITH_CAUTION"],
    expectedGradeRange: { minScore: 70, maxScore: 95, allowedGrades: ["safe", "caution"] },
    expectedDataItems: {
      generalOpinions: ["정책 방향"],
    },
    expectedNotDataItems: ["민감정보", "건강정보"],
    forbiddenPhrases: ["민감정보 또는 민감 맥락 확인 필요", "응답자에게 부담이 큰 정보"],
    requiredPhrases: ["정책 방향", "개인정보는 쓰지 마세요"],
  },
];
