import type { ScanReport } from "@/lib/types/scan";
import type {
  CollectedDataSummary,
  PrivacyDataType,
  VerdictType,
} from "@/lib/reporting/reportMessages";
import { classifyPrivacyDataType } from "@/lib/reporting/respondentDecision";

/**
 * 사용자 행동 중심 설문 안전유형 (6종)
 * 설문주체(공공/기업)는 유형명에 붙이지 않고 배지로만 표시한다.
 */
export type SafetyTypeId =
  | "SAFE_RESPOND"
  | "PII_CAUTION"
  | "NOTICE_CHECK"
  | "SECURITY_CHECK"
  | "STOP_RESPONSE"
  | "JUDGMENT_UNKNOWN";

export type SurveySubjectType =
  | "public_agency"
  | "private_company"
  | "public_commissioned_private"
  | "nonprofit"
  | "school_local"
  | "medical"
  | "unknown";

export type SafetyTypeTone =
  | "green"
  | "amber"
  | "orange"
  | "blue"
  | "red"
  | "gray";

export interface SafetyTypeProfile {
  typeId: SafetyTypeId;
  typeName: string;
  displayName: string;
  headline: string;
  description: string;
  action: string;
  tone: SafetyTypeTone;
  subjectType: SurveySubjectType;
  subjectLabel: string;
  dataBadge: string;
  toolBadge: string;
  toolJudgmentBadge: string;
  needsReportOrInquire: boolean;
  reportOrInquireLabel: string;
}

const TYPE_META: Record<
  SafetyTypeId,
  { name: string; tone: SafetyTypeTone; headline: string; action: string }
> = {
  SAFE_RESPOND: {
    name: "안심응답형",
    tone: "green",
    headline: "이 설문은 응답해도 무리가 낮습니다.",
    action: "그냥 응답해도 무리가 낮습니다.",
  },
  PII_CAUTION: {
    name: "개인정보 주의형",
    tone: "amber",
    headline: "응답은 가능하지만, 개인정보를 추가로 쓰지 마세요.",
    action: "자유의견에는 이름, 연락처, 구체적인 개인 사정을 쓰지 마세요.",
  },
  NOTICE_CHECK: {
    name: "고지확인형",
    tone: "orange",
    headline: "개인정보를 수집합니다. 고지문 확인 전에는 입력하지 마세요.",
    action: "수집 목적, 보유기간, 파기 기준, 담당자를 확인한 뒤 응답하세요.",
  },
  SECURITY_CHECK: {
    name: "보안확인형",
    tone: "blue",
    headline: "개인정보를 수집하며, 도구와 관리체계 확인이 필요합니다.",
    action: "고지문과 함께 보안 인증 도구 또는 인증 수행기관 여부를 확인하세요.",
  },
  STOP_RESPONSE: {
    name: "응답중지형",
    tone: "red",
    headline: "이 설문은 응답하지 않는 것이 좋습니다.",
    action: "운영기관에 먼저 문의하고, 개인정보 처리 기준이 불명확하면 신고를 검토하세요.",
  },
  JUDGMENT_UNKNOWN: {
    name: "판단불가형",
    tone: "gray",
    headline: "이 설문은 안전성을 판단할 수 없습니다.",
    action: "개인정보를 입력하기 전 운영기관과 고지문을 직접 확인하세요.",
  },
};

export const SURVEY_SUBJECT_LABELS: Record<SurveySubjectType, string> = {
  public_agency: "공공기관",
  private_company: "민간기업",
  public_commissioned_private: "공공위탁 수행기관",
  nonprofit: "비영리/협회/단체",
  school_local: "학교/교육기관",
  medical: "의료기관",
  unknown: "주체 확인 불가",
};

function isExternalTool(report: ScanReport): boolean {
  return (
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic"
  );
}

function platformLabel(report: ScanReport): string {
  switch (report.platform) {
    case "google_forms":
      return "Google Forms";
    case "naver_forms":
      return "Naver Form";
    case "moaform":
      return "Moaform";
    default:
      return "확인 불가";
  }
}

function dataBadge(
  type: PrivacyDataType,
  summary: CollectedDataSummary,
): string {
  if (type === "limited") return "확인 불가";
  if (type === "sensitive_or_high_risk") {
    if (summary.highRiskItems.length > 0) return "고위험정보 포함";
    return "민감정보 가능성";
  }
  if (type === "direct_identifier") {
    if (summary.directIdentifiers.length > 0) {
      return summary.directIdentifiers.slice(0, 2).join("·") + " 수집";
    }
    return "개인정보 포함";
  }
  if (type === "quasi_only") return "준식별정보";
  return "개인정보 거의 없음";
}

