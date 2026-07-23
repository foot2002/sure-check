import type { ScanReport } from "@/lib/types/scan";
import type { CollectedDataSummary, PrivacyDataType } from "@/lib/reporting/reportMessages";
import { classifyPrivacyDataType } from "@/lib/reporting/respondentDecision";
import {
  classifySurveySubject,
  type SurveySubjectType,
} from "@/lib/reporting/safetyType";
import {
  LEGAL_BASIS_REGISTRY,
  type LegalBasisEntry,
  type LegalBasisId,
} from "@/lib/reporting/legalBasisRegistry";
import { isCsapCertifiedTool } from "@/lib/reporting/toolRegistry";
import {
  buildNoticeCorpus,
  evaluateCorpusNoticeChecks,
} from "@/lib/reporting/noticeCorpusChecks";

export type NoticeCheckStatus =
  | "confirmed"
  | "partial"
  | "missing"
  | "not_applicable";

export type NoticeCheckStatusLabel =
  | "확인됨"
  | "일부 부족"
  | "미확인"
  | "해당 없음";

export interface DataEvidenceRow {
  category: string;
  evidence: string;
  judgment: string;
  extraCount: number;
}

export interface NoticeCheckRow {
  item: string;
  status: NoticeCheckStatus;
  statusLabel: NoticeCheckStatusLabel;
  evidence: string;
}

export interface SubjectToolEvidenceRow {
  item: string;
  result: string;
  evidence: string;
}

export interface DetailedEvidenceSummary {
  dataEvidence: DataEvidenceRow[];
  noticeChecks: NoticeCheckRow[];
  noticeExtraMissingCount: number;
  subjectToolEvidence: SubjectToolEvidenceRow[];
  appliedLegalBasis: LegalBasisEntry[];
  diagnosisLimitations: string[];
  isLimited: boolean;
}

const STATUS_LABEL: Record<NoticeCheckStatus, NoticeCheckStatusLabel> = {
  confirmed: "확인됨",
  partial: "일부 부족",
  missing: "미확인",
  not_applicable: "해당 없음",
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function formatEvidence(items: string[], max = 2): { text: string; extra: number } {
  const list = unique(items);
  if (list.length === 0) return { text: "해당 문항 없음", extra: 0 };
  const shown = list.slice(0, max).map((item) => `"${item}"`);
  const extra = Math.max(0, list.length - max);
  const text =
    shown.join(", ") + (extra > 0 ? ` 외 ${extra}건` : " 문항");
  return { text, extra };
}

function isPublicLike(subject: SurveySubjectType): boolean {
  return (
    subject === "public_agency" ||
    subject === "public_commissioned_private" ||
    subject === "school_local"
  );
}

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
      return "기타/미확인";
  }
}

function subjectLabel(subject: SurveySubjectType): string {
  switch (subject) {
    case "public_agency":
      return "공공기관";
    case "private_company":
      return "민간기업";
    case "public_commissioned_private":
      return "공공위탁 수행기관";
    case "nonprofit":
      return "비영리/협회/단체";
    case "school_local":
      return "학교/교육기관";
    case "medical":
      return "의료기관";
    case "unknown":
      return "주체 확인 불가";
  }
}

