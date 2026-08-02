import { createHash } from "node:crypto";
import type {
  CheckDomain,
  ComplianceCheckStatus,
  DataRiskCategory,
  DiagnosisStatus,
  FindingSeverity,
  FindingType,
  OverallRiskLevel,
  Platform as DbPlatform,
  PublicPrivateType,
  SurveySubjectType,
} from "@/lib/db/types";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import { evaluateCorpusNoticeChecks } from "@/lib/reporting/noticeCorpusChecks";
import type { SurveySubjectType as ReportingSubjectType } from "@/lib/reporting/safetyType";
import type {
  DetectedCategory,
  Platform as ScanPlatform,
  RiskGrade,
  ScanFinding,
  ScanReport,
  Severity,
} from "@/lib/types/scan";

export interface MonitoringScanJobInsert {
  external_scan_id: string;
  source_kind: "url" | "file";
  form_url: string | null;
  file_name: string | null;
  url_host: string | null;
  form_url_hash: string | null;
  survey_url_hash: string | null;
  platform: DbPlatform;
  status: "completed" | "failed" | "limited";
  current_step: number;
  total_steps: number;
  step_label: string | null;
  error_message: string | null;
  observed_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MonitoringScanReportInsert {
  external_scan_id: string;
  diagnosis_status: DiagnosisStatus;
  confidence: "high" | "medium" | "low" | "none" | null;
  overall_risk_level: OverallRiskLevel;
  risk_grade: RiskGrade | null;
  score: number | null;
  safety_type_id: string | null;
  user_decision_label: string;
  internal_verdict: string | null;
  summary: string | null;
  report_json: Record<string, unknown>;
  report_summary: Record<string, unknown> | null;
  disclaimer: string;
  limitation_reasons: string[];
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  has_quasi_identifiers: boolean;
  publish_status: "draft";
  review_status: "none";
  observed_at: string;
  generated_at: string;
  generated_at_kst: string | null;
}

export interface MonitoringSurveyRecordInsert {
  survey_title: string | null;
  survey_url: string | null;
  final_url: string | null;
  url_host: string | null;
  form_url_hash: string | null;
  survey_url_hash: string | null;
  source_kind: "url" | "file";
  platform: DbPlatform;
  tool_name: string | null;
  operator_name: string | null;
  public_private_type: PublicPrivateType;
  subject_type: SurveySubjectType | null;
  sector: string | null;
  industry: string | null;
  region: string | null;
  overall_risk_level: OverallRiskLevel;
  user_decision_label: string | null;
  safety_type_id: string | null;
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  question_count: number;
  personal_info_question_count: number;
  sensitive_question_count: number;
  high_risk_question_count: number;
  review_status: "none";
  publish_status: "draft";
  observed_at: string;
}

export interface MonitoringQuestionInsert {
  question_key: string;
  question_number: string | null;
  page_number: number | null;
  question_label: string;
  question_type: string | null;
  is_required: boolean | null;
  data_risk_level: "D0" | "D1" | "D2" | "D3" | "D4" | "D5" | null;
  risk_tags: string[];
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
  sort_order: number;
  observed_at: string;
  categories: MonitoringCategoryInsert[];
}

export interface MonitoringCategoryInsert {
  category_code: string;
  category_label: string;
  risk_category: DataRiskCategory;
  confidence: "high" | "medium" | "low" | "none" | null;
  matched_keyword: string | null;
}

export interface MonitoringComplianceCheckInsert {
  check_domain: CheckDomain;
  check_item: string;
  status: ComplianceCheckStatus;
  status_label: string;
  evidence_note: string | null;
  legal_basis_code: string | null;
  is_confirmed_violation: false;
  observed_at: string;
}

export interface MonitoringFindingInsert {
  finding_type: FindingType;
  check_domain: CheckDomain | null;
  severity: FindingSeverity;
  title: string;
  description: string | null;
  recommendation: string | null;
  evidence_note: string | null;
  legal_basis_codes: string[];
  status: "open";
  is_confirmed_violation: false;
  observed_at: string;
}

export interface MonitoringIndexScoreInsert {
  overall_score: number | null;
  data_score: number | null;
  tool_score: number | null;
  notice_score: number | null;
  management_score: number | null;
  personal_info_score: number | null;
  sensitive_info_score: number | null;
  high_risk_info_score: number | null;
  compliance_gap_score: number | null;
  overall_risk_level: OverallRiskLevel;
  score_version: string;
  observed_at: string;
}

export interface MonitoringSnapshotRows {
  scanJob: MonitoringScanJobInsert;
  scanReport: MonitoringScanReportInsert;
  surveyRecord: MonitoringSurveyRecordInsert;
  questions: MonitoringQuestionInsert[];
  complianceChecks: MonitoringComplianceCheckInsert[];
  findings: MonitoringFindingInsert[];
  indexScores: MonitoringIndexScoreInsert;
}

const DIRECT = new Set<DetectedCategory>([
  "name",
  "phone",
  "email",
  "address",
  "birthdate",
]);
const QUASI = new Set<DetectedCategory>([
  "gender",
  "respondent_age",
  "age_range",
  "child_age_range",
  "residence_area",
  "affiliation",
  "organization_identifier",
  "department",
  "position",
  "tenure",
  "quasi_identifier",
]);
const SENSITIVE = new Set<DetectedCategory>([
  "sensitive_health",
  "sensitive_belief_union",
  "sensitive_complaint",
  "sensitive_political",
  "sensitive_religion",
]);
const HIGH_RISK = new Set<DetectedCategory>([
  "unique_identifier",
  "financial",
  "resident_registration_number",
  "passport_number",
  "driver_license_number",
  "foreign_registration_number",
  "id_document",
  "financial_account",
  "authentication_secret",
]);

const NOTICE_DOMAIN: Record<string, CheckDomain> = {
  purpose: "notice",
  items: "notice",
  retention: "retention",
  destruction: "destruction",
  refusal: "consent",
  contact: "contact",
  trustee: "outsourcing",
  overseas: "overseas_transfer",
  raw_access: "management",
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseUrlParts(url: string | null | undefined): {
  host: string | null;
  hash: string | null;
} {
  const raw = (url || "").trim();
  if (!raw) return { host: null, hash: null };
  try {
    const parsed = new URL(raw);
    return { host: parsed.host || null, hash: sha256Hex(raw) };
  } catch {
    return { host: null, hash: sha256Hex(raw) };
  }
}

export function toDbPlatform(platform: ScanPlatform | string | null | undefined): DbPlatform {
  const value = (platform || "unknown").toLowerCase();
  if (value === "google_forms") return "google_forms";
  if (value === "naver_forms" || value === "naver_form") return "naver_form";
  if (value === "moaform") return "moaform";
  if (value === "generic") return "generic";
  if (value === "wiseon_csap") return "wiseon_csap";
  return "unknown";
}

function gradeToOverallRisk(
  grade: RiskGrade | undefined,
  isLimited: boolean | undefined,
): OverallRiskLevel {
  if (isLimited) return "limited";
  switch (grade) {
    case "safe":
      return "low";
    case "caution":
      return "medium";
    case "risk":
      return "high";
    case "high_risk":
      return "critical";
    default:
      return "unknown";
  }
}

function toPublicPrivateType(
  subject: ReportingSubjectType | string | null | undefined,
): PublicPrivateType {
  switch (subject) {
    case "public_agency":
    case "school_local":
    case "public_commissioned_private":
      return "public";
    case "private_company":
      return "private";
    case "nonprofit":
    case "medical":
      return "mixed";
    default:
      return "unknown";
  }
}

function toSurveySubjectType(
  subject: ReportingSubjectType | string | null | undefined,
): SurveySubjectType | null {
  const allowed: SurveySubjectType[] = [
    "public_agency",
    "private_company",
    "public_commissioned_private",
    "nonprofit",
    "school_local",
    "medical",
    "unknown",
  ];
  if (subject && (allowed as string[]).includes(subject)) {
    return subject as SurveySubjectType;
  }
  return "unknown";
}

function categoryRisk(category: DetectedCategory): DataRiskCategory {
  if (DIRECT.has(category)) return "direct_identifier";
  if (QUASI.has(category)) return "quasi_identifier";
  if (SENSITIVE.has(category)) return "sensitive_info";
  if (HIGH_RISK.has(category)) return "high_risk_info";
  if (
    category === "general_opinion" ||
    category === "satisfaction" ||
    category === "preference" ||
    category === "policy_opinion" ||
    category === "service_feedback" ||
    category === "improvement_opinion" ||
    category === "program_preference" ||
    category === "visit_purpose"
  ) {
    return "general_opinion";
  }
  return "other";
}

function questionFlags(categories: DetectedCategory[]): {
  has_personal_info: boolean;
  has_sensitive_info: boolean;
  has_high_risk_info: boolean;
} {
  return {
    has_personal_info: categories.some((c) => DIRECT.has(c) || QUASI.has(c)),
    has_sensitive_info: categories.some((c) => SENSITIVE.has(c)),
    has_high_risk_info: categories.some((c) => HIGH_RISK.has(c)),
  };
}

function findingSeverity(severity: Severity | undefined): FindingSeverity {
  switch (severity) {
    case "critical":
    case "high":
      return "violation_risk";
    case "medium":
      return "deficiency_suspected";
    case "low":
      return "needs_review";
    default:
      return "info";
  }
}

function findingType(finding: ScanFinding): FindingType {
  switch (finding.category) {
    case "data":
      if (/민감/.test(finding.title) || /민감/.test(finding.description)) {
        return "sensitive_info_risk";
      }
      if (/고유|주민|여권|계좌|고위험/.test(`${finding.title}${finding.description}`)) {
        return "high_risk_info";
      }
      return "personal_info_risk";
    case "notice":
      return /동의/.test(finding.title) ? "consent_gap" : "notice_gap";
    case "tool":
      return /국외|해외/.test(`${finding.title}${finding.description}`)
        ? "overseas_transfer"
        : /위탁|외부/.test(`${finding.title}${finding.description}`)
          ? "outsourcing"
          : /CSAP|공공/.test(`${finding.title}${finding.description}`)
            ? "public_sector_cloud"
            : "tool_governance";
    case "management":
      return "management_gap";
    case "context":
      return /운영|기관|주체/.test(`${finding.title}${finding.description}`)
        ? "operator_unclear"
        : "other";
    default:
      return "other";
  }
}

function findingDomain(finding: ScanFinding): CheckDomain | null {
  switch (finding.category) {
    case "notice":
      return "notice";
    case "tool":
      return "tool_governance";
    case "management":
      return "management";
    case "data":
      return "sensitive_data";
    default:
      return "other";
  }
}

function noticeStatus(
  key: string,
  confirmed: boolean,
): { status: ComplianceCheckStatus; status_label: string } {
  if (confirmed) {
    return { status: "compliant", status_label: "확인됨(안내 존재)" };
  }
  if (key === "contact") {
    return {
      status: "improvement_recommended",
      status_label: "개선 권고(문의처 미흡)",
    };
  }
  return { status: "missing", status_label: "미흡·확인 필요" };
}

function sanitizeReportJson(report: ScanReport): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  delete clone.evidence;
  // Never persist browser secrets if accidentally attached later
  delete clone.cookies;
  delete clone.headers;
  delete clone.tokens;
  delete clone.session;
  return clone;
}

function toolName(platform: DbPlatform): string {
  switch (platform) {
    case "google_forms":
      return "Google Forms";
    case "naver_form":
      return "Naver Form";
    case "moaform":
      return "Moaform";
    case "wiseon_csap":
      return "Wiseon CSAP";
    case "generic":
      return "Generic";
    default:
      return "Unknown";
  }
}

/**
 * Convert a ScanReport into DB insert rows for monitoring tables.
 * Safe defaults when sections/questions are sparse.
 */
export function reportToMonitoringRows(report: ScanReport): MonitoringSnapshotRows {
  const audience = composeAudienceReport(report);
  const safety = audience.safetyType;
  const summary = audience.collectedDataSummary;
  const observedAt = report.completedAt || report.createdAt || new Date().toISOString();
  const platform = toDbPlatform(report.platform);
  const formUrl = report.formUrl || report.form.url || "";
  const formParts = parseUrlParts(formUrl);
  const finalUrl = report.debug?.finalUrl || report.form.url || formUrl;
  const finalParts = parseUrlParts(finalUrl);
  const overallRisk = gradeToOverallRisk(report.grade, report.isLimited);
  const sourceKind =
    report.form.metadata?.source?.kind === "file" ? "file" : "url";

  const questions = report.form.questions || [];
  const questionRows: MonitoringQuestionInsert[] = questions.map((q, index) => {
    const categories = (q.detectedCategories || []) as DetectedCategory[];
    const flags = questionFlags(categories);
    const hasPersonal =
      flags.has_personal_info ||
      Boolean(q.hasPersonalData) ||
      (q.personalDataTypes?.length ?? 0) > 0;
    return {
      question_key: q.id || `q_${index + 1}`,
      question_number: `Q${index + 1}`,
      page_number: q.pageIndex ?? null,
      question_label: (q.label || q.questionText || "(문항)").slice(0, 2000),
      question_type: q.type || null,
      is_required: q.required ?? null,
      data_risk_level: q.dataRiskLevel ?? null,
      risk_tags: q.riskTags || [],
      has_personal_info: hasPersonal,
      has_sensitive_info: flags.has_sensitive_info,
      has_high_risk_info: flags.has_high_risk_info,
      sort_order: q.questionIndex ?? index,
      observed_at: observedAt,
      categories: categories.map((code) => ({
        category_code: code,
        category_label: getDetectedCategoryDisplayLabel(code, q.label || ""),
        risk_category: categoryRisk(code),
        confidence: report.confidence ?? "medium",
        matched_keyword: null,
      })),
    };
  });

  const personalCount = questionRows.filter((q) => q.has_personal_info).length;
  const sensitiveCount = questionRows.filter((q) => q.has_sensitive_info).length;
  const highRiskCount = questionRows.filter((q) => q.has_high_risk_info).length;

  const hasPersonal =
    personalCount > 0 || summary.directIdentifiers.length > 0;
  const hasSensitive =
    sensitiveCount > 0 || summary.sensitiveItems.length > 0;
  const hasHighRisk =
    highRiskCount > 0 || summary.highRiskItems.length > 0;

  const needsTrustee =
    platform !== "unknown" &&
    (hasPersonal || hasSensitive || hasHighRisk);
  const needsOverseas = platform === "google_forms";
  const noticeChecks = evaluateCorpusNoticeChecks(report, {
    needsTrustee,
    needsOverseas,
    checkRawAccess: hasPersonal || hasSensitive || hasHighRisk,
  });

  const complianceChecks: MonitoringComplianceCheckInsert[] = noticeChecks.map(
    (check) => {
      const mapped = noticeStatus(check.key, check.confirmed);
      return {
        check_domain: NOTICE_DOMAIN[check.key] || "notice",
        check_item: check.item,
        status: mapped.status,
        status_label: mapped.status_label,
        evidence_note: check.evidence || null,
        legal_basis_code: null,
        is_confirmed_violation: false as const,
        observed_at: observedAt,
      };
    },
  );

  const findings: MonitoringFindingInsert[] = (report.findings || []).map(
    (finding) => ({
      finding_type: findingType(finding),
      check_domain: findingDomain(finding),
      severity: findingSeverity(finding.severity),
      title: finding.title || "진단 항목",
      description: finding.description || null,
      recommendation: finding.recommendation || null,
      evidence_note: finding.evidence?.filter(Boolean).join(" · ") || null,
      legal_basis_codes: [],
      status: "open" as const,
      is_confirmed_violation: false as const,
      observed_at: observedAt,
    }),
  );

  if (report.isLimited || report.diagnosisStatus === "limited") {
    findings.push({
      finding_type: "limited_diagnosis",
      check_domain: "other",
      severity: "needs_review",
      title: "문항 분석 제한",
      description:
        report.limitedReason ||
        report.limitationReasons?.[0] ||
        "자동 문항 분석이 제한되었습니다.",
      recommendation: "설문 화면에서 수집 항목·고지문을 직접 확인해 주세요.",
      evidence_note: null,
      legal_basis_codes: [],
      status: "open",
      is_confirmed_violation: false,
      observed_at: observedAt,
    });
  }

  const dim = Object.fromEntries(
    audience.riskDimensions.map((d) => [d.id, d.score]),
  ) as Record<string, number>;

  const diagnosisStatus: DiagnosisStatus =
    report.diagnosisStatus ||
    (report.isLimited ? "limited" : "completed");

  const jobStatus =
    diagnosisStatus === "failed"
      ? "failed"
      : diagnosisStatus === "limited" || report.isLimited
        ? "limited"
        : "completed";

  const subjectType = toSurveySubjectType(safety.subjectType);
  const publicPrivate = toPublicPrivateType(safety.subjectType);

  const reportSummary = {
    scanId: report.scanId,
    platform,
    grade: report.grade ?? null,
    score: report.score ?? null,
    safetyTypeId: safety.typeId,
    userDecisionLabel: safety.displayName || safety.typeName,
    hasPersonalInfo: hasPersonal,
    hasSensitiveInfo: hasSensitive,
    hasHighRiskInfo: hasHighRisk,
    questionCount: questionRows.length,
    findingCount: findings.length,
    complianceCheckCount: complianceChecks.length,
  };

  return {
    scanJob: {
      external_scan_id: report.scanId,
      source_kind: sourceKind,
      form_url: sourceKind === "url" ? formUrl || null : null,
      file_name:
        sourceKind === "file"
          ? report.form.metadata?.source?.fileName || null
          : null,
      url_host: formParts.host,
      form_url_hash: formParts.hash,
      survey_url_hash: finalParts.hash || formParts.hash,
      platform,
      status: jobStatus,
      current_step: 7,
      total_steps: 7,
      step_label: "완료",
      error_message:
        jobStatus === "failed" || jobStatus === "limited"
          ? report.summary || report.limitedReason || null
          : null,
      observed_at: observedAt,
      started_at: report.createdAt || observedAt,
      completed_at: report.completedAt || observedAt,
    },
    scanReport: {
      external_scan_id: report.scanId,
      diagnosis_status: diagnosisStatus,
      confidence: report.confidence ?? null,
      overall_risk_level: overallRisk,
      risk_grade: report.grade ?? null,
      score: report.score ?? null,
      safety_type_id: safety.typeId,
      user_decision_label: safety.displayName || safety.typeName || "진단 결과",
      internal_verdict: audience.respondentDecision,
      summary: report.summary || null,
      report_json: sanitizeReportJson(report),
      report_summary: reportSummary,
      disclaimer:
        report.sections.disclaimer ||
        "자동 진단 결과이며 법률 자문이 아닙니다. 위반 확정이 아닙니다.",
      limitation_reasons: report.limitationReasons || [],
      has_personal_info: hasPersonal,
      has_sensitive_info: hasSensitive,
      has_high_risk_info: hasHighRisk,
      has_quasi_identifiers: summary.quasiIdentifiers.length > 0,
      publish_status: "draft",
      review_status: "none",
      observed_at: observedAt,
      generated_at: observedAt,
      generated_at_kst: null,
    },
    surveyRecord: {
      survey_title: report.form.title || null,
      survey_url: formUrl || null,
      final_url: finalUrl || null,
      url_host: formParts.host,
      form_url_hash: formParts.hash,
      survey_url_hash: finalParts.hash || formParts.hash,
      source_kind: sourceKind,
      platform,
      tool_name: toolName(platform),
      operator_name: safety.subjectLabel || report.form.operatorType || null,
      public_private_type: publicPrivate,
      subject_type: subjectType,
      sector: null,
      industry: null,
      region: report.debug?.publicInstitutionEvidence?.matchedRegion || null,
      overall_risk_level: overallRisk,
      user_decision_label: safety.displayName || safety.typeName || null,
      safety_type_id: safety.typeId,
      has_personal_info: hasPersonal,
      has_sensitive_info: hasSensitive,
      has_high_risk_info: hasHighRisk,
      question_count: questionRows.length,
      personal_info_question_count: personalCount,
      sensitive_question_count: sensitiveCount,
      high_risk_question_count: highRiskCount,
      review_status: "none",
      publish_status: "draft",
      observed_at: observedAt,
    },
    questions: questionRows,
    complianceChecks,
    findings,
    indexScores: {
      overall_score: report.score ?? null,
      data_score: dim.data ?? null,
      tool_score: dim.tool ?? null,
      notice_score: dim.notice ?? null,
      management_score: dim.management ?? null,
      personal_info_score: hasPersonal ? 70 : 10,
      sensitive_info_score: hasSensitive ? 85 : 5,
      high_risk_info_score: hasHighRisk ? 95 : 5,
      compliance_gap_score:
        complianceChecks.filter((c) => c.status !== "compliant").length * 10,
      overall_risk_level: overallRisk,
      score_version: "1.0",
      observed_at: observedAt,
    },
  };
}
