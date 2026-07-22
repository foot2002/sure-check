import type { ScanReport } from "@/lib/types/scan";
import type { CollectedDataSummary } from "@/lib/reporting/reportMessages";
import {
  classifyPrivacyDataType,
  isEmployeeContext,
  missingNoticeLabels,
} from "@/lib/reporting/respondentDecision";
import {
  classifySurveySubject,
  type SurveySubjectType,
} from "@/lib/reporting/safetyType";
import { hasEmployeeSensitiveCombination } from "@/lib/reporting/publicSectorCsap";
import {
  type LegalBasisId,
  legalBasisLabels,
} from "@/lib/reporting/legalBasisRegistry";

export type CoreProblemSeverity =
  | "HIGH_VIOLATION_RISK"
  | "CHECK_REQUIRED"
  | "RECOMMENDED_IMPROVEMENT"
  | "LOW_OR_NONE";

export type CoreProblemSeverityLabel =
  | "위반 소지 큼"
  | "확인 필요"
  | "개선 권고"
  | "문제 낮음";

export interface CoreOperatorProblem {
  id: string;
  severity: CoreProblemSeverity;
  severityLabel: CoreProblemSeverityLabel;
  title: string;
  why: string;
  basisIds: LegalBasisId[];
  basisLabels: string[];
  action: string;
  priority: number;
}

export interface CoreProblemCounts {
  highViolationRisk: number;
  checkRequired: number;
  recommendedImprovement: number;
  lowOrNone: number;
}

export interface CoreOperatorProblemsResult {
  problems: CoreOperatorProblem[];
  counts: CoreProblemCounts;
  summaryLine: string;
}

const SEVERITY_LABEL: Record<CoreProblemSeverity, CoreProblemSeverityLabel> = {
  HIGH_VIOLATION_RISK: "위반 소지 큼",
  CHECK_REQUIRED: "확인 필요",
  RECOMMENDED_IMPROVEMENT: "개선 권고",
  LOW_OR_NONE: "문제 낮음",
};

const SEVERITY_RANK: Record<CoreProblemSeverity, number> = {
  HIGH_VIOLATION_RISK: 0,
  CHECK_REQUIRED: 1,
  RECOMMENDED_IMPROVEMENT: 2,
  LOW_OR_NONE: 3,
};

function isPublicLike(subject: SurveySubjectType): boolean {
  return (
    subject === "public_agency" ||
    subject === "public_commissioned_private" ||
    subject === "school_local"
  );
}

function isExternalSaas(report: ScanReport): boolean {
  return (
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic"
  );
}

function hasMissing(report: ScanReport, pattern: RegExp): boolean {
  return missingNoticeLabels(report).some((label) => pattern.test(label));
}

function countNoticeGaps(report: ScanReport): number {
  const patterns = [/목적/, /항목/, /보유|파기/, /거부|불이익/, /담당|처리자|문의/];
  return patterns.filter((pattern) => hasMissing(report, pattern)).length;
}

function hasFreeOpinion(report: ScanReport): boolean {
  return report.form.questions.some((q) =>
    /자유\s*의견|기타\s*의견|건의|의견|개선\s*사항/.test(q.label),
  );
}

function problem(
  partial: Omit<CoreOperatorProblem, "severityLabel" | "basisLabels" | "priority"> & {
    priority: number;
  },
): CoreOperatorProblem {
  return {
    ...partial,
    severityLabel: SEVERITY_LABEL[partial.severity],
    basisLabels: legalBasisLabels(partial.basisIds).slice(0, 3),
  };
}

/**
 * finding을 묶어 운영자용 핵심 문제 Top 3~5 생성
 */