export function groupDetectedDataEvidence(
  summary: CollectedDataSummary,
): DataEvidenceRow[] {
  const rows: DataEvidenceRow[] = [];

  if (summary.directIdentifiers.length > 0) {
    const { text, extra } = formatEvidence(summary.directIdentifiers);
    rows.push({
      category: "직접식별정보",
      evidence: text,
      judgment: "개인을 직접 알아볼 수 있는 정보",
      extraCount: extra,
    });
  }

  if (summary.quasiIdentifiers.length > 0) {
    const { text, extra } = formatEvidence(summary.quasiIdentifiers);
    rows.push({
      category: "준식별정보",
      evidence: text,
      judgment: "다른 정보와 결합될 수 있는 정보",
      extraCount: extra,
    });
  }

  if (summary.sensitiveItems.length > 0) {
    const { text, extra } = formatEvidence(summary.sensitiveItems);
    rows.push({
      category: "민감정보",
      evidence: text,
      judgment: "민감정보 또는 민감 맥락",
      extraCount: extra,
    });
  }

  if (summary.highRiskItems.length > 0) {
    const { text, extra } = formatEvidence(summary.highRiskItems);
    rows.push({
      category: "고위험정보",
      evidence: text,
      judgment: "고유식별·금융 등 고위험 개인정보",
      extraCount: extra,
    });
  }

  if (summary.generalOpinions.length > 0) {
    const { text, extra } = formatEvidence(summary.generalOpinions);
    rows.push({
      category: "일반 의견/선호도",
      evidence: text,
      judgment: "개인정보가 아닌 일반 의견",
      extraCount: extra,
    });
  }

  return rows;
}

export function buildNoticeCheckEvidence(
  report: ScanReport,
  privacyType: PrivacyDataType,
  summary: CollectedDataSummary,
): { rows: NoticeCheckRow[]; allRows: NoticeCheckRow[]; extraMissing: number } {
  const hasPii =
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk" ||
    summary.directIdentifiers.length > 0 ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;
  const hasSensitive =
    privacyType === "sensitive_or_high_risk" || summary.sensitiveItems.length > 0;
  const needsOverseas = hasPii && report.platform === "google_forms";
  const needsTrustee =
    hasPii &&
    (report.platform === "naver_forms" ||
      report.platform === "moaform" ||
      report.platform === "google_forms");
  const needsCoreNotice =
    hasPii || privacyType === "quasi_only" || privacyType === "minimal";

  const corpusResults = evaluateCorpusNoticeChecks(report, {
    needsTrustee,
    needsOverseas,
    checkRawAccess: hasPii,
  });

  const rowsFromCorpus: NoticeCheckRow[] = corpusResults
    .filter((result) => {
      if (result.key === "contact" || result.key === "trustee") return true;
      if (result.key === "overseas") return needsOverseas;
      if (result.key === "raw_access") return hasPii;
      if (result.key === "refusal") return hasPii;
      if (result.key === "destruction") {
        return hasPii || privacyType === "quasi_only";
      }
      if (result.key === "retention") return needsCoreNotice;
      return hasPii || privacyType === "quasi_only";
    })
    .map((result) => {
      const status: NoticeCheckStatus = result.confirmed ? "confirmed" : "missing";
      return {
        item: result.item,
        status,
        statusLabel: STATUS_LABEL[status],
        evidence: result.evidence,
      };
    });

  if (hasSensitive) {
    const sensitiveOk =
      Boolean(report.form.notices?.sensitiveConsent) ||
      /민감정보.{0,20}별도\s*동의|별도\s*동의/.test(
        buildNoticeCorpus(report.form),
      );
    rowsFromCorpus.push({
      item: "민감정보 별도 동의",
      status: sensitiveOk ? "confirmed" : "missing",
      statusLabel: sensitiveOk ? "확인됨" : "미확인",
      evidence: sensitiveOk
        ? "민감정보 별도 동의 관련 문구 확인"
        : "민감정보 별도 동의 문구를 찾지 못함",
    });
  }

  const actionable = rowsFromCorpus.filter(
    (row) => row.status !== "not_applicable",
  );
  const priority = (status: NoticeCheckStatus) => {
    if (status === "missing") return 0;
    if (status === "partial") return 1;
    return 2;
  };
  const sorted = [...actionable].sort(
    (a, b) => priority(a.status) - priority(b.status),
  );
  const primary = sorted.slice(0, 8);
  const restMissing = sorted
    .slice(8)
    .filter((row) => row.status === "missing" || row.status === "partial");

  return {
    rows: primary,
    allRows: sorted,
    extraMissing: restMissing.length,
  };
}

