import type { ScanReport } from "@/lib/types/scan";
import type {
  CollectedDataSummary,
  PrivacyDataType,
  VerdictType,
} from "@/lib/reporting/reportMessages";
import { classifyPrivacyDataType } from "@/lib/reporting/respondentDecision";

/**
 * 사용자 응답 판단 6종 (행동 중심 라벨 — “~형” 미사용)
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
  /** 왜 문제인가요? */
  whyProblem: string;
  /** 법적 위험 | 판단 한계 */
  legalOrLimitTitle: string;
  legalOrLimitBody: string;
  /** 어떻게 해야 하나요? */
  howToAct: string;
  tone: SafetyTypeTone;
  subjectType: SurveySubjectType;
  subjectLabel: string;
  subjectEvidenceLabel?: string;
  subjectMatchMethodLabel?: string;
  dataBadge: string;
  toolBadge: string;
  toolJudgmentBadge: string;
  diagnosisMethodLabel: string;
  fileNameLabel?: string;
  needsReportOrInquire: boolean;
  reportOrInquireLabel: string;
}

const TYPE_META: Record<
  SafetyTypeId,
  { name: string; tone: SafetyTypeTone; headline: string; action: string }
> = {
  SAFE_RESPOND: {
    name: "응답 가능",
    tone: "green",
    headline: "이 설문은 응답해도 무리가 없습니다.",
    action: "자유의견에 개인정보만 쓰지 않으면 응답해도 괜찮습니다.",
  },
  PII_CAUTION: {
    name: "개인정보 없이 응답",
    tone: "amber",
    headline: "응답은 가능하지만, 이름·연락처 등 개인정보는 쓰지 마세요.",
    action:
      "자유의견에는 이름, 연락처, 건강상태, 구체적인 개인 사정을 쓰지 않는 것이 좋습니다.",
  },
  NOTICE_CHECK: {
    name: "안내 없으면 입력 금지",
    tone: "orange",
    headline: "수집 목적과 보관·파기 안내가 없으면 개인정보를 입력하지 마세요.",
    action:
      "개인정보를 왜 수집하는지, 언제까지 보관하는지, 언제 파기하는지, 담당자가 누구인지 안내되어 있는지 확인하세요. 이 안내가 보이지 않으면 입력하지 않는 것이 좋습니다.",
  },
  SECURITY_CHECK: {
    name: "공식 확인 후 응답",
    tone: "blue",
    headline: "공식 설문인지 확인한 뒤 응답하세요.",
    action:
      "기관 홈페이지, 공식 공지, 대표 연락처를 통해 이 설문이 실제 공식 설문인지 확인하세요. 확인되지 않으면 개인정보를 입력하지 않는 것이 좋습니다.",
  },
  STOP_RESPONSE: {
    name: "응답 거부·신고 검토",
    tone: "red",
    headline: "이 설문은 응답하지 않는 것이 좋습니다.",
    action:
      "개인정보를 입력하지 말고 운영기관에 공식 처리 기준을 확인하세요. 설명이 불충분하거나 처리 기준이 불명확하면 응답하지 말고 신고를 검토하세요.",
  },
  JUDGMENT_UNKNOWN: {
    name: "문항 분석 불가",
    tone: "gray",
    headline: "문항 분석이 안 되어 판단이 어렵습니다.",
    action:
      "실제 설문 화면에서 운영기관, 수집 항목, 보유기간, 파기 기준, 담당자 안내를 직접 확인해 주세요.",
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

function isFileSource(report: ScanReport): boolean {
  return report.form.metadata?.source?.kind === "file";
}

function isExternalTool(report: ScanReport): boolean {
  if (isFileSource(report) && report.platform === "generic") {
    return false;
  }
  return (
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic"
  );
}

function platformLabel(report: ScanReport): string {
  if (isFileSource(report)) {
    switch (report.platform) {
      case "google_forms":
        return "Google Forms";
      case "naver_forms":
        return "Naver Form";
      case "moaform":
        return "Moaform";
      default:
        return "파일 기반 설문지";
    }
  }

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
 * 민감/고위험·공공+개인정보+외부도구 → 응답 거부·신고 검토
 * 주체 불명(개인정보 없음) → 공식 확인 후 응답
 * 직접식별 → 안내 없으면 입력 금지
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

  const hasDirect =
    privacyType === "direct_identifier" || summary.directIdentifiers.length > 0;
  const external = isExternalTool(report);

  // 운영기관 불명확 + 개인정보 → 응답 거부·신고 검토
  if (subject === "unknown" && hasDirect) {
    return "STOP_RESPONSE";
  }

  // 공공 + 개인정보 + 외부 범용 도구 → 응답 거부·신고 검토
  if (hasDirect && isPublicLike(subject) && external) {
    return "STOP_RESPONSE";
  }

  // 민간 + 민감은 위에서 처리. 주체 불명(개인정보 없음) → 공식 확인
  if (subject === "unknown") {
    return "SECURITY_CHECK";
  }

  if (hasDirect) {
    return "NOTICE_CHECK";
  }

  if (privacyType === "quasi_only" || verdict === "RESPOND_WITH_CAUTION") {
    return "PII_CAUTION";
  }

  return "SAFE_RESPOND";
}

function buildWhyProblem(
  typeId: SafetyTypeId,
  subject: SurveySubjectType,
  report: ScanReport,
  summary: CollectedDataSummary,
): string {
  switch (typeId) {
    case "SAFE_RESPOND":
      return "이름, 연락처, 이메일처럼 개인을 직접 알아볼 수 있는 정보는 확인되지 않았습니다.";
    case "PII_CAUTION": {
      const items =
        summary.quasiIdentifiers.length > 0
          ? summary.quasiIdentifiers.slice(0, 3).join(", ")
          : "성별, 연령대, 거주지역";
      return `${items}처럼 다른 정보와 결합될 수 있는 항목이 포함되어 있습니다.`;
    }
    case "NOTICE_CHECK":
      return "이 설문은 이름, 연락처, 이메일 등 개인을 직접 알아볼 수 있는 정보를 수집합니다.";
    case "SECURITY_CHECK":
      return "설문 운영기관, 담당자, 공식 링크 여부가 명확하지 않습니다.";
    case "STOP_RESPONSE": {
      if (subject === "unknown") {
        return "설문 운영기관이 명확하지 않은 상태에서 개인정보 입력을 요구하고 있습니다.";
      }
      if (summary.highRiskItems.length > 0) {
        return "주민등록번호, 계좌번호, 신분증 등 고위험 개인정보를 요구할 수 있습니다.";
      }
      if (summary.sensitiveItems.length > 0) {
        return "건강상태, 고충, 피해경험 등 민감한 정보가 포함될 수 있습니다.";
      }
      if (isPublicLike(subject) && isExternalTool(report)) {
        return "공공기관이 이름·연락처 등 개인정보를 수집하면서 CSAP 인증 여부가 확인되지 않은 외부 설문도구를 사용하고 있습니다.";
      }
      return "개인정보 또는 민감정보 처리 기준이 불충분하거나, 응답자에게 불이익이 생길 수 있는 설문으로 보입니다.";
    }
    case "JUDGMENT_UNKNOWN":
      return isFileSource(report)
        ? "파일은 읽었지만 실제 설문 문항과 개인정보 고지문을 충분히 추출하지 못했습니다."
        : "설문 페이지는 확인했지만, 실제 문항과 개인정보 고지문을 자동으로 읽지 못했습니다.";
  }
}

function buildLegalOrLimit(
  typeId: SafetyTypeId,
  subject: SurveySubjectType,
  report: ScanReport,
  summary: CollectedDataSummary,
): { title: string; body: string } {
  if (typeId === "JUDGMENT_UNKNOWN") {
    return {
      title: "판단 한계",
      body: "이 설문이 개인정보나 민감정보를 수집하는지 확인할 수 없습니다.",
    };
  }

  if (typeId === "STOP_RESPONSE") {
    if (isPublicLike(subject) && isExternalTool(report)) {
      return {
        title: "법적 위험",
        body: "개인정보보호법 및 공공부문 클라우드 보안 기준 위반 소지가 큽니다.",
      };
    }
    if (
      summary.sensitiveItems.length > 0 ||
      summary.highRiskItems.length > 0 ||
      subject === "unknown"
    ) {
      return {
        title: "법적 위험",
        body: "개인정보보호법 및 관련 보안 기준 위반 소지가 큽니다.",
      };
    }
    return {
      title: "법적 위험",
      body: "개인정보보호법 및 관련 보안 기준 위반 소지가 큽니다.",
    };
  }

  if (typeId === "NOTICE_CHECK" || typeId === "SECURITY_CHECK") {
    return {
      title: "법적 위험",
      body: "안내가 부족하면 개인정보 수집·이용 기준을 충족하지 못할 소지가 있습니다.",
    };
  }

  if (typeId === "PII_CAUTION") {
    return {
      title: "법적 위험",
      body: "준식별정보만으로도 다른 정보와 결합되면 식별 위험이 생길 수 있습니다.",
    };
  }

  return {
    title: "법적 위험",
    body: "화면에서 확인된 범위에서는 직접식별·민감·고위험 정보가 확인되지 않았습니다.",
  };
}

function buildDescription(
  typeId: SafetyTypeId,
  subject: SurveySubjectType,
  report: ScanReport,
  summary: CollectedDataSummary,
): string {
  return buildWhyProblem(typeId, subject, report, summary);
}

function buildToolJudgmentBadge(
  subject: SurveySubjectType,
  privacyType: PrivacyDataType,
  report: ScanReport,
): string {
  if (privacyType === "limited") {
    return isFileSource(report) ? "파일 문항 추출 제한" : "문항 분석 제한";
  }

  if (isFileSource(report) && report.platform === "generic") {
    return "실제 온라인 수집도구 확인 필요";
  }

  if (privacyType === "minimal") {
    return isExternalTool(report)
      ? "외부도구 안내 및 보유·파기 기준 보완 권고"
      : "별도 조치 낮음";
  }
  if (privacyType === "quasi_only") {
    return "외부도구 안내 및 보유·파기 기준 보완 권고";
  }

  const hasPii =
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk";
  if (!hasPii) return "별도 조치 낮음";

  if (subject === "unknown") return "공식 설문·담당자 확인 권고";

  if (isPublicLike(subject) && isExternalTool(report)) {
    return "CSAP 인증 도구 사용 강력 권고";
  }

  if (!isPublicLike(subject) && isExternalTool(report)) {
    return privacyType === "sensitive_or_high_risk"
      ? "CSAP·ISMS-P·보안인증도구 검토 권고"
      : "ISMS-P·보안인증도구 확인 권고";
  }

  return "보유·파기·담당자 안내 확인 권고";
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
    return "이 설문은 응답하지 않는 것이 좋습니다.";
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

  const institution = report.debug?.publicInstitutionEvidence;
  const baseSubjectLabel =
    limitedUnknown?.subjectLabel ?? SURVEY_SUBJECT_LABELS[subjectType];
  const subjectLabel =
    report.debug?.publicSectorDetected &&
    institution?.matchedBy === "keyword_fallback"
      ? "공공기관 가능성"
      : baseSubjectLabel;
  const subjectEvidenceLabel = institution?.matchedName
    ? institution.evidenceSource &&
      /notice|description|title/i.test(institution.evidenceSource)
      ? `판단 근거: 설문 안내문에 '${institution.matchedName}' 포함`
      : `판단 근거: ${institution.matchedName}`
    : report.debug?.publicSectorEvidence?.[0]
      ? `판단 근거: ${report.debug.publicSectorEvidence[0]}`
      : undefined;
  const subjectMatchMethodLabel = (() => {
    switch (institution?.matchedBy) {
      case "exact_list":
        return "매칭 방식: 공공기관 리스트";
      case "alias":
        return "매칭 방식: 기관명 별칭";
      case "keyword_fallback":
        return "매칭 방식: 기관명 키워드";
      default:
        return report.debug?.publicSectorDetected
          ? "매칭 방식: 공공 키워드·맥락"
          : undefined;
    }
  })();

  const whyProblem = buildWhyProblem(typeId, subjectType, report, summary);
  const legalOrLimit = buildLegalOrLimit(typeId, subjectType, report, summary);
  const howToAct =
    typeId === "JUDGMENT_UNKNOWN" && isFileSource(report)
      ? "텍스트가 포함된 DOCX, HWPX, PDF 또는 문항표 XLSX 파일로 다시 업로드해 주세요."
      : meta.action;

  return {
    typeId,
    typeName: meta.name,
    displayName: meta.name,
    headline: buildHeadline(typeId, subjectType, privacyType),
    description: buildDescription(typeId, subjectType, report, summary),
    action: howToAct,
    whyProblem,
    legalOrLimitTitle: legalOrLimit.title,
    legalOrLimitBody: legalOrLimit.body,
    howToAct,
    tone: meta.tone,
    subjectType,
    subjectLabel,
    subjectEvidenceLabel,
    subjectMatchMethodLabel,
    dataBadge: limitedUnknown?.dataBadge ?? dataBadge(privacyType, summary),
    toolBadge: limitedUnknown?.toolBadge ?? platformLabel(report),
    toolJudgmentBadge: buildToolJudgmentBadge(subjectType, privacyType, report),
    diagnosisMethodLabel: isFileSource(report) ? "파일 업로드" : "설문 링크",
    fileNameLabel: isFileSource(report)
      ? report.form.metadata?.source?.fileName
      : undefined,
    needsReportOrInquire,
    reportOrInquireLabel: needsReportOrInquire
      ? "운영기관 문의 또는 신고 검토"
      : typeId === "JUDGMENT_UNKNOWN"
        ? "설문 화면에서 직접 확인"
        : typeId === "NOTICE_CHECK" || typeId === "SECURITY_CHECK"
          ? "안내·공식 여부 확인 후 응답"
          : typeId === "STOP_RESPONSE"
            ? "응답하지 말고 신고를 검토하세요"
            : "응답 가능",
  };
}

export function isPublicLikeSubject(subject: SurveySubjectType): boolean {
  return isPublicLike(subject);
}
