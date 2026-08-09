import type { ScanReport } from "@/lib/types/scan";
import type { CollectedDataSummary, PrivacyDataType } from "@/lib/reporting/reportMessages";
import { hasEmployeeSensitiveCombination } from "@/lib/reporting/publicSectorCsap";
import type { VerdictType } from "@/lib/reporting/verdictTypes";

function hasAny(items: string[]): boolean {
  return items.length > 0;
}

/** Core obligation keys that may support a strong "고지 없음" claim. */
const CORE_MISSING_NOTICE_KEYS = new Set([
  "collection_purpose",
  "collection_items",
  "retention_period",
  "consent_refusal_right",
  "refusal_disadvantage",
  "destruction_timing",
  "processor_contact",
  "contact_department",
  "purpose_destruction",
]);

/**
 * Confirmed missing core notices only — excludes unclear / prize / marketing /
 * trustee gaps so TOP3 does not escalate soft uncertainty to "고지 없음".
 */
export function missingNoticeLabels(report: ScanReport): string[] {
  const gaps = report.debug?.missingNotices ?? [];
  return gaps
    .filter((gap) => gap.status === "missing")
    .filter(
      (gap) =>
        !gap.key.startsWith("overseas_") &&
        !gap.key.startsWith("trustee") &&
        !gap.key.startsWith("sensitive_") &&
        !/경품|마케팅|홍보|이벤트|프로모션/.test(gap.label),
    )
    .filter(
      (gap) =>
        CORE_MISSING_NOTICE_KEYS.has(gap.key) ||
        /목적|항목|보유|파기|거부|불이익|담당|문의|처리자/.test(gap.label),
    )
    // Overseas retention label "보유기간" can collide — only keep core keys then.
    .filter(
      (gap) =>
        CORE_MISSING_NOTICE_KEYS.has(gap.key) ||
        (!gap.key.includes("overseas") && !gap.key.includes("trustee")),
    )
    .map((gap) => gap.label);
}

/** Soft/uncertain gaps for review copy — not used for Critical TOP3. */
export function unclearNoticeLabels(report: ScanReport): string[] {
  return (report.debug?.missingNotices ?? [])
    .filter((gap) => gap.status === "unclear")
    .map((gap) => gap.label);
}

export function isEmployeeContext(report: ScanReport): boolean {
  const labels = report.debug?.contextLabels.join(" ") ?? "";
  const summary = report.debug?.contextSummary ?? "";
  return (
    Boolean(report.form.contextHints?.isEmployeeSurvey) ||
    /직원|근로|조직진단|employee/i.test(`${labels} ${summary}`)
  );
}

export function hasAnonymousContradiction(report: ScanReport): boolean {
  if (!report.form.contextHints?.claimsAnonymous) return false;
  return report.form.questions.some(
    (question) =>
      question.dataRiskLevel === "D3" ||
      question.detectedCategories?.some((category) =>
        ["name", "phone", "email", "address"].includes(category),
      ),
  );
}

function countCoreNoticeGaps(report: ScanReport): number {
  const labels = missingNoticeLabels(report);
  const patterns = [/목적/, /항목/, /보유|파기/, /담당|처리자|문의/, /거부|불이익/];
  return patterns.filter((pattern) => labels.some((label) => pattern.test(label))).length;
}

function isOperatorUnclear(report: ScanReport): boolean {
  const missing = missingNoticeLabels(report);
  const hasContactGap = missing.some((label) => /담당|처리자|문의/.test(label));
  const processor = report.form.notices?.processor ?? "";
  return hasContactGap && (!processor || processor.length < 2);
}

function isGenericExternalTool(report: ScanReport): boolean {
  return (
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic"
  );
}

/**
 * 1단계: 수집정보 유형 판정
 */
export function classifyPrivacyDataType(
  report: ScanReport,
  summary: CollectedDataSummary,
): PrivacyDataType {
  if (report.isLimited || report.diagnosisStatus === "limited") {
    return "limited";
  }

  const hasSensitiveOrHighRisk =
    hasAny(summary.sensitiveItems) ||
    hasAny(summary.highRiskItems) ||
    hasEmployeeSensitiveCombination(report) ||
    report.debug?.dataRiskLevel === "D4" ||
    report.debug?.dataRiskLevel === "D5";

  if (hasSensitiveOrHighRisk) return "sensitive_or_high_risk";
  if (hasAny(summary.directIdentifiers)) return "direct_identifier";
  if (hasAny(summary.quasiIdentifiers)) return "quasi_only";
  return "minimal";
}

