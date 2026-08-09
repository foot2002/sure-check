import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  assertPublicReportSafe,
  PUBLIC_DISCLOSURE_MESSAGE,
} from "@/lib/report/publicReportPolicy";
import {
  issueDisplayRank,
  toPublicIssueLabel,
} from "@/lib/report/publicIssueLabels";
import {
  classifyLimitedOutcome,
  isReportableAdminOutcome,
} from "@/lib/report/limitedOutcomeBuckets";

export type PublicDashboardRange = "today" | "7d" | "30d" | "custom";

export interface PublicDashboardQuery {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface PublicDashboardSummary {
  totalScans: number;
  personalInfoCount: number;
  personalInfoRate: number;
  sensitiveInfoCount: number;
  sensitiveInfoRate: number;
  highRiskInfoCount: number;
  highRiskInfoRate: number;
  /** @deprecated Prefer attentionNeededCount — kept for compatibility. */
  highOrCriticalCount: number;
  highOrCriticalRate: number;
  /** 주의 필요 = 응답 거부·신고 검토 + 안내 없으면 입력 금지 + 공식 확인 후 응답 */
  attentionNeededCount: number;
  attentionNeededRate: number;
  /** 문항 분석 불가 (JUDGMENT_UNKNOWN) — 주의 필요와 분리 */
  judgmentUnknownCount: number;
  judgmentUnknownRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardTrendRow {
  date: string;
  surveyCount: number;
  personalInfoRate: number;
  sensitiveInfoRate: number;
  highRiskInfoRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardPlatformRow {
  platform: string;
  surveyCount: number;
  personalInfoRate: number;
  sensitiveInfoRate: number;
  highRiskInfoRate: number;
  avgOverallScore: number | null;
}

export interface PublicDashboardIssueRow {
  label: string;
  findingCount: number;
  affectedSurveyCount: number;
  rateOfAllScans: number;
}

export interface PublicDashboardOrgTypeRow {
  typeLabel: string;
  surveyCount: number;
  personalInfoRate: number;
  sensitiveInfoRate: number;
  highRiskInfoRate: number;
  avgOverallScore: number | null;
}

export type PrivacyIndexGrade =
  | "양호"
  | "개선 필요"
  | "주의"
  | "고위험 검토";

export interface PublicPrivacyIndex {
  avgScore: number | null;
  grade: PrivacyIndexGrade | null;
  interpretation: string;
  disclaimer: string;
}

export interface PublicDecisionStatRow {
  decisionKey: string;
  label: string;
  count: number;
  rate: number;
}

export interface PublicQuestionStats {
  totalQuestions: number;
  personalInfoQuestions: number;
  sensitiveQuestions: number;
  highRiskQuestions: number;
  personalInfoQuestionRate: number;
}

export interface PublicDataCategoryStatRow {
  categoryKey: string;
  label: string;
  riskCategory: string | null;
  count: number;
  rate: number;
}

export interface PublicNoticeComplianceRow {
  itemKey: string;
  label: string;
  applicableCount: number;
  compliantCount: number;
  gapCount: number;
  complianceRate: number | null;
}

export interface PublicSectorToolStats {
  publicPersonalInfoSurveyCount: number;
  externalToolReviewCount: number;
  csapOrCloudReviewCount: number;
  byPlatform: Array<{ platform: string; surveyCount: number }>;
  byOrgType: Array<{ typeLabel: string; surveyCount: number }>;
}

export interface PublicDiagnosisQualityStats {
  completedDiagnosisCount: number;
  limitedQuestionAnalysisCount: number;
  evidenceCaptureCount: number;
  fullPathCaptureCount: number;
  avgCapturedPageCount: number | null;
}

export type PublicKeyFindingId =
  | "personal_info"
  | "respondent_caution"
  | "public_external_tool";

export interface PublicKeyFindingCard {
  id: PublicKeyFindingId;
  title: string;
  headline: string;
  detail: string;
  available: boolean;
}

export interface PublicDashboardInsights {
  rangeLabel: string;
  oneLineConclusion: string;
  keySignals: Array<{
    order: number;
    headline: string;
    detail: string;
  }>;
  keyFindings: PublicKeyFindingCard[];
  platformInsight: string;
  pressShareSummary: string;
  /** Same as summary.attentionNeededCount */
  cautionDecisionCount: number;
  /** Same as summary.attentionNeededCount (alias for readers) */
  attentionNeededCount: number;
  judgmentUnknownCount: number;
  reportLikeDecisionCount: number;
  publicExternalToolCheckCount: number;
}

export interface PublicDashboardPayload {
  range: PublicDashboardRange;
  from: string;
  to: string;
  generatedAt: string;
  hasData: boolean;
  isEarlyData: boolean;
  /** Raw survey_records in range (ops/debug). Not used as public KPI denominator. */
  rawTotalScans: number;
  summary: PublicDashboardSummary;
  insights: PublicDashboardInsights;
  privacyIndex: PublicPrivacyIndex;
  trends: PublicDashboardTrendRow[];
  decisionStats: PublicDecisionStatRow[];
  questionStats: PublicQuestionStats;
  dataCategoryStats: PublicDataCategoryStatRow[];
  noticeComplianceStats: PublicNoticeComplianceRow[];
  platformStats: PublicDashboardPlatformRow[];
  publicSectorToolStats: PublicSectorToolStats;
  issueStats: PublicDashboardIssueRow[];
  organizationTypeStats: PublicDashboardOrgTypeRow[];
  diagnosisQualityStats: PublicDiagnosisQualityStats;
  disclosurePolicy: {
    mode: "aggregate_only";
    message: string;
  };
}

const PLATFORM_LABEL: Record<string, string> = {
  google_forms: "Google Forms",
  naver_form: "Naver Form",
  moaform: "Moaform",
  generic: "Generic",
  wiseon_csap: "WiseON",
  unknown: "Unknown",
};

const SUBJECT_LABEL: Record<string, string> = {
  public_agency: "공공기관",
  private_company: "민간기업",
  public_commissioned_private: "공공위탁 민간",
  school_local: "학교/교육기관",
  nonprofit: "비영리/협회",
  medical: "의료기관",
  unknown: "확인 불가",
};

const DECISION_ORDER: Array<{ key: string; label: string; aliases: string[] }> = [
  {
    key: "SAFE_RESPOND",
    label: "응답 가능",
    aliases: ["응답 가능", "SAFE_RESPOND"],
  },
  {
    key: "PII_CAUTION",
    label: "개인정보 없이 응답 권장",
    aliases: ["개인정보 없이 응답", "개인정보 없이 응답 권장", "PII_CAUTION"],
  },
  {
    key: "NOTICE_CHECK",
    label: "안내 없으면 입력 금지",
    aliases: ["안내 없으면 입력 금지", "NOTICE_CHECK"],
  },
  {
    key: "SECURITY_CHECK",
    label: "공식 확인 후 응답",
    aliases: ["공식 확인 후 응답", "SECURITY_CHECK"],
  },
  {
    key: "STOP_RESPONSE",
    label: "응답 거부·신고 검토",
    aliases: ["응답 거부·신고 검토", "STOP_RESPONSE"],
  },
];

/** Ops-only decision — never shown in general public reporting. */
const LIMITED_DECISION_ALIASES = ["문항 분석 불가", "JUDGMENT_UNKNOWN", "LIMITED_DIAGNOSIS"];

const DATA_CATEGORY_BUCKETS: Array<{
  key: string;
  label: string;
  codes: string[];
  labelHints: string[];
}> = [
  {
    key: "name",
    label: "이름",
    codes: ["name"],
    labelHints: ["이름"],
  },
  {
    key: "phone",
    label: "연락처",
    codes: ["phone"],
    labelHints: ["연락처", "전화"],
  },
  {
    key: "email",
    label: "이메일",
    codes: ["email"],
    labelHints: ["이메일", "e-mail"],
  },
  {
    key: "affiliation",
    label: "소속/직장",
    codes: ["affiliation", "organization_identifier", "department", "position"],
    labelHints: ["소속", "직장", "부서", "직급"],
  },
  {
    key: "age",
    label: "연령",
    codes: ["respondent_age", "age_range", "birthdate"],
    labelHints: ["연령", "나이", "생년월일"],
  },
  {
    key: "gender",
    label: "성별",
    codes: ["gender"],
    labelHints: ["성별"],
  },
  {
    key: "residence",
    label: "거주지역",
    codes: ["residence_area", "address"],
    labelHints: ["거주", "주소", "권역"],
  },
  {
    key: "health",
    label: "건강 관련 정보",
    codes: ["sensitive_health"],
    labelHints: ["건강"],
  },
  {
    key: "child",
    label: "자녀 정보",
    codes: ["child_age_range"],
    labelHints: ["자녀"],
  },
  {
    key: "other",
    label: "기타",
    codes: [],
    labelHints: [],
  },
];

const NOTICE_ITEMS: Array<{ key: string; label: string; match: RegExp }> = [
  { key: "purpose", label: "수집 목적 안내", match: /수집\s*목적/ },
  { key: "items", label: "수집 항목 안내", match: /수집\s*항목/ },
  { key: "retention", label: "보유기간 안내", match: /보유\s*기간/ },
  { key: "destruction", label: "파기 기준 안내", match: /파기/ },
  {
    key: "refusal",
    label: "동의 거부권 및 불이익 안내",
    match: /거부권|불이익/,
  },
  {
    key: "contact",
    label: "담당자 연락처 안내",
    match: /담당|문의처|연락처/,
  },
  {
    key: "trustee",
    label: "위탁/외부도구 안내",
    match: /위탁|외부도구/,
  },
  {
    key: "overseas",
    label: "국외이전 안내",
    match: /국외/,
  },
  {
    key: "csap",
    label: "공공부문 CSAP 확인",
    match: /CSAP|클라우드\s*보안/,
  },
];

const PRIVACY_INDEX_DISCLAIMER =
  "이 지수는 자동진단 결과를 바탕으로 산출한 참고 지표이며, 개별 설문의 위법 여부를 확정하는 기준은 아닙니다.";

const EARLY_DATA_THRESHOLD = 30;

const EMPTY_ONE_LINE =
  "아직 충분한 진단 데이터가 없습니다.";

function rangeLabel(range: PublicDashboardRange): string {
  switch (range) {
    case "today":
      return "오늘";
    case "30d":
      return "최근 30일";
    case "custom":
      return "선택 기간";
    case "7d":
    default:
      return "최근 7일";
  }
}

function decisionCount(
  rows: PublicDecisionStatRow[],
  keys: string[],
): number {
  const set = new Set(keys);
  return rows
    .filter((row) => set.has(row.decisionKey))
    .reduce((sum, row) => sum + row.count, 0);
}

/** Unified public definition of "주의 필요 설문". */
const ATTENTION_NEEDED_KEYS = [
  "STOP_RESPONSE",
  "NOTICE_CHECK",
  "SECURITY_CHECK",
] as const;

function buildInsights(input: {
  range: PublicDashboardRange;
  isEarlyData: boolean;
  summary: PublicDashboardSummary;
  decisionStats: PublicDecisionStatRow[];
  platformStats: PublicDashboardPlatformRow[];
  publicSectorToolStats: PublicSectorToolStats;
}): PublicDashboardInsights {
  const label = rangeLabel(input.range);
  const total = input.summary.totalScans;
  const personal = input.summary.personalInfoCount;
  const attentionNeededCount = input.summary.attentionNeededCount;
  const judgmentUnknownCount = input.summary.judgmentUnknownCount;

  const publicPersonal = input.publicSectorToolStats.publicPersonalInfoSurveyCount;
  const publicExternalToolCheckCount = Math.max(
    input.publicSectorToolStats.externalToolReviewCount,
    input.publicSectorToolStats.csapOrCloudReviewCount,
  );

  void judgmentUnknownCount;
  const oneLineConclusion =
    total <= 0
      ? EMPTY_ONE_LINE
      : `${label} 분석 완료된 온라인 설문 ${total.toLocaleString("ko-KR")}건 중 ${personal.toLocaleString("ko-KR")}건이 개인정보를 수집했고, ${attentionNeededCount.toLocaleString("ko-KR")}건은 응답자 관점에서 주의가 필요한 설문으로 분류되었습니다.`;

  const earlyNote = input.isEarlyData ? " (초기 누적 데이터 기준)" : "";

  const keySignals =
    total <= 0
      ? [
          {
            order: 1,
            headline: "아직 충분한 진단 데이터가 없습니다.",
            detail: "진단이 누적되면 핵심 신호가 여기에 표시됩니다.",
          },
        ]
      : [
          {
            order: 1,
            headline:
              personal > total / 2
                ? `개인정보 수집 설문이 많았습니다.${earlyNote}`
                : `개인정보 수집 설문이 확인되었습니다.${earlyNote}`,
            detail: `${label} 분석 완료 설문 ${total.toLocaleString("ko-KR")}건 중 ${personal.toLocaleString("ko-KR")}건이 개인정보를 포함했습니다.`,
          },
          {
            order: 2,
            headline:
              attentionNeededCount > 0
                ? `응답 전 확인이 필요한 설문이 확인되었습니다.${earlyNote}`
                : `응답 전 강한 주의 분류는 적거나 없었습니다.${earlyNote}`,
            detail: `${attentionNeededCount.toLocaleString("ko-KR")}건은 응답 거부·신고 검토 또는 이에 준하는 주의 판단으로 분류되었습니다.`,
          },
          {
            order: 3,
            headline:
              publicPersonal > 0
                ? `공공부문 외부도구 사용 확인 신호가 있었습니다.${earlyNote}`
                : `이번 기간 공공부문 개인정보 수집 설문이 없거나 적습니다.${earlyNote}`,
            detail:
              publicPersonal > 0
                ? `공공부문 개인정보 수집 설문 ${publicPersonal.toLocaleString("ko-KR")}건 중 ${publicExternalToolCheckCount.toLocaleString("ko-KR")}건에서 외부도구 또는 CSAP 확인 필요 신호가 있었습니다.`
                : "공공부문 설문이 누적되면 외부도구·보안 확인 필요 신호를 집계합니다.",
          },
        ];

  const keyFindings: PublicKeyFindingCard[] = [
    {
      id: "personal_info",
      title: "개인정보 수집 현황",
      headline:
        total > 0 && personal > 0
          ? "개인정보를 수집하는 설문이 확인되었습니다."
          : total > 0
            ? "이번 기간에는 개인정보 포함 설문이 적거나 없었습니다."
            : "데이터 누적 필요",
      detail:
        total > 0
          ? `분석 완료 설문 ${total.toLocaleString("ko-KR")}건 중 ${personal.toLocaleString("ko-KR")}건이 개인정보를 포함했습니다.`
          : "진단 데이터가 쌓이면 개인정보 수집 현황을 보여줍니다.",
      available: total > 0,
    },
    {
      id: "respondent_caution",
      title: "응답자 관점 판단",
      headline:
        attentionNeededCount > 0
          ? "응답 전 확인이 필요한 설문이 확인되었습니다."
          : total > 0
            ? "주의 필요 분류는 적거나 없었습니다."
            : "데이터 누적 필요",
      detail:
        total > 0
          ? `${attentionNeededCount.toLocaleString("ko-KR")}건은 응답 거부·신고 검토 또는 이에 준하는 주의 판단으로 분류되었습니다.`
          : "진단 데이터가 쌓이면 응답자 관점 판단을 보여줍니다.",
      available: total > 0,
    },
    {
      id: "public_external_tool",
      title: "공공부문 외부도구 확인",
      headline:
        publicPersonal > 0
          ? "공공부문 설문은 외부도구·보안 기준 확인이 필요합니다."
          : total > 0
            ? "이번 기간 공공부문 개인정보 수집 설문이 없거나 적습니다."
            : "데이터 누적 필요",
      detail:
        publicPersonal > 0
          ? `공공부문 개인정보 수집 설문 ${publicPersonal.toLocaleString("ko-KR")}건 중 ${publicExternalToolCheckCount.toLocaleString("ko-KR")}건에서 외부 설문도구 또는 CSAP 확인 필요 신호가 있었습니다.`
          : total > 0
            ? "공공부문 개인정보 수집 설문이 누적되면 외부도구 확인 필요 신호를 집계합니다."
            : "진단 데이터가 쌓이면 공공부문 외부도구 확인 현황을 보여줍니다.",
      available: total > 0 && publicPersonal > 0,
    },
  ];

  const rankedPlatforms = [...input.platformStats]
    .filter((row) => row.surveyCount > 0)
    .sort(
      (a, b) =>
        b.personalInfoRate - a.personalInfoRate ||
        b.surveyCount - a.surveyCount,
    );
  const top = rankedPlatforms[0];

  let platformInsight: string;
  if (total <= 0 || !top) {
    platformInsight =
      "현재 플랫폼별 통계는 초기 누적 데이터 기준입니다. 진단 건수가 늘어나면 플랫폼별 경향을 더 안정적으로 확인할 수 있습니다.";
  } else if (input.isEarlyData) {
    platformInsight = `이번 기간에는 ${top.platform}에서 개인정보 포함 비율이 가장 높게 나타났습니다. 다만 표본이 적은 초기 통계이므로, 플랫폼 자체의 위험도를 단정하는 자료는 아닙니다.`;
  } else {
    platformInsight = `이번 기간에는 ${top.platform}에서 개인정보 포함 비율이 가장 높게 나타났습니다. 플랫폼별 비율은 참고 지표이며, 개별 설문의 위법 여부를 확정하지 않습니다.`;
  }

  const pressShareSummary =
    total <= 0
      ? "아직 충분한 진단 데이터가 없어 보도·공유용 요약을 작성할 수 없습니다."
      : [
          `${label}간 SURE Check가 분석 완료한 공개 온라인 설문 ${total.toLocaleString("ko-KR")}건 중 ${personal.toLocaleString("ko-KR")}건이 개인정보를 포함했고, ${attentionNeededCount.toLocaleString("ko-KR")}건은 응답자 관점에서 주의가 필요한 설문으로 분류되었습니다.`,
          publicPersonal > 0
            ? `공공부문 개인정보 수집 설문 ${publicPersonal.toLocaleString("ko-KR")}건에서는 외부 설문도구 또는 공공부문 클라우드 보안 확인 필요 신호가 확인되었습니다.`
            : null,
          "본 통계는 자동진단 기반 참고 지표이며, 개별 설문의 위법 여부를 확정하지 않습니다.",
        ]
          .filter(Boolean)
          .join(" ");

  return {
    rangeLabel: label,
    oneLineConclusion,
    keySignals,
    keyFindings,
    platformInsight,
    pressShareSummary,
    cautionDecisionCount: attentionNeededCount,
    attentionNeededCount,
    judgmentUnknownCount,
    reportLikeDecisionCount: attentionNeededCount,
    publicExternalToolCheckCount,
  };
}

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysKst(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function parseDateParam(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function resolvePublicDashboardRange(
  query: PublicDashboardQuery,
): { range: PublicDashboardRange; from: string; to: string } {
  const today = kstToday();
  const fromParam = parseDateParam(query.from);
  const toParam = parseDateParam(query.to);

  if (fromParam && toParam) {
    const from = fromParam <= toParam ? fromParam : toParam;
    const to = fromParam <= toParam ? toParam : fromParam;
    return { range: "custom", from, to };
  }

  const rangeRaw = (query.range || "7d").toLowerCase();
  if (rangeRaw === "today") {
    return { range: "today", from: today, to: today };
  }
  if (rangeRaw === "30d") {
    return { range: "30d", from: addDaysKst(today, -29), to: today };
  }
  return { range: "7d", from: addDaysKst(today, -6), to: today };
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v),
  );
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function emptySummary(): PublicDashboardSummary {
  return {
    totalScans: 0,
    personalInfoCount: 0,
    personalInfoRate: 0,
    sensitiveInfoCount: 0,
    sensitiveInfoRate: 0,
    highRiskInfoCount: 0,
    highRiskInfoRate: 0,
    highOrCriticalCount: 0,
    highOrCriticalRate: 0,
    attentionNeededCount: 0,
    attentionNeededRate: 0,
    judgmentUnknownCount: 0,
    judgmentUnknownRate: 0,
    avgOverallScore: null,
  };
}

function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] || PLATFORM_LABEL.unknown;
}

function subjectLabel(subject: string | null | undefined): string {
  if (!subject) return SUBJECT_LABEL.unknown;
  return SUBJECT_LABEL[subject] || SUBJECT_LABEL.unknown;
}

function privacyGrade(score: number | null): {
  grade: PrivacyIndexGrade | null;
  interpretation: string;
} {
  if (score == null) {
    return {
      grade: null,
      interpretation: "아직 평균 점수를 산출할 진단 데이터가 충분하지 않습니다.",
    };
  }
  if (score >= 80) {
    return { grade: "양호", interpretation: "80점 이상: 양호" };
  }
  if (score >= 60) {
    return { grade: "개선 필요", interpretation: "60~79점: 개선 필요" };
  }
  if (score >= 40) {
    return { grade: "주의", interpretation: "40~59점: 주의" };
  }
  return { grade: "고위험 검토", interpretation: "40점 미만: 고위험 검토" };
}

function resolveDecision(
  safetyTypeId: string | null | undefined,
  userDecisionLabel: string | null | undefined,
): { key: string; label: string } {
  const id = (safetyTypeId || "").trim();
  const label = (userDecisionLabel || "").trim();
  if (
    id === "JUDGMENT_UNKNOWN" ||
    id === "LIMITED_DIAGNOSIS" ||
    LIMITED_DECISION_ALIASES.includes(label)
  ) {
    return { key: "JUDGMENT_UNKNOWN", label: "문항 분석 불가" };
  }
  for (const row of DECISION_ORDER) {
    if (id === row.key) return { key: row.key, label: row.label };
    if (row.aliases.includes(label)) return { key: row.key, label: row.label };
  }
  if (label) {
    return { key: "OTHER", label: "기타 판단" };
  }
  return { key: "OTHER", label: "기타 판단" };
}

/** General public reporting population: analyzable diagnoses only. */
function isAnalyzablePublicSurvey(survey: {
  overall_risk_level: string | null;
  user_decision_label: string | null;
  safety_type_id: string | null;
}): boolean {
  const decision = resolveDecision(
    survey.safety_type_id,
    survey.user_decision_label,
  );
  if (decision.key === "JUDGMENT_UNKNOWN") return false;
  const bucket = classifyLimitedOutcome({
    overallRiskLevel: survey.overall_risk_level,
    userDecisionLabel: survey.user_decision_label,
  });
  return isReportableAdminOutcome(bucket);
}

function mapDataCategoryBucket(
  categoryCode: string,
  categoryLabel: string,
): { key: string; label: string } {
  const code = (categoryCode || "").toLowerCase();
  const label = categoryLabel || "";
  for (const bucket of DATA_CATEGORY_BUCKETS) {
    if (bucket.key === "other") continue;
    if (bucket.codes.includes(code)) {
      return { key: bucket.key, label: bucket.label };
    }
    if (bucket.labelHints.some((hint) => label.includes(hint))) {
      return { key: bucket.key, label: bucket.label };
    }
  }
  // Skip pure opinion categories from TOP personal-info list
  if (
    [
      "general_opinion",
      "satisfaction",
      "preference",
      "policy_opinion",
      "service_feedback",
      "improvement_opinion",
      "program_preference",
      "visit_purpose",
    ].includes(code)
  ) {
    return { key: "__skip__", label: "" };
  }
  return { key: "other", label: "기타" };
}

function mapNoticeItem(checkItem: string): { key: string; label: string } | null {
  for (const item of NOTICE_ITEMS) {
    if (item.match.test(checkItem)) {
      return { key: item.key, label: item.label };
    }
  }
  return null;
}

function isGapStatus(status: string): boolean {
  return (
    status === "missing" ||
    status === "insufficient" ||
    status === "needs_review" ||
    status === "improvement_recommended"
  );
}

interface SurveyAggRow {
  id: string;
  observed_date_kst: string | null;
  subject_type: string | null;
  public_private_type: string | null;
  platform: string | null;
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  overall_risk_level: string | null;
  user_decision_label: string | null;
  safety_type_id: string | null;
  question_count: number | null;
  personal_info_question_count: number | null;
  sensitive_question_count: number | null;
  high_risk_question_count: number | null;
}

interface FindingAggRow {
  survey_record_id: string;
  finding_type: string;
  check_domain: string | null;
}

interface ComplianceAggRow {
  survey_record_id: string;
  check_item: string;
  status: string;
}

interface CaptureAggRow {
  completeness: string | null;
  captured_page_count: number | null;
  status: string | null;
}

interface CategoryAggRow {
  category_code: string;
  category_label: string;
  risk_category: string | null;
  survey_questions?:
    | { observed_date_kst?: string; survey_record_id?: string }
    | Array<{ observed_date_kst?: string; survey_record_id?: string }>
    | null;
}

function emptyQuestionStats(): PublicQuestionStats {
  return {
    totalQuestions: 0,
    personalInfoQuestions: 0,
    sensitiveQuestions: 0,
    highRiskQuestions: 0,
    personalInfoQuestionRate: 0,
  };
}

function emptyPublicSectorToolStats(): PublicSectorToolStats {
  return {
    publicPersonalInfoSurveyCount: 0,
    externalToolReviewCount: 0,
    csapOrCloudReviewCount: 0,
    byPlatform: [],
    byOrgType: [],
  };
}

function emptyDiagnosisQualityStats(): PublicDiagnosisQualityStats {
  return {
    completedDiagnosisCount: 0,
    limitedQuestionAnalysisCount: 0,
    evidenceCaptureCount: 0,
    fullPathCaptureCount: 0,
    avgCapturedPageCount: null,
  };
}

export async function buildPublicDashboard(
  query: PublicDashboardQuery = {},
): Promise<PublicDashboardPayload> {
  const { range, from, to } = resolvePublicDashboardRange(query);
  const supabase = createSupabaseServerClient();

  const [surveyRes, findingRes, complianceRes, captureRes, categoryRes] =
    await Promise.all([
      supabase
        .from("survey_records")
        .select(
          "id, observed_date_kst, subject_type, public_private_type, platform, has_personal_info, has_sensitive_info, has_high_risk_info, overall_risk_level, user_decision_label, safety_type_id, question_count, personal_info_question_count, sensitive_question_count, high_risk_question_count",
        )
        .gte("observed_date_kst", from)
        .lte("observed_date_kst", to),
      supabase
        .from("survey_findings")
        .select("survey_record_id, finding_type, check_domain")
        .gte("observed_date_kst", from)
        .lte("observed_date_kst", to),
      supabase
        .from("survey_compliance_checks")
        .select("survey_record_id, check_item, status")
        .gte("observed_date_kst", from)
        .lte("observed_date_kst", to),
      supabase
        .from("capture_jobs")
        .select("completeness, captured_page_count, status")
        .gte("observed_date_kst", from)
        .lte("observed_date_kst", to),
      supabase
        .from("question_data_categories")
        .select(
          "category_code, category_label, risk_category, survey_questions!inner(observed_date_kst, survey_record_id)",
        )
        .gte("survey_questions.observed_date_kst", from)
        .lte("survey_questions.observed_date_kst", to),
    ]);

  if (surveyRes.error) throw new Error(`survey records: ${surveyRes.error.message}`);
  if (findingRes.error) throw new Error(`survey findings: ${findingRes.error.message}`);
  if (complianceRes.error) {
    throw new Error(`compliance checks: ${complianceRes.error.message}`);
  }
  if (captureRes.error) throw new Error(`capture jobs: ${captureRes.error.message}`);
  // Category join may fail on older schemas — fall back to empty rather than hard-fail.
  const categoryError = categoryRes.error;
  if (categoryError) {
    console.warn("[public-dashboard] data categories:", categoryError.message);
  }

  const rawSurveys = (surveyRes.data || []) as SurveyAggRow[];
  const rawTotalScans = rawSurveys.length;
  const surveys = rawSurveys.filter(isAnalyzablePublicSurvey);
  const eligibleIds = new Set(surveys.map((s) => s.id));
  const findings = ((findingRes.data || []) as FindingAggRow[]).filter((f) =>
    eligibleIds.has(f.survey_record_id),
  );
  const complianceRows = (
    (complianceRes.data || []) as ComplianceAggRow[]
  ).filter((row) => eligibleIds.has(row.survey_record_id));
  const captures = (captureRes.data || []) as CaptureAggRow[];
  const categories = (
    (categoryError ? [] : categoryRes.data || []) as CategoryAggRow[]
  ).filter((row) => {
    const q = Array.isArray(row.survey_questions)
      ? row.survey_questions[0]
      : row.survey_questions;
    const sid = q?.survey_record_id;
    return typeof sid === "string" && eligibleIds.has(sid);
  });

  let scoreBySurveyId = new Map<string, number>();
  if (eligibleIds.size > 0) {
    const scoreRes = await supabase
      .from("survey_index_scores")
      .select("survey_record_id, overall_score")
      .in("survey_record_id", [...eligibleIds]);
    if (scoreRes.error) {
      console.warn("[public-dashboard] index scores:", scoreRes.error.message);
    } else {
      scoreBySurveyId = new Map(
        ((scoreRes.data || []) as Array<{
          survey_record_id: string;
          overall_score: number | null;
        }>)
          .filter(
            (row) =>
              typeof row.overall_score === "number" &&
              !Number.isNaN(row.overall_score),
          )
          .map((row) => [row.survey_record_id, Number(row.overall_score)]),
      );
    }
  }

  const totalScans = surveys.length;
  const avgOverallScore = avg([...scoreBySurveyId.values()]);

  const summary: PublicDashboardSummary =
    totalScans === 0
      ? emptySummary()
      : {
          totalScans,
          personalInfoCount: surveys.filter((s) => s.has_personal_info).length,
          personalInfoRate: 0,
          sensitiveInfoCount: surveys.filter((s) => s.has_sensitive_info).length,
          sensitiveInfoRate: 0,
          highRiskInfoCount: surveys.filter((s) => s.has_high_risk_info).length,
          highRiskInfoRate: 0,
          highOrCriticalCount: surveys.filter(
            (s) =>
              s.overall_risk_level === "high" ||
              s.overall_risk_level === "critical",
          ).length,
          highOrCriticalRate: 0,
          attentionNeededCount: 0,
          attentionNeededRate: 0,
          // Ops-only metric — always 0 in general reporting population.
          judgmentUnknownCount: 0,
          judgmentUnknownRate: 0,
          avgOverallScore,
        };

  if (totalScans > 0) {
    summary.personalInfoRate = rate(summary.personalInfoCount, totalScans);
    summary.sensitiveInfoRate = rate(summary.sensitiveInfoCount, totalScans);
    summary.highRiskInfoRate = rate(summary.highRiskInfoCount, totalScans);
    summary.highOrCriticalRate = rate(summary.highOrCriticalCount, totalScans);
  }

  const gradeInfo = privacyGrade(summary.avgOverallScore);
  const privacyIndex: PublicPrivacyIndex = {
    avgScore: summary.avgOverallScore,
    grade: gradeInfo.grade,
    interpretation: gradeInfo.interpretation,
    disclaimer: PRIVACY_INDEX_DISCLAIMER,
  };

  const trendMap = new Map<
    string,
    {
      surveyCount: number;
      personalInfoCount: number;
      sensitiveInfoCount: number;
      highRiskInfoCount: number;
      scores: number[];
    }
  >();
  for (const survey of surveys) {
    const date = survey.observed_date_kst || from;
    let bucket = trendMap.get(date);
    if (!bucket) {
      bucket = {
        surveyCount: 0,
        personalInfoCount: 0,
        sensitiveInfoCount: 0,
        highRiskInfoCount: 0,
        scores: [],
      };
      trendMap.set(date, bucket);
    }
    bucket.surveyCount += 1;
    if (survey.has_personal_info) bucket.personalInfoCount += 1;
    if (survey.has_sensitive_info) bucket.sensitiveInfoCount += 1;
    if (survey.has_high_risk_info) bucket.highRiskInfoCount += 1;
    const score = scoreBySurveyId.get(survey.id);
    if (score != null) bucket.scores.push(score);
  }
  const trends: PublicDashboardTrendRow[] = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      surveyCount: bucket.surveyCount,
      personalInfoRate: rate(bucket.personalInfoCount, bucket.surveyCount),
      sensitiveInfoRate: rate(bucket.sensitiveInfoCount, bucket.surveyCount),
      highRiskInfoRate: rate(bucket.highRiskInfoCount, bucket.surveyCount),
      avgOverallScore: avg(bucket.scores),
    }));

  const platformMap = new Map<
    string,
    {
      surveyCount: number;
      personalInfoCount: number;
      sensitiveInfoCount: number;
      highRiskInfoCount: number;
      scores: number[];
    }
  >();
  for (const key of Object.keys(PLATFORM_LABEL)) {
    platformMap.set(key, {
      surveyCount: 0,
      personalInfoCount: 0,
      sensitiveInfoCount: 0,
      highRiskInfoCount: 0,
      scores: [],
    });
  }
  for (const survey of surveys) {
    const key =
      survey.platform && survey.platform in PLATFORM_LABEL
        ? survey.platform
        : "unknown";
    const bucket = platformMap.get(key)!;
    bucket.surveyCount += 1;
    if (survey.has_personal_info) bucket.personalInfoCount += 1;
    if (survey.has_sensitive_info) bucket.sensitiveInfoCount += 1;
    if (survey.has_high_risk_info) bucket.highRiskInfoCount += 1;
    const score = scoreBySurveyId.get(survey.id);
    if (score != null) bucket.scores.push(score);
  }
  const platformStats: PublicDashboardPlatformRow[] = [...platformMap.entries()]
    .map(([platform, bucket]) => ({
      platform: platformLabel(platform),
      surveyCount: bucket.surveyCount,
      personalInfoRate: rate(bucket.personalInfoCount, bucket.surveyCount),
      sensitiveInfoRate: rate(bucket.sensitiveInfoCount, bucket.surveyCount),
      highRiskInfoRate: rate(bucket.highRiskInfoCount, bucket.surveyCount),
      avgOverallScore: avg(bucket.scores),
    }))
    .filter((row) => row.surveyCount > 0 || totalScans === 0)
    .sort((a, b) => b.surveyCount - a.surveyCount);

  // Decision distribution (analyzable only — no JUDGMENT_UNKNOWN)
  const decisionMap = new Map<string, PublicDecisionStatRow>();
  for (const row of DECISION_ORDER) {
    decisionMap.set(row.key, {
      decisionKey: row.key,
      label: row.label,
      count: 0,
      rate: 0,
    });
  }
  for (const survey of surveys) {
    const resolved = resolveDecision(
      survey.safety_type_id,
      survey.user_decision_label,
    );
    if (resolved.key === "JUDGMENT_UNKNOWN") continue;
    const existing = decisionMap.get(resolved.key);
    if (existing) {
      existing.count += 1;
    } else {
      decisionMap.set(resolved.key, {
        decisionKey: resolved.key,
        label: resolved.label,
        count: 1,
        rate: 0,
      });
    }
  }
  const decisionStats = [...decisionMap.values()]
    .map((row) => ({
      ...row,
      rate: rate(row.count, totalScans),
    }))
    .filter(
      (row) =>
        row.decisionKey !== "JUDGMENT_UNKNOWN" &&
        (row.count > 0 || totalScans === 0),
    )
    .sort((a, b) => {
      const ai = DECISION_ORDER.findIndex((d) => d.key === a.decisionKey);
      const bi = DECISION_ORDER.findIndex((d) => d.key === b.decisionKey);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return b.count - a.count;
    });

  // Question-level aggregates from analyzable survey_records
  const questionStats: PublicQuestionStats =
    surveys.length === 0
      ? emptyQuestionStats()
      : (() => {
          const totalQuestions = surveys.reduce(
            (s, row) => s + (row.question_count || 0),
            0,
          );
          const personalInfoQuestions = surveys.reduce(
            (s, row) => s + (row.personal_info_question_count || 0),
            0,
          );
          const sensitiveQuestions = surveys.reduce(
            (s, row) => s + (row.sensitive_question_count || 0),
            0,
          );
          const highRiskQuestions = surveys.reduce(
            (s, row) => s + (row.high_risk_question_count || 0),
            0,
          );
          return {
            totalQuestions,
            personalInfoQuestions,
            sensitiveQuestions,
            highRiskQuestions,
            personalInfoQuestionRate: rate(personalInfoQuestions, totalQuestions),
          };
        })();

  // Data category TOP (aggregate labels only, analyzable surveys)
  const categoryCount = new Map<
    string,
    { label: string; riskCategory: string | null; count: number }
  >();
  for (const row of categories) {
    const bucket = mapDataCategoryBucket(row.category_code, row.category_label);
    if (bucket.key === "__skip__") continue;
    const existing = categoryCount.get(bucket.key);
    if (existing) {
      existing.count += 1;
      if (!existing.riskCategory && row.risk_category) {
        existing.riskCategory = row.risk_category;
      }
    } else {
      categoryCount.set(bucket.key, {
        label: bucket.label,
        riskCategory: row.risk_category,
        count: 1,
      });
    }
  }
  const categoryTotal = [...categoryCount.values()].reduce(
    (s, row) => s + row.count,
    0,
  );
  const dataCategoryStats: PublicDataCategoryStatRow[] = DATA_CATEGORY_BUCKETS.map(
    (bucket) => {
      const found = categoryCount.get(bucket.key);
      const count = found?.count || 0;
      return {
        categoryKey: bucket.key,
        label: bucket.label,
        riskCategory: found?.riskCategory || null,
        count,
        rate: rate(count, categoryTotal),
      };
    },
  ).filter((row) => row.count > 0 || totalScans === 0);

  // Notice compliance rates
  const noticeMap = new Map<
    string,
    { label: string; applicable: number; compliant: number; gap: number }
  >();
  for (const item of NOTICE_ITEMS) {
    noticeMap.set(item.key, {
      label: item.label,
      applicable: 0,
      compliant: 0,
      gap: 0,
    });
  }
  for (const row of complianceRows) {
    if (row.status === "not_applicable") continue;
    const mapped = mapNoticeItem(row.check_item || "");
    if (!mapped) continue;
    const bucket = noticeMap.get(mapped.key);
    if (!bucket) continue;
    bucket.applicable += 1;
    if (row.status === "compliant") bucket.compliant += 1;
    else if (isGapStatus(row.status)) bucket.gap += 1;
  }

  // CSAP proxy: public + personal info surveys not on WiseON
  const publicPersonalSurveys = surveys.filter(
    (s) => s.public_private_type === "public" && s.has_personal_info,
  );
  const csapBucket = noticeMap.get("csap");
  if (csapBucket && publicPersonalSurveys.length > 0) {
    for (const survey of publicPersonalSurveys) {
      csapBucket.applicable += 1;
      if (survey.platform === "wiseon_csap") {
        csapBucket.compliant += 1;
      } else {
        csapBucket.gap += 1;
      }
    }
  }

  const noticeComplianceStats: PublicNoticeComplianceRow[] = [...noticeMap.entries()]
    .map(([itemKey, bucket]) => ({
      itemKey,
      label: bucket.label,
      applicableCount: bucket.applicable,
      compliantCount: bucket.compliant,
      gapCount: bucket.gap,
      complianceRate:
        bucket.applicable > 0
          ? rate(bucket.compliant, bucket.applicable)
          : null,
    }))
    .filter((row) => row.applicableCount > 0 || totalScans === 0);

  // Public sector external tool stats
  const publicSectorByPlatform = new Map<string, number>();
  const publicSectorByOrgType = new Map<string, number>();
  let externalToolReviewCount = 0;
  let csapOrCloudReviewCount = 0;
  for (const survey of publicPersonalSurveys) {
    const platform = platformLabel(survey.platform || "unknown");
    publicSectorByPlatform.set(
      platform,
      (publicSectorByPlatform.get(platform) || 0) + 1,
    );
    const orgType = subjectLabel(survey.subject_type);
    publicSectorByOrgType.set(
      orgType,
      (publicSectorByOrgType.get(orgType) || 0) + 1,
    );
    if (survey.platform !== "wiseon_csap") {
      externalToolReviewCount += 1;
      csapOrCloudReviewCount += 1;
    }
  }
  // Also count public_sector_cloud findings as confirmation signals (survey-level unique)
  const publicSectorFindingSurveys = new Set(
    findings
      .filter((f) => toPublicIssueLabel(f.finding_type, f.check_domain) ===
        "공공부문 클라우드 보안 확인 필요")
      .map((f) => f.survey_record_id),
  );
  if (publicSectorFindingSurveys.size > csapOrCloudReviewCount) {
    csapOrCloudReviewCount = publicSectorFindingSurveys.size;
  }

  const publicSectorToolStats: PublicSectorToolStats = {
    publicPersonalInfoSurveyCount: publicPersonalSurveys.length,
    externalToolReviewCount,
    csapOrCloudReviewCount,
    byPlatform: [...publicSectorByPlatform.entries()]
      .map(([platform, surveyCount]) => ({ platform, surveyCount }))
      .sort((a, b) => b.surveyCount - a.surveyCount),
    byOrgType: [...publicSectorByOrgType.entries()]
      .map(([typeLabel, surveyCount]) => ({ typeLabel, surveyCount }))
      .sort((a, b) => b.surveyCount - a.surveyCount),
  };

  // Issue stats — dedupe by public label; rate = affected surveys / all scans
  const issueMap = new Map<
    string,
    { findingCount: number; surveyIds: Set<string> }
  >();
  for (const row of findings) {
    const label = toPublicIssueLabel(row.finding_type, row.check_domain);
    if (label === "문항 분석 제한") continue;
    const existing = issueMap.get(label);
    if (existing) {
      existing.findingCount += 1;
      existing.surveyIds.add(row.survey_record_id);
    } else {
      issueMap.set(label, {
        findingCount: 1,
        surveyIds: new Set([row.survey_record_id]),
      });
    }
  }
  const issueRows = [...issueMap.entries()].map(([label, bucket]) => ({
    label,
    findingCount: bucket.findingCount,
    affectedSurveyCount: bucket.surveyIds.size,
    rateOfAllScans: rate(bucket.surveyIds.size, totalScans),
  }));
  const specificIssues = issueRows
    .filter((row) => row.label !== "기타 확인 필요")
    .sort((a, b) => {
      const impact =
        b.affectedSurveyCount - a.affectedSurveyCount ||
        b.findingCount - a.findingCount;
      if (impact !== 0) return impact;
      return issueDisplayRank(a.label) - issueDisplayRank(b.label);
    });
  const otherIssues = issueRows.filter((row) => row.label === "기타 확인 필요");
  // Prefer concrete labels; only expose "기타" when no specific issues exist.
  const issueStats: PublicDashboardIssueRow[] =
    specificIssues.length > 0
      ? specificIssues.slice(0, 10)
      : otherIssues.slice(0, 3);

  // Organization type stats
  const orgMap = new Map<
    string,
    {
      surveyCount: number;
      personalInfoCount: number;
      sensitiveInfoCount: number;
      highRiskInfoCount: number;
    }
  >();
  for (const label of Object.values(SUBJECT_LABEL)) {
    orgMap.set(label, {
      surveyCount: 0,
      personalInfoCount: 0,
      sensitiveInfoCount: 0,
      highRiskInfoCount: 0,
    });
  }
  for (const row of surveys) {
    const label = subjectLabel(row.subject_type);
    const bucket = orgMap.get(label)!;
    bucket.surveyCount += 1;
    if (row.has_personal_info) bucket.personalInfoCount += 1;
    if (row.has_sensitive_info) bucket.sensitiveInfoCount += 1;
    if (row.has_high_risk_info) bucket.highRiskInfoCount += 1;
  }
  const organizationTypeStats: PublicDashboardOrgTypeRow[] = [...orgMap.entries()]
    .map(([typeLabel, bucket]) => ({
      typeLabel,
      surveyCount: bucket.surveyCount,
      personalInfoRate: rate(bucket.personalInfoCount, bucket.surveyCount),
      sensitiveInfoRate: rate(bucket.sensitiveInfoCount, bucket.surveyCount),
      highRiskInfoRate: rate(bucket.highRiskInfoCount, bucket.surveyCount),
      avgOverallScore: null,
    }))
    .filter((row) => row.surveyCount > 0)
    .sort((a, b) => b.surveyCount - a.surveyCount);

  // Diagnosis quality — public surface never exposes limited/extraction counts.
  const diagnosisQualityStats: PublicDiagnosisQualityStats =
    totalScans === 0 && captures.length === 0
      ? emptyDiagnosisQualityStats()
      : {
          completedDiagnosisCount: totalScans,
          limitedQuestionAnalysisCount: 0,
          evidenceCaptureCount: captures.filter(
            (c) =>
              c.status === "completed" ||
              c.completeness === "complete" ||
              c.completeness === "partial" ||
              (c.captured_page_count || 0) > 0,
          ).length,
          fullPathCaptureCount: captures.filter(
            (c) => c.completeness === "complete",
          ).length,
          avgCapturedPageCount: avg(
            captures.map((c) => c.captured_page_count ?? null),
          ),
        };

  const emptyPlatformStats = Object.values(PLATFORM_LABEL).map((platform) => ({
    platform,
    surveyCount: 0,
    personalInfoRate: 0,
    sensitiveInfoRate: 0,
    highRiskInfoRate: 0,
    avgOverallScore: null,
  }));

  const isEarlyData = totalScans > 0 && totalScans < EARLY_DATA_THRESHOLD;
  const resolvedPlatformStats =
    totalScans === 0 ? emptyPlatformStats : platformStats;
  const resolvedPublicSector =
    totalScans === 0 ? emptyPublicSectorToolStats() : publicSectorToolStats;
  const resolvedDecisionStats =
    totalScans === 0
      ? DECISION_ORDER.map((d) => ({
          decisionKey: d.key,
          label: d.label,
          count: 0,
          rate: 0,
        }))
      : decisionStats;

  // Unify "주의 필요" with citizen decision labels (analyzable population only).
  const attentionNeededCount = decisionCount(resolvedDecisionStats, [
    ...ATTENTION_NEEDED_KEYS,
  ]);
  summary.attentionNeededCount = attentionNeededCount;
  summary.attentionNeededRate = rate(attentionNeededCount, totalScans);
  summary.judgmentUnknownCount = 0;
  summary.judgmentUnknownRate = 0;
  // Align legacy KPI field with the unified attention definition.
  summary.highOrCriticalCount = attentionNeededCount;
  summary.highOrCriticalRate = summary.attentionNeededRate;

  const insights = buildInsights({
    range,
    isEarlyData,
    summary,
    decisionStats: resolvedDecisionStats,
    platformStats: resolvedPlatformStats,
    publicSectorToolStats: resolvedPublicSector,
  });

  const payload: PublicDashboardPayload = {
    range,
    from,
    to,
    generatedAt: new Date().toISOString(),
    hasData: totalScans > 0,
    isEarlyData,
    rawTotalScans,
    summary,
    insights,
    privacyIndex,
    trends,
    decisionStats: resolvedDecisionStats,
    questionStats,
    dataCategoryStats:
      totalScans === 0
        ? DATA_CATEGORY_BUCKETS.map((b) => ({
            categoryKey: b.key,
            label: b.label,
            riskCategory: null,
            count: 0,
            rate: 0,
          }))
        : dataCategoryStats,
    noticeComplianceStats:
      totalScans === 0
        ? NOTICE_ITEMS.map((item) => ({
            itemKey: item.key,
            label: item.label,
            applicableCount: 0,
            compliantCount: 0,
            gapCount: 0,
            complianceRate: null,
          }))
        : noticeComplianceStats,
    platformStats: resolvedPlatformStats,
    publicSectorToolStats: resolvedPublicSector,
    issueStats,
    organizationTypeStats,
    diagnosisQualityStats,
    disclosurePolicy: {
      mode: "aggregate_only",
      message: PUBLIC_DISCLOSURE_MESSAGE,
    },
  };

  assertPublicReportSafe(payload);
  return payload;
}