export function buildSubjectToolEvidence(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType: PrivacyDataType,
): SubjectToolEvidenceRow[] {
  const subject = classifySurveySubject(report);
  const hasPii =
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk" ||
    summary.directIdentifiers.length > 0 ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;
  const publicLike = isPublicLike(subject);
  const external = isExternalTool(report);
  const rows: SubjectToolEvidenceRow[] = [];

  rows.push({
    item: "설문주체",
    result: subjectLabel(subject),
    evidence: (() => {
      const institution = report.debug?.publicInstitutionEvidence;
      if (institution?.matchedName) {
        const method =
          institution.matchedBy === "exact_list"
            ? "공공기관 리스트"
            : institution.matchedBy === "alias"
              ? "기관명 별칭"
              : institution.matchedBy === "keyword_fallback"
                ? "기관명 키워드"
                : "공공 맥락";
        return `공공기관 리스트에서 '${institution.matchedName}' 매칭 (${method})`;
      }
      if (subject === "unknown") return "운영기관명 또는 담당자 정보 미확인";
      return (
        report.debug?.publicSectorEvidence?.[0] ||
        report.debug?.contextSummary ||
        "설문 제목·맥락 신호로 판단"
      );
    })(),
  });

  rows.push({
    item: "사용도구",
    result: platformLabel(report),
    evidence:
      report.platform === "google_forms"
        ? "forms.gle 또는 docs.google.com/forms 도메인"
        : report.platform === "naver_forms"
          ? "form.naver.com 도메인"
          : report.platform === "moaform"
            ? "moaform.com 도메인"
            : "지원 플랫폼 미확인 또는 일반 HTML",
  });

  if (report.debug?.publicInstitutionEvidence?.matchedName) {
    rows.push({
      item: "공공부문 여부",
      result: "공공기관",
      evidence: `매칭 근거: ${report.debug.publicInstitutionEvidence.evidenceText ?? report.debug.publicInstitutionEvidence.matchedName}`,
    });
  } else {
    rows.push({
      item: "공공부문 여부",
      result: publicLike ? "해당" : "해당 없음",
      evidence: publicLike
        ? "공공기관·공공시설·공공위탁 맥락 확인"
        : "공공부문 신호가 확인되지 않음",
    });
  }
  rows.push({
    item: "외부 SaaS 여부",
    result: external ? "해당" : "해당 없음",
    evidence: external
      ? `${platformLabel(report)} 외부 설문 SaaS 사용`
      : "외부 SaaS로 확인되지 않음",
  });

  // CSAP / ISMS-P — only when PII present
  if (hasPii && external && publicLike) {
    rows.push({
      item: "CSAP 확인 필요 여부",
      result: isCsapCertifiedTool(report.platform)
        ? "인증 확인됨"
        : "CSAP 인증 도구 사용 강력 권고",
      evidence: "공공기관 + 개인정보 수집 + 외부 클라우드 도구 사용",
    });
  }

  if (hasPii && external && !publicLike && subject !== "unknown") {
    rows.push({
      item: "ISMS-P/보안인증도구 확인 필요 여부",
      result: "보안인증도구·ISMS-P 확인 권고",
      evidence: "민간기업 + 개인정보 수집 + 범용 외부 설문도구 사용",
    });
  }

  if (hasPii && report.platform === "google_forms") {
    rows.push({
      item: "국외 보관·이전 가능성",
      result: "확인 필요",
      evidence: "Google Forms 해외 SaaS 사용",
    });
  }

  if (
    hasPii &&
    (report.platform === "naver_forms" ||
      report.platform === "moaform" ||
      report.platform === "google_forms")
  ) {
    rows.push({
      item: "위탁/수탁자 확인 필요 여부",
      result: "확인 필요",
      evidence: "외부 설문도구 사용에 따른 위탁 안내 확인",
    });
  }

  return rows;
}