/**
 * REPORT_OR_INQUIRE 조건 — 단순 D2만 있는 설문에는 적용하지 않음
 */
export function shouldRecommendReportOrInquire(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType: PrivacyDataType,
): boolean {
  if (privacyType === "minimal" || privacyType === "quasi_only" || privacyType === "limited") {
    return false;
  }

  const coreGaps = countCoreNoticeGaps(report);
  const hasSensitive = hasAny(summary.sensitiveItems);
  const hasHighRisk = hasAny(summary.highRiskItems);
  const hasDirect = hasAny(summary.directIdentifiers);
  const missing = missingNoticeLabels(report);
  const sensitiveConsentMissing = missing.some((label) =>
    /민감|별도\s*동의|sensitive/i.test(label),
  );

  // 민감/고위험 + 핵심 고지 대부분 없음
  if ((hasSensitive || hasHighRisk) && coreGaps >= 3) return true;

  // 고위험정보를 범용 설문도구에서 수집
  if (hasHighRisk && isGenericExternalTool(report)) return true;

  // 민감정보 별도 동의 없이 수집
  if (hasSensitive && sensitiveConsentMissing) return true;

  // 운영기관 불명확 + 이름·연락처·이메일 등 복수 직접식별정보
  if (
    summary.directIdentifiers.length >= 2 &&
    isOperatorUnclear(report) &&
    (hasSensitive || hasHighRisk || summary.directIdentifiers.length >= 3)
  ) {
    return true;
  }

  // 공공기관 + 개인정보/민감 + 외부도구 + 고지 부족
  if (
    report.debug?.publicSectorDetected &&
    (hasDirect || hasSensitive || hasHighRisk) &&
    isGenericExternalTool(report) &&
    coreGaps >= 2
  ) {
    return true;
  }

  // 직원/조직진단 + 식별·고충 결합 + 익명성 안내 없음
  if (hasEmployeeSensitiveCombination(report)) {
    const anonymityGap = missing.some((label) =>
      /익명|원자료|불이익|소수/.test(label),
    );
    const hasIdCombo =
      hasDirect ||
      summary.quasiIdentifiers.some((item) => /부서|직급|이메일|이메일/.test(item)) ||
      report.form.questions.some((q) => /이메일|부서|직급|고충|인사평가/.test(q.label));
    if (hasIdCombo && (anonymityGap || coreGaps >= 2)) return true;
  }

  return false;
}

/**
 * 계층형 최종 판단:
 * 1) 수집정보 → 2) 고지 → 3) 도구/관리 → 4) 사용자 행동
 */
export function decideVerdict(
  report: ScanReport,
  summary: CollectedDataSummary,
): VerdictType {
  const privacyType = classifyPrivacyDataType(report, summary);

  if (privacyType === "limited") {
    return "LIMITED_DIAGNOSIS";
  }

  if (shouldRecommendReportOrInquire(report, summary, privacyType)) {
    return "REPORT_OR_INQUIRE";
  }

  if (
    privacyType === "sensitive_or_high_risk" ||
    hasAnonymousContradiction(report) ||
    hasEmployeeSensitiveCombination(report)
  ) {
    return "DO_NOT_RESPOND";
  }

  if (privacyType === "direct_identifier") {
    return "CHECK_NOTICE_BEFORE_INPUT";
  }

  if (privacyType === "quasi_only") {
    return "RESPOND_WITH_CAUTION";
  }

  // minimal — 고지가 많이 비어도 개인정보가 거의 없으면 주의 수준
  const missing = missingNoticeLabels(report);
  if (missing.length >= 4) {
    return "RESPOND_WITH_CAUTION";
  }

  return "SAFE_TO_RESPOND";
}

/** @deprecated use decideVerdict */
export function decideRespondentDecision(
  report: ScanReport,
  summary: CollectedDataSummary,
): VerdictType {
  return decideVerdict(report, summary);
}