export function classifySurveySubject(report: ScanReport): SurveySubjectType {
  const labels = (report.debug?.contextLabels ?? []).join(" ");
  const summary = report.debug?.contextSummary ?? "";
  const evidence = (report.debug?.publicSectorEvidence ?? []).join(" ");
  const title = report.form.title ?? "";
  const text = `${labels} ${summary} ${evidence} ${title} ${report.form.operatorType ?? ""}`;

  if (/병원|의료|클리닉|clinic|hospital/i.test(text)) return "medical";
  if (
    /학교|교육청|교육지원청|도서관|박물관|체육시설|문화시설|지자체|시군구/.test(
      text,
    )
  ) {
    if (report.debug?.publicSectorDetected) return "school_local";
  }
  if (
    /협회|재단|비영리|NGO|시민단체/.test(text) &&
    !report.debug?.publicSectorDetected
  ) {
    return "nonprofit";
  }
  if (
    report.debug?.publicSectorDetected &&
    /위탁|용역|수행기관|조사기관|대행|발주/.test(text)
  ) {
    return "public_commissioned_private";
  }
  if (report.debug?.publicSectorDetected) return "public_agency";

  const contactMissing = (report.debug?.missingNotices ?? []).some((gap) =>
    /담당|처리자|문의/.test(gap.label),
  );
  const noOperator =
    !report.form.notices?.processor &&
    !report.form.notices?.contactDepartment &&
    (!report.form.operatorType || report.form.operatorType === "미확인");

  if (contactMissing && noOperator && !report.debug?.publicSectorDetected) {
    return "unknown";
  }

  if (/기업|회사|주식회사|마케팅|컨설팅|민간/.test(text)) {
    return "private_company";
  }

  return report.debug?.publicSectorDetected
    ? "public_agency"
    : "private_company";
}

function isPublicLike(subject: SurveySubjectType): boolean {
  return (
    subject === "public_agency" ||
    subject === "public_commissioned_private" ||
    subject === "school_local"
  );
}

/**
 * 민감/고위험 → 응답중지형 우선
 * 공공 + 개인정보 + 외부도구 → 보안확인형
 * 그 외 직접식별 → 고지확인형
 */
function resolveSafetyTypeId(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType: PrivacyDataType,
  verdict: VerdictType,
  subject: SurveySubjectType,
): SafetyTypeId {
  if (privacyType === "limited" || verdict === "LIMITED_DIAGNOSIS") {
    return "JUDGMENT_UNKNOWN";
  }

  const hasSensitiveOrHighRisk =
    privacyType === "sensitive_or_high_risk" ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;

  if (
    hasSensitiveOrHighRisk ||
    verdict === "DO_NOT_RESPOND" ||
    verdict === "REPORT_OR_INQUIRE"
  ) {
    return "STOP_RESPONSE";
  }

  // 주체 불명 + 직접식별정보
  if (
    subject === "unknown" &&
    (privacyType === "direct_identifier" || summary.directIdentifiers.length > 0)
  ) {
    return "STOP_RESPONSE";
  }

  const hasDirect =
    privacyType === "direct_identifier" || summary.directIdentifiers.length > 0;
  const external = isExternalTool(report);

  if (hasDirect) {
    // 공공 + 개인정보 + 외부도구 → 보안확인형
    if (isPublicLike(subject) && external) {
      return "SECURITY_CHECK";
    }
    // 민간 + 외부도구여도 기본적으로 고지확인형 (예시 기준)
    // 단, Google Forms 등에서 도구 확인이 특히 중요하면 보안확인형으로 올릴 수 있음
    if (external && report.platform === "google_forms" && isPublicLike(subject)) {
      return "SECURITY_CHECK";
    }
    return "NOTICE_CHECK";
  }

  if (privacyType === "quasi_only" || verdict === "RESPOND_WITH_CAUTION") {
    return "PII_CAUTION";
  }

  return "SAFE_RESPOND";
}