export function buildCoreOperatorProblems(
  report: ScanReport,
  summary: CollectedDataSummary,
): CoreOperatorProblemsResult {
  const privacyType = classifyPrivacyDataType(report, summary);
  const subject = classifySurveySubject(report);
  const publicLike = isPublicLike(subject);
  const external = isExternalSaas(report);
  const hasDirect = summary.directIdentifiers.length > 0;
  const hasSensitive =
    summary.sensitiveItems.length > 0 || hasEmployeeSensitiveCombination(report);
  const hasHighRisk = summary.highRiskItems.length > 0;
  const hasPii = hasDirect || hasSensitive || hasHighRisk;
  const noticeGaps = countNoticeGaps(report);
  const retentionMissing = hasMissing(report, /보유|파기/);
  const contactMissing = hasMissing(report, /담당|처리자|문의/);
  const employee = isEmployeeContext(report) || hasEmployeeSensitiveCombination(report);
  const problems: CoreOperatorProblem[] = [];

  if (privacyType === "limited") {
    if (report.platform === "moaform") {
      return {
        problems: [
          {
            ...problem({
              id: "moaform_questions_limited",
              severity: "CHECK_REQUIRED",
              title: "모아폼 문항 자동 확인 제한",
              why: "문항과 고지문을 충분히 확인하지 못했습니다. 개인정보 수집 여부는 확정하지 않습니다.",
              basisIds: ["PIPA_ART_15"],
              action:
                "설문 첫 화면에 개인정보 수집 목적, 항목, 보유기간, 파기 기준, 담당자 안내가 보이도록 구성하세요.",
              priority: 1,
            }),
            basisLabels: ["진단 한계"],
          },
          problem({
            id: "moaform_trustee_notice",
            severity: "RECOMMENDED_IMPROVEMENT",
            title: "외부 설문도구 사용 안내 필요",
            why: "문항을 확인하지 못해 개인정보 수집 여부는 확정하지 않습니다. 수집이 있다면 외부 도구 위탁 안내가 필요합니다.",
            basisIds: ["PIPA_ART_26"],
            action:
              "개인정보를 수집하는 경우 외부 설문도구 이용, 수탁자, 위탁업무, 보유·파기 기준을 안내하세요.",
            priority: 2,
          }),
        ],
        counts: {
          highViolationRisk: 0,
          checkRequired: 1,
          recommendedImprovement: 1,
          lowOrNone: 0,
        },
        summaryLine: "확인 필요 1건 · 개선 권고 1건",
      };
    }

    return {
      problems: [
        problem({
          id: "limited_scan",
          severity: "CHECK_REQUIRED",
          title: "설문 문항 자동 확인 불가",
          why: "문항과 고지문을 충분히 확인하지 못해 운영 보완사항을 확정하기 어렵습니다.",
          basisIds: ["PIPA_ART_15"],
          action: "공개 접근 가능한 설문 URL로 다시 진단하거나, 고지문·담당자를 직접 점검하세요.",
          priority: 1,
        }),
      ],
      counts: {
        highViolationRisk: 0,
        checkRequired: 1,
        recommendedImprovement: 0,
        lowOrNone: 0,
      },
      summaryLine: "확인 필요 1건",
    };
  }

  // 1) 개인정보 수집·이용 고지 부족
  if (hasPii && noticeGaps >= 2) {
    const high = noticeGaps >= 3 || (hasDirect && noticeGaps >= 2);
    problems.push(
      problem({
        id: "basic_notice_gap",
        severity: high ? "HIGH_VIOLATION_RISK" : "CHECK_REQUIRED",
        title: "개인정보 수집·이용 고지 부족",
        why: hasDirect
          ? "이름·연락처·이메일 등 개인정보를 수집하지만 수집 목적, 항목, 보유기간, 동의 거부권 안내가 충분히 보이지 않습니다."
          : "개인정보 또는 민감 맥락이 있는데 필수 고지 안내가 부족합니다.",
        basisIds: ["PIPA_ART_15"],
        action:
          "설문 첫 화면에 수집 목적, 수집 항목, 보유기간, 동의 거부권 및 불이익, 담당자를 명시하세요.",
        priority: high ? 10 : 40,
      }),
    );
  } else if (!hasPii && (privacyType === "quasi_only" || privacyType === "minimal")) {
    if (contactMissing) {
      problems.push(
        problem({
          id: "contact_improve",
          severity: "RECOMMENDED_IMPROVEMENT",
          title: "담당부서 또는 문의처 표시 필요",
          why: "문의할 담당부서나 연락처가 보이지 않습니다.",
          basisIds: ["PIPA_ART_15"],
          action: "설문 하단에 담당부서와 문의처를 표시하세요.",
          priority: 80,
        }),
      );
    }
  }

  // 2) 보유기간·파기
  if (retentionMissing) {
    if (hasPii) {
      problems.push(
        problem({
          id: "retention_gap",
          severity:
            hasDirect || hasSensitive || hasHighRisk
              ? noticeGaps >= 3
                ? "HIGH_VIOLATION_RISK"
                : "CHECK_REQUIRED"
              : "CHECK_REQUIRED",
          title: "보유기간·파기 기준 누락",
          why: "응답 정보가 언제까지 보관되고 언제 파기되는지 안내가 보이지 않습니다.",
          basisIds: ["PIPA_ART_21"],
          action:
            "조사 종료 후 보관기간과 파기 시점을 명시하세요. 예: 조사 종료 후 3개월 보관 후 파기",
          priority: 20,
        }),
      );
    } else {
      problems.push(
        problem({
          id: "retention_improve",
          severity: "RECOMMENDED_IMPROVEMENT",
          title: "보유기간·파기 기준 안내 부족",
          why: "조사 종료 후 보관·파기 기준이 간단히 안내되면 더 좋습니다.",
          basisIds: ["PIPA_ART_21"],
          action: "조사 종료 후 보관기간과 파기 기준을 간단히 안내하세요.",
          priority: 70,
        }),
      );
    }
  }

  // 3) 민감정보 별도 동의
  if (hasSensitive) {
    problems.push(
      problem({
        id: "sensitive_consent",
        severity: "HIGH_VIOLATION_RISK",
        title: employee
          ? "민감정보 또는 직원 민감 맥락 관리 부족"
          : "민감정보 별도 동의 미확인",
        why: employee
          ? "고충·평가 등 직원 민감 맥락이 포함될 수 있는데 별도 동의·익명성·원자료 접근권한 안내가 부족합니다."
          : "민감정보가 포함될 수 있는데 별도 동의와 수집 필요성 안내가 확인되지 않습니다.",
        basisIds: employee
          ? ["PIPA_ART_23", "PIPA_ART_29"]
          : ["PIPA_ART_23"],
        action: employee
          ? "고충·평가 문항은 삭제하거나 별도 동의, 익명성 기준, 원자료 접근권한을 명시하세요."
          : "민감정보 문항을 삭제하거나 별도 동의, 수집 필요성, 접근권한, 보유기간, 파기 기준을 명시하세요.",
        priority: 5,
      }),
    );
  }

  // 4) 고위험정보
  if (hasHighRisk) {
    problems.push(
      problem({
        id: "high_risk_collection",
        severity: "HIGH_VIOLATION_RISK",
        title: "고위험 개인정보 수집 위험",
        why: "주민등록번호·계좌번호·신분증 등 고위험정보를 범용 설문도구에서 수집할 위험이 있습니다.",
        basisIds: ["PIPA_ART_24", "PIPA_ART_29"],
        action:
          "범용 설문도구로 수집하지 말고, 법적 근거와 암호화·접근통제·파기 기준이 있는 보안 도구로 전환하세요.",
        priority: 1,
      }),
    );
  }

  // 5) 위탁
  if (
    hasPii &&
    (report.platform === "naver_forms" ||
      report.platform === "moaform" ||
      hasMissing(report, /위탁|수탁/))
  ) {
    problems.push(
      problem({
        id: "outsourcing",
        severity: "CHECK_REQUIRED",
        title: "외부 설문도구 위탁 안내 미확인",
        why: "외부 설문도구를 사용하지만 수탁자·위탁업무 안내가 확인되지 않습니다.",
        basisIds: ["PIPA_ART_26"],
        action:
          "수탁자, 위탁업무, 위탁 목적, 관리감독 기준을 설문 안내문 또는 개인정보 고지문에 추가하세요.",
        priority: 45,
      }),
    );
  }

  // 6) 국외이전
  if (hasPii && report.platform === "google_forms") {
    problems.push(
      problem({
        id: "overseas",
        severity: "CHECK_REQUIRED",
        title: "국외 보관·이전 안내 미확인",
        why: "Google Forms 사용 시 국외 보관·이전 가능성이 있으나 관련 안내가 확인되지 않습니다.",
        basisIds: ["PIPA_ART_28_8"],
        action:
          "국외 이전 여부, 이전 국가, 이전받는 자, 이전 목적, 보유기간, 거부권 등을 확인하고 안내하세요.",
        priority: 35,
      }),
    );
  }

  // 7) 안전조치
  if (hasPii) {
    const mgmtGaps =
      report.debug?.managementItems.filter((item) => item.status !== "confirmed")
        .length ?? 0;
    if (mgmtGaps > 0 || hasSensitive || hasHighRisk || employee) {
      problems.push(
        problem({
          id: "security_access",
          severity:
            hasSensitive || hasHighRisk || employee
              ? "CHECK_REQUIRED"
              : "CHECK_REQUIRED",
          title: "원자료 접근권한·안전조치 미확인",
          why: "응답 원자료 열람자, 다운로드 권한, 파기 담당자 등 안전조치 기준이 명확하지 않습니다.",
          basisIds: ["PIPA_ART_29", "INTERNAL_ACCESS_CONTROL"],
          action:
            "응답 원자료 열람자, 다운로드 권한, 보관 위치, 파기 담당자, 접근기록 관리 기준을 명시하세요.",
          priority: 50,
        }),
      );
    }
  }

  // 8) 공공 CSAP — D2만이면 강하게 띄우지 않음
  if (publicLike && hasPii && external) {
    problems.push(
      problem({
        id: "public_csap",
        severity: "CHECK_REQUIRED",
        title: "공공기관 외부 클라우드 도구 보안 기준 확인 필요",
        why: "공공부문에서 개인정보·민감정보를 외부 설문 SaaS로 수집하는 경우 보안 인증 기준 확인이 필요합니다.",
        basisIds: [
          "CSAP_PUBLIC_CLOUD",
          "MOIS_PUBLIC_CLOUD_NOTICE",
          "NIS_SECURITY_REVIEW",
        ],
        action:
          "공공기관 개인정보 설문은 CSAP 인증 등 공공부문 보안 기준을 충족하는 설문 도구 사용을 우선 검토하세요.",
        priority: 15,
      }),
    );
  }

  // 9) 민간 보안인증
  if (!publicLike && subject !== "unknown" && hasPii && external) {
    problems.push(
      problem({
        id: "private_cert",
        severity: "CHECK_REQUIRED",
        title: "보안인증 도구·수행기관 확인 필요",
        why: "민간 설문에서 범용 외부도구로 개인정보·민감정보를 수집하고 있어 보안·관리체계 확인이 필요합니다.",
        basisIds: ["PIPA_ART_29", "ISMS_P", "CSAP_PUBLIC_CLOUD"],
        action:
          "CSAP 인증 도구, ISMS-P 인증 수행기관, 보안인증 수집도구 사용을 검토하세요.",
        priority: 25,
      }),
    );
  }

  // 10) 주체 불명 + 개인정보
  if (subject === "unknown" && hasPii) {
    problems.push(
      problem({
        id: "unknown_operator",
        severity: "HIGH_VIOLATION_RISK",
        title: "운영기관 불명확한 개인정보 수집",
        why: "운영기관·담당자가 명확하지 않은 상태에서 개인정보를 요구하고 있습니다.",
        basisIds: ["PIPA_ART_15"],
        action: "운영기관명, 담당자, 보유기간을 명시하기 전에는 개인정보 수집을 중단하세요.",
        priority: 8,
      }),
    );
  }

  // 11) 자유의견 개선 권고
  if (hasFreeOpinion(report) && !hasSensitive && !hasHighRisk) {
    problems.push(
      problem({
        id: "free_opinion_guide",
        severity: "RECOMMENDED_IMPROVEMENT",
        title: "자유의견 개인정보 입력 방지 안내 필요",
        why: "자유의견에 이름·연락처 등 개인정보를 쓸 수 있습니다.",
        basisIds: ["PIPA_ART_16"],
        action:
          "자유의견에는 이름, 연락처, 건강상태 등 개인정보를 쓰지 말라는 안내를 추가하세요.",
        priority: 90,
      }),
    );
  }

  // 개인정보 거의 없음 + 문제 거의 없을 때
  if (problems.length === 0 && privacyType === "minimal") {
    problems.push(
      problem({
        id: "low_risk",
        severity: "LOW_OR_NONE",
        title: "현재 수집정보 수준에서 문제 낮음",
        why: "직접식별정보·민감정보·고위험정보가 확인되지 않습니다.",
        basisIds: ["PIPA_ART_16"],
        action:
          "자유의견 개인정보 입력 방지와 담당부서·보유기간 안내만 간단히 보완하면 충분합니다.",
        priority: 100,
      }),
    );
  }

  const deduped = new Map<string, CoreOperatorProblem>();
  for (const item of problems) {
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }

  const sorted = [...deduped.values()]
    .sort((a, b) => {
      const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rank !== 0) return rank;
      return a.priority - b.priority;
    })
    .slice(0, 5);

  const counts: CoreProblemCounts = {
    highViolationRisk: sorted.filter((p) => p.severity === "HIGH_VIOLATION_RISK")
      .length,
    checkRequired: sorted.filter((p) => p.severity === "CHECK_REQUIRED").length,
    recommendedImprovement: sorted.filter(
      (p) => p.severity === "RECOMMENDED_IMPROVEMENT",
    ).length,
    lowOrNone: sorted.filter((p) => p.severity === "LOW_OR_NONE").length,
  };

  const parts: string[] = [];
  if (counts.highViolationRisk > 0) {
    parts.push(`위반 소지 큼 ${counts.highViolationRisk}건`);
  }
  if (counts.checkRequired > 0) {
    parts.push(`확인 필요 ${counts.checkRequired}건`);
  }
  if (counts.recommendedImprovement > 0) {
    parts.push(`개선 권고 ${counts.recommendedImprovement}건`);
  }
  if (parts.length === 0 && counts.lowOrNone > 0) {
    parts.push("문제 낮음");
  }

  return {
    problems: sorted,
    counts,
    summaryLine: parts.join(" · ") || "표시할 핵심 문제 없음",
  };
}