export function buildAppliedLegalBasis(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType: PrivacyDataType,
): LegalBasisEntry[] {
  const ids = new Set<LegalBasisId>();
  const hasPii =
    privacyType === "direct_identifier" ||
    privacyType === "sensitive_or_high_risk" ||
    summary.directIdentifiers.length > 0;
  const hasSensitive =
    privacyType === "sensitive_or_high_risk" || summary.sensitiveItems.length > 0;
  const hasHighRisk = summary.highRiskItems.length > 0;
  const subject = classifySurveySubject(report);
  const publicLike = isPublicLike(subject);
  const external = isExternalTool(report);

  if (privacyType === "minimal" && !hasPii) {
    ids.add("PIPA_ART_16");
    return [...ids].map((id) => LEGAL_BASIS_REGISTRY[id]);
  }

  if (privacyType === "quasi_only" || hasPii) {
    ids.add("PIPA_ART_15");
    ids.add("PIPA_ART_21");
  }
  if (hasPii) {
    ids.add("PIPA_ART_29");
  }
  if (hasSensitive) ids.add("PIPA_ART_23");
  if (hasHighRisk) ids.add("PIPA_ART_24");
  if (
    hasPii &&
    (report.platform === "naver_forms" ||
      report.platform === "moaform" ||
      report.platform === "google_forms")
  ) {
    ids.add("PIPA_ART_26");
  }
  if (hasPii && report.platform === "google_forms") {
    ids.add("PIPA_ART_28_8");
  }
  if (hasPii && external && publicLike) {
    ids.add("CSAP_PUBLIC_CLOUD");
    ids.add("MOIS_PUBLIC_CLOUD_NOTICE");
    ids.add("NIS_SECURITY_REVIEW");
  }
  if (hasPii && external && !publicLike && subject !== "unknown") {
    ids.add("ISMS_P");
  }
  if (privacyType === "minimal" || privacyType === "quasi_only") {
    ids.add("PIPA_ART_16");
  }

  return [...ids].map((id) => LEGAL_BASIS_REGISTRY[id]);
}

export function buildDiagnosisLimitations(
  report: ScanReport,
  isLimited: boolean,
): string[] {
  const items = [
    "설문 화면에서 자동 확인 가능한 문항과 안내문 기준으로 분석했습니다.",
    "로그인 후 표시되는 문항은 확인하지 못할 수 있습니다.",
    "동적으로 로딩되는 일부 문항은 누락될 수 있습니다.",
    "운영기관 내부의 실제 접근권한, 보관 위치, 파기 이행 여부는 확인하지 못합니다.",
    "본 결과는 법률 위반 확정이 아닌 자동 위험 진단입니다.",
  ];

  if (isLimited || report.isLimited) {
    return [
      "설문 문항을 자동으로 충분히 확인하지 못했습니다.",
      "로그인·접근 제한·동적 로딩으로 화면 문항이 누락됐을 수 있습니다.",
      "운영기관과 고지문을 직접 확인하기 전에는 안전성을 확정할 수 없습니다.",
      "본 결과는 법률 위반 확정이 아닌 자동 위험 진단입니다.",
    ];
  }

  return items.slice(0, 5);
}

export function buildDetailedEvidenceSummary(
  report: ScanReport,
  summary: CollectedDataSummary,
): DetailedEvidenceSummary {
  const privacyType = classifyPrivacyDataType(report, summary);
  const isLimited =
    Boolean(report.isLimited) ||
    privacyType === "limited" ||
    report.form.questions.length === 0;
  const notice = buildNoticeCheckEvidence(report, privacyType, summary);

  return {
    dataEvidence: isLimited ? [] : groupDetectedDataEvidence(summary),
    noticeChecks: isLimited ? [] : notice.rows,
    noticeExtraMissingCount: isLimited ? 0 : notice.extraMissing,
    subjectToolEvidence: buildSubjectToolEvidence(report, summary, privacyType),
    appliedLegalBasis: buildAppliedLegalBasis(report, summary, privacyType),
    diagnosisLimitations: buildDiagnosisLimitations(report, isLimited),
    isLimited,
  };
}