function buildDescription(
  typeId: SafetyTypeId,
  subject: SurveySubjectType,
  report: ScanReport,
  summary: CollectedDataSummary,
): string {
  switch (typeId) {
    case "JUDGMENT_UNKNOWN":
      if (report.platform === "moaform") {
        return "모아폼 페이지는 확인했지만, 실제 설문 문항과 개인정보 고지문을 자동으로 읽지 못했습니다.";
      }
      return "설문 문항과 개인정보 안내문을 충분히 확인하지 못했습니다.";
    case "SAFE_RESPOND":
      return "이름, 연락처, 이메일 등 개인을 직접 알아볼 수 있는 정보는 확인되지 않았습니다. 다만 자유의견에는 개인정보를 쓰지 않는 것이 좋습니다.";
    case "PII_CAUTION": {
      const items =
        summary.quasiIdentifiers.length > 0
          ? summary.quasiIdentifiers.slice(0, 3).join(", ")
          : "연령대, 거주지역";
      return `${items}처럼 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다. 이름·연락처는 요구하지 않습니다.`;
    }
    case "NOTICE_CHECK":
      return "이름, 연락처, 이메일, 주소 등은 개인을 직접 알아볼 수 있는 정보입니다. 수집 목적, 보유기간, 파기 기준, 담당자 안내가 확인되어야 합니다.";
    case "SECURITY_CHECK":
      return "개인정보를 수집하는 설문은 문항 고지만으로 충분하지 않습니다. 사용 도구의 보안성, 접근권한, 보유·파기 관리, 인증 여부를 함께 확인해야 합니다.";
    case "STOP_RESPONSE":
      if (subject === "unknown") {
        return "설문 운영기관이 명확하지 않은 상태에서 개인정보 또는 민감정보가 요구될 수 있습니다. 별도 동의, 수집 필요성, 접근권한, 보유기간, 파기 기준이 명확해야 합니다.";
      }
      return "민감정보 또는 고위험 개인정보가 포함될 수 있습니다. 별도 동의, 수집 필요성, 접근권한, 보유기간, 파기 기준이 명확해야 합니다.";
  }
}

function buildToolJudgmentBadge(
  subject: SurveySubjectType,
  privacyType: PrivacyDataType,
  report: ScanReport,
): string {
  if (privacyType === "limited") return "인증 여부 확인 필요";
  if (privacyType === "minimal") {
    return isExternalTool(report) ? "외부도구 안내 참고" : "문제 낮음";
  }
  if (privacyType === "quasi_only") {
    return "외부도구 안내 및 보유·파기 기준 보완 권고";
  }

  const hasPii =
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk";
  if (!hasPii) return "문제 낮음";

  if (subject === "unknown") return "인증 여부 확인 필요";

  if (isPublicLike(subject) && isExternalTool(report)) {
    return "CSAP 인증 도구 사용 강력 권고";
  }

  if (!isPublicLike(subject) && isExternalTool(report)) {
    return privacyType === "sensitive_or_high_risk"
      ? "CSAP·ISMS-P·보안인증도구 검토 권고"
      : "ISMS-P·보안인증도구 확인 권고";
  }

  return "인증 여부 확인 필요";
}

function buildHeadline(
  typeId: SafetyTypeId,
  subject: SurveySubjectType,
  privacyType: PrivacyDataType,
): string {
  if (
    typeId === "STOP_RESPONSE" &&
    subject === "unknown" &&
    (privacyType === "direct_identifier" ||
      privacyType === "sensitive_or_high_risk")
  ) {
    return "운영기관이 불명확한 상태에서 개인정보를 요구합니다. 응답하지 않는 것이 좋습니다.";
  }
  return TYPE_META[typeId].headline;
}

export function buildSafetyTypeProfile(
  report: ScanReport,
  summary: CollectedDataSummary,
  verdict: VerdictType,
  needsReportOrInquire: boolean,
): SafetyTypeProfile {
  const privacyType = classifyPrivacyDataType(report, summary);
  const subjectType = classifySurveySubject(report);
  const typeId = resolveSafetyTypeId(
    report,
    summary,
    privacyType,
    verdict,
    subjectType,
  );
  const meta = TYPE_META[typeId];

  const limitedUnknown =
    typeId === "JUDGMENT_UNKNOWN"
      ? {
          dataBadge: "확인 불가",
          toolBadge: platformLabel(report),
          subjectLabel:
            report.form.metadata?.operatorHint
              ? `${report.form.metadata.operatorHint} (확인 필요)`
              : subjectType === "unknown"
                ? "확인 불가"
                : SURVEY_SUBJECT_LABELS[subjectType],
        }
      : null;

  return {
    typeId,
    typeName: meta.name,
    displayName: meta.name,
    headline: buildHeadline(typeId, subjectType, privacyType),
    description: buildDescription(typeId, subjectType, report, summary),
    action: meta.action,
    tone: meta.tone,
    subjectType,
    subjectLabel:
      limitedUnknown?.subjectLabel ?? SURVEY_SUBJECT_LABELS[subjectType],
    dataBadge: limitedUnknown?.dataBadge ?? dataBadge(privacyType, summary),
    toolBadge: limitedUnknown?.toolBadge ?? platformLabel(report),
    toolJudgmentBadge: buildToolJudgmentBadge(subjectType, privacyType, report),
    needsReportOrInquire,
    reportOrInquireLabel: needsReportOrInquire
      ? "운영기관 문의 또는 신고 검토"
      : typeId === "JUDGMENT_UNKNOWN"
        ? "고지문 직접 확인 필요"
        : typeId === "NOTICE_CHECK" || typeId === "SECURITY_CHECK"
          ? "고지문 확인 전 입력 보류"
          : "신고 검토 해당 없음",
  };
}
