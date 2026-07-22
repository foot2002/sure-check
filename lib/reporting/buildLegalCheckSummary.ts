import type { ScanReport } from "@/lib/types/scan";
import type { CollectedDataSummary, PrivacyDataType } from "@/lib/reporting/reportMessages";
import {
  classifyPrivacyDataType,
  isEmployeeContext,
  missingNoticeLabels,
} from "@/lib/reporting/respondentDecision";
import type {
  LegalCheckItem,
  LegalCheckSummary,
} from "@/lib/reporting/verdictTypes";

function pushUnique(items: LegalCheckItem[], item: LegalCheckItem): void {
  if (!items.some((existing) => existing.id === item.id || existing.label === item.label)) {
    items.push(item);
  }
}

function hasMissing(report: ScanReport, pattern: RegExp): boolean {
  return missingNoticeLabels(report).some((label) => pattern.test(label));
}

function isExternalTool(report: ScanReport): boolean {
  return (
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic"
  );
}

/**
 * 법적 체크 요약 — 위반 확정 표현 없이
 * 위반 소지 큼 / 확인 필요 / 개선 권고 / 문제 없음
 */
export function buildLegalCheckSummary(
  report: ScanReport,
  summary: CollectedDataSummary,
  privacyType?: PrivacyDataType,
): LegalCheckSummary {
  const type = privacyType ?? classifyPrivacyDataType(report, summary);
  const severe: LegalCheckItem[] = [];
  const check: LegalCheckItem[] = [];
  const improve: LegalCheckItem[] = [];
  const passed: LegalCheckItem[] = [];

  if (type === "limited") {
    pushUnique(check, {
      id: "limited_scan",
      label: "설문 문항·고지문 자동 확인 불가",
      severity: "check_required",
      detail: "운영기관과 안내문을 직접 확인하세요.",
    });
    return {
      severeViolationSuspicions: severe,
      checkRequiredItems: check,
      improvementRecommendations: improve,
      passedItems: passed,
    };
  }

  const hasPii =
    type === "direct_identifier" ||
    type === "sensitive_or_high_risk" ||
    summary.directIdentifiers.length > 0 ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0;

  const hasSensitive =
    summary.sensitiveItems.length > 0 || type === "sensitive_or_high_risk";
  const hasHighRisk = summary.highRiskItems.length > 0;

  // —— 수집·이용 고지 ——
  const purposeMissing = hasMissing(report, /목적/);
  const itemsMissing = hasMissing(report, /항목/);
  const retentionMissing = hasMissing(report, /보유|파기/);
  const refusalMissing = hasMissing(report, /거부|불이익/);
  const contactMissing = hasMissing(report, /담당|처리자|문의/);
  const coreGapCount = [
    purposeMissing,
    itemsMissing,
    retentionMissing,
    refusalMissing,
    contactMissing,
  ].filter(Boolean).length;

  if (hasPii && coreGapCount >= 3) {
    pushUnique(severe, {
      id: "basic_notice_gap",
      label: "개인정보 수집·이용 필수 고지 부족",
      severity: "severe_suspicion",
      detail: "수집 목적, 항목, 보유기간, 동의 거부권, 담당자 등 핵심 고지가 부족합니다.",
    });
  } else if (hasPii && coreGapCount > 0) {
    pushUnique(check, {
      id: "basic_notice_check",
      label: "개인정보 수집·이용 고지 확인 필요",
      severity: "check_required",
    });
  } else if (!hasPii && coreGapCount > 0) {
    pushUnique(improve, {
      id: "basic_notice_improve",
      label: "보유기간·담당자 등 안내 보완 권고",
      severity: "improvement",
    });
  } else if (hasPii) {
    pushUnique(passed, {
      id: "basic_notice_ok",
      label: "수집·이용 핵심 고지 대체로 확인",
      severity: "passed",
    });
  }

  // —— 보유·파기 ——
  if (hasPii && retentionMissing) {
    if (coreGapCount >= 3) {
      pushUnique(severe, {
        id: "retention_gap",
        label: "보유기간 및 파기 기준 누락",
        severity: "severe_suspicion",
      });
    } else {
      pushUnique(check, {
        id: "retention_check",
        label: "보유기간 및 파기 기준 확인 필요",
        severity: "check_required",
      });
    }
  } else if (!hasPii && retentionMissing) {
    pushUnique(improve, {
      id: "retention_improve",
      label: "보유기간과 파기 기준 안내 권고",
      severity: "improvement",
    });
  }

  // —— 민감정보 별도 동의 ——
  if (hasSensitive || hasHighRisk) {
    const sensitiveConsentMissing = hasMissing(report, /민감|별도\s*동의|sensitive/i);
    if (sensitiveConsentMissing || !report.form.notices?.sensitiveConsent) {
      pushUnique(severe, {
        id: "sensitive_consent",
        label: "민감정보 별도 동의 미확인",
        severity: "severe_suspicion",
      });
    }
  }

  // —— 위탁 ——
  if (hasPii && isExternalTool(report)) {
    const trusteeMissing = hasMissing(report, /위탁|수탁/);
    if (trusteeMissing || report.platform === "naver_forms" || report.platform === "moaform") {
      pushUnique(check, {
        id: "outsourcing",
        label: "외부 설문도구 위탁 안내 미확인",
        severity: "check_required",
      });
    }
  }

  // —— 국외 보관·이전 ——
  if (hasPii && report.platform === "google_forms") {
    pushUnique(check, {
      id: "overseas",
      label: "Google Forms 국외 보관·이전 안내 미확인",
      severity: "check_required",
    });
  }

  // —— 안전조치 ——
  if (hasPii) {
    const mgmtGaps =
      report.debug?.managementItems.filter((item) => item.status !== "confirmed")
        .length ?? 0;
    if (mgmtGaps > 0 || hasSensitive || hasHighRisk) {
      pushUnique(check, {
        id: "security_measure",
        label: "접근권한 및 원자료 관리 기준 미확인",
        severity: "check_required",
      });
    }
  }

  // —— 공공부문 보안기준 ——
  if (
    report.debug?.publicSectorDetected &&
    hasPii &&
    isExternalTool(report)
  ) {
    pushUnique(check, {
      id: "public_security",
      label: "공공부문 보안기준(CSAP 등) 확인 필요",
      severity: "check_required",
    });
  }

  // —— 개선 권고 (항상 가벼운 것) ——
  const hasFreeOpinion = report.form.questions.some((q) =>
    /자유\s*의견|기타\s*의견|건의|의견|개선\s*사항/.test(q.label),
  );
  if (hasFreeOpinion) {
    pushUnique(improve, {
      id: "free_opinion_guide",
      label: "자유의견 개인정보 입력 금지 안내 추가",
      severity: "improvement",
    });
  }
  if (contactMissing && !hasPii) {
    pushUnique(improve, {
      id: "contact_display",
      label: "담당부서 또는 문의처 표시",
      severity: "improvement",
    });
  }

  // —— 문제 없음 ——
  if (summary.directIdentifiers.length === 0 && type !== "direct_identifier") {
    pushUnique(passed, {
      id: "no_direct",
      label: "직접식별정보 없음",
      severity: "passed",
    });
  }
  if (
    summary.sensitiveItems.length === 0 &&
    summary.highRiskItems.length === 0 &&
    type !== "sensitive_or_high_risk"
  ) {
    pushUnique(passed, {
      id: "no_sensitive",
      label: "민감정보 없음",
      severity: "passed",
    });
  }

  // 준식별만: 위반 소지 큼 비우기 (요구사항 A/B)
  if (type === "minimal" || type === "quasi_only") {
    // severe는 민감/직접식별이 없으면 비움 — 이미 hasPii 가드로 대부분 방지됨
    // 혹시 남은 severe가 있으면 check로 강등
    for (const item of severe.splice(0)) {
      pushUnique(check, { ...item, severity: "check_required" });
    }
  }

  // 직원 맥락
  if (isEmployeeContext(report) && hasPii) {
    pushUnique(check, {
      id: "employee_anonymity",
      label: "익명성·원자료 제공 범위·불이익 방지 기준 확인 필요",
      severity: "check_required",
    });
  }

  return {
    severeViolationSuspicions: severe.slice(0, 4),
    checkRequiredItems: check.slice(0, 5),
    improvementRecommendations: improve.slice(0, 4),
    passedItems: passed.slice(0, 4),
  };
}
