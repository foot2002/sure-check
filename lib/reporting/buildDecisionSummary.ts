import type { ScanReport } from "@/lib/types/scan";
import type {
  CollectedDataSummary,
  DecisionSummary,
  PrivacyDataType,
  VerdictType,
} from "@/lib/reporting/reportMessages";
import {
  classifyPrivacyDataType,
  missingNoticeLabels,
} from "@/lib/reporting/respondentDecision";
import { VERDICT_COPY } from "@/lib/reporting/verdictTypes";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function formatKoreanList(values: string[]): string {
  const items = unique(values).slice(0, 3);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")}와 ${items[items.length - 1]}`;
}

function hasFreeOpinionQuestion(report: ScanReport): boolean {
  return report.form.questions.some((question) =>
    /자유\s*의견|기타\s*의견|건의|의견|불편\s*사항|개선\s*사항/.test(
      question.label,
    ),
  );
}

export function buildPrimaryReasons(
  type: PrivacyDataType,
  report: ScanReport,
  summary: CollectedDataSummary,
): string[] {
  const missing = missingNoticeLabels(report);
  const reasons: string[] = [];

  switch (type) {
    case "minimal":
      reasons.push("이름·연락처·이메일을 요구하지 않습니다.");
      reasons.push("민감정보나 고위험정보가 확인되지 않았습니다.");
      if (hasFreeOpinionQuestion(report) || summary.generalOpinions.length > 0) {
        reasons.push("자유의견에는 개인정보를 쓰지 않는 것이 좋습니다.");
      } else {
        reasons.push("만족도·의견 중심 문항으로 보입니다.");
      }
      break;
    case "quasi_only":
      if (summary.quasiIdentifiers.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.quasiIdentifiers)} 등 준식별정보가 포함되어 있습니다.`,
        );
      } else {
        reasons.push("성별·연령대·거주지역 등 준식별정보가 포함되어 있습니다.");
      }
      reasons.push("이름·연락처는 요구하지 않습니다.");
      if (missing.some((label) => /보유|파기|담당|처리자|문의/.test(label))) {
        reasons.push("보유기간과 담당자 안내는 확인이 필요합니다.");
      } else {
        reasons.push("자유의견에는 개인정보를 쓰지 않는 것이 좋습니다.");
      }
      break;
    case "direct_identifier":
      if (summary.directIdentifiers.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.directIdentifiers)} 등 직접식별정보를 수집합니다.`,
        );
      } else {
        reasons.push("이름·연락처·이메일 등 직접식별정보를 수집합니다.");
      }
      if (missing.some((label) => /보유|파기|목적|담당/.test(label))) {
        reasons.push("보유기간과 파기 기준 안내가 부족합니다.");
      } else {
        reasons.push("수집 목적·보유기간·담당자 고지 확인이 필요합니다.");
      }
      if (
        report.platform === "google_forms" ||
        report.platform === "naver_forms" ||
        report.platform === "moaform"
      ) {
        reasons.push("외부 설문도구 사용 안내가 필요합니다.");
      } else {
        reasons.push("개인정보 처리 기준을 고지문에서 확인하세요.");
      }
      break;
    case "sensitive_or_high_risk":
      if (summary.highRiskItems.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.highRiskItems)} 등 고위험정보가 포함될 수 있습니다.`,
        );
      } else if (summary.sensitiveItems.length > 0) {
        reasons.push(
          `${formatKoreanList(summary.sensitiveItems)} 등 민감정보가 포함될 수 있습니다.`,
        );
      } else {
        reasons.push("민감정보 또는 고위험 개인정보가 포함될 수 있습니다.");
      }
      reasons.push("별도 동의 또는 수집 필요성 안내가 부족합니다.");
      reasons.push("보안 인증 도구 또는 인증 수행기관 확인이 필요합니다.");
      break;
    case "limited":
      reasons.push("설문 문항을 자동으로 확인하지 못했습니다.");
      reasons.push("로그인 또는 접근 제한이 있을 수 있습니다.");
      reasons.push("화면에 표시되지 않은 문항은 누락될 수 있습니다.");
      break;
  }

  return unique(reasons).slice(0, 3);
}

function scoreEvaluationLabel(
  verdict: VerdictType,
  score: number | null | undefined,
): string {
  if (verdict === "LIMITED_DIAGNOSIS" || score == null) return "판단 불가";
  switch (verdict) {
    case "SAFE_TO_RESPOND":
      return "응답해도 무리가 없음";
    case "RESPOND_WITH_CAUTION":
      return "개인정보 없이 응답";
    case "CHECK_NOTICE_BEFORE_INPUT":
      return "안내 없으면 입력 금지";
    case "DO_NOT_RESPOND":
      return "응답하지 않는 것이 좋음";
    case "REPORT_OR_INQUIRE":
      return "응답 거부·신고 검토";
  }
}

export function buildDecisionSummary(
  report: ScanReport,
  summary: CollectedDataSummary,
  verdict: VerdictType,
  isReportRecommended: boolean,
): DecisionSummary {
  const privacyDataType = classifyPrivacyDataType(report, summary);
  const copy = VERDICT_COPY[verdict];
  const primaryReasons = buildPrimaryReasons(privacyDataType, report, summary);

  return {
    verdictType: verdict,
    headline: copy.headline,
    actionLabel: copy.actionLabel,
    actionDescription: copy.actionDescription,
    primaryReasons,
    scoreDisplay:
      report.score == null || verdict === "LIMITED_DIAGNOSIS"
        ? "진단 제한 · 점수 산정 불가"
        : `${report.score}점`,
    scoreGrade: report.grade,
    reportRecommendation: isReportRecommended
      ? copy.howToRespond
      : copy.howToRespond,
    isReportRecommended,
    privacyDataType,
    statusBadge: copy.statusBadge,
  };
}

export function getScoreEvaluationForVerdict(
  verdict: VerdictType,
  score: number | null | undefined,
): string {
  return scoreEvaluationLabel(verdict, score);
}
