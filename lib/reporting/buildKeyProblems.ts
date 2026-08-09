/**
 * Hero "가장 심각한 문제 TOP 3" for audience + admin reports.
 * Strong headlines, conservative legal certainty (no unfounded "위반" claims).
 */

import type { CollectedDataSummary } from "@/lib/reporting/reportMessages";
import {
  classifyPrivacyDataType,
  missingNoticeLabels,
} from "@/lib/reporting/respondentDecision";
import {
  classifySurveySubject,
  isPublicLikeSubject,
} from "@/lib/reporting/safetyType";
import { getToolCsapProfile } from "@/lib/reporting/toolRegistry";
import type { ScanReport } from "@/lib/types/scan";
import { buildSurveyFormContext } from "@/lib/analyzer/formContext";

export type KeyProblemSeverity = "critical" | "high" | "medium";

export type KeyProblem = {
  id: string;
  severity: KeyProblemSeverity;
  headline: string;
  fact: string;
  why: string;
  action: string;
  evidenceText: string | null;
  basisLabels: string[];
};

function platformLabel(report: ScanReport): string {
  const p = (report.platform || "").toLowerCase();
  if (p.includes("google")) return "Google Forms";
  if (p.includes("naver")) return "Naver Form";
  if (p.includes("moa")) return "Moaform";
  return report.platform || "외부 설문도구";
}

export function buildKeyProblems(
  report: ScanReport,
  summary: CollectedDataSummary,
): KeyProblem[] {
  const problems: KeyProblem[] = [];
  const privacyType = classifyPrivacyDataType(report, summary);
  const subject = classifySurveySubject(report);
  const publicLike = isPublicLikeSubject(subject);
  const missing = missingNoticeLabels(report);
  const formCtx = buildSurveyFormContext(report.form);
  const tool = getToolCsapProfile(report.platform as never);
  const toolLabel = tool.platformLabel || platformLabel(report);
  const overseas = tool.toolCategory === "overseas_saas";

  if (
    privacyType === "sensitive_or_high_risk" ||
    summary.sensitiveItems.length > 0 ||
    summary.highRiskItems.length > 0
  ) {
    const items = [
      ...summary.sensitiveItems,
      ...summary.highRiskItems,
    ].slice(0, 6);
    problems.push({
      id: "sensitive_high_risk",
      severity: "critical",
      headline: "응답자의 민감정보·고위험 정보까지 요구하는 문항이 확인됩니다",
      fact: items.length
        ? `탐지된 항목: ${items.join(", ")}`
        : "민감정보 또는 고위험 정보 수집 문항이 확인됩니다.",
      why: "민감·고위험 정보는 유출·오남용 시 피해가 커서 수집 목적·보호조치·동의를 특히 엄격히 확인해야 합니다.",
      action: "수집 필요성을 재검토하고, 관련 고지·동의·보호조치가 화면에 명확한지 확인하세요.",
      evidenceText: items[0] || null,
      basisLabels: ["개인정보보호법 민감정보 규정"],
    });
  }

  if (
    (privacyType === "direct_identifier" ||
      privacyType === "sensitive_or_high_risk" ||
      privacyType === "quasi_only") &&
    missing.length > 0
  ) {
    problems.push({
      id: "notice_gaps",
      severity: missing.length >= 3 ? "critical" : "high",
      headline:
        "개인정보를 요구하면서 필수 고지 근거가 화면에서 확인되지 않습니다",
      fact: `확인되지 않은 안내: ${missing.slice(0, 5).join(", ")}`,
      why: "개인정보를 수집하는 설문은 수집 목적·항목·보유기간·파기·거부권·문의처 등 핵심 안내를 함께 제시해야 합니다.",
      action: "응답 화면(상단·하단·별도 안내 포함)에서 누락된 고지를 보완하세요.",
      evidenceText: missing[0] || null,
      basisLabels: ["개인정보 수집·이용 고지"],
    });
  }

  if (
    publicLike &&
    (privacyType === "direct_identifier" ||
      privacyType === "sensitive_or_high_risk" ||
      privacyType === "quasi_only")
  ) {
    problems.push({
      id: "public_external_tool",
      severity: "high",
      headline: `공공부문 설문에서 외부 설문도구(${toolLabel}) 사용이 확인됩니다`,
      fact: `공공·공공유사 주체로 분류된 설문이 ${toolLabel}에서 개인정보를 수집하고 있습니다.`,
      why: overseas
        ? "공공부문이 클라우드 기반 외부 도구로 개인정보를 처리할 때는 보안·접근권한·국외보관·위탁 관리 기준을 확인해야 합니다."
        : "공공부문이 외부 설문도구로 개인정보를 수집할 경우 보안성·위탁·보유·파기 기준 확인이 필요합니다.",
      action: "도구 적합성·보안인증·위탁/국외 이전 여부를 기관 기준으로 검토하세요.",
      evidenceText: toolLabel,
      basisLabels: overseas
        ? ["클라우드/CSAP 확인", "개인정보보호법"]
        : ["공공부문 외부도구 확인"],
    });
  }

  if (
    formCtx.organizationCandidates.length === 0 &&
    (privacyType === "direct_identifier" ||
      privacyType === "sensitive_or_high_risk")
  ) {
    problems.push({
      id: "operator_unclear",
      severity: "high",
      headline: "개인정보를 요구하면서 조사·책임 주체가 화면에서 명확하지 않습니다",
      fact: "설문 본문에서 운영기관·주최·주관 표기를 확정하기 어렵습니다.",
      why: "응답자는 누구에게 정보가 가는지 모른 채 개인정보를 넘기게 됩니다.",
      action: "조사기관명·담당부서·문의처를 설문 상단 또는 고지문에 명시하세요.",
      evidenceText: null,
      basisLabels: ["운영주체 확인"],
    });
  }

  if (
    formCtx.contactCandidates.length === 0 &&
    missing.some((m) => /문의|담당|연락/.test(m))
  ) {
    problems.push({
      id: "contact_missing",
      severity: "medium",
      headline: "개인정보 관련 문의·연락 창구가 화면에서 확인되지 않습니다",
      fact: "전화번호·이메일 등 문의 정보가 설문 전체에서 확인되지 않았습니다.",
      why: "문의 창구가 없으면 열람·정정·삭제 요청 경로를 찾기 어렵습니다.",
      action: "개인정보 문의 담당부서와 연락처를 고지문에 포함하세요.",
      evidenceText: null,
      basisLabels: ["문의처 안내"],
    });
  }

  if (
    privacyType === "direct_identifier" &&
    !problems.some((p) => p.id === "sensitive_high_risk")
  ) {
    const items = summary.directIdentifiers.slice(0, 6);
    problems.push({
      id: "direct_identifiers",
      severity: "medium",
      headline: "이름·연락처 등 개인정보 입력을 요구하는 문항이 확인됩니다",
      fact: items.length
        ? `탐지된 항목: ${items.join(", ")}`
        : "직접 식별 가능한 개인정보 문항이 확인됩니다.",
      why: "불필요한 개인정보 수집은 유출·목적 외 이용 위험을 키웁니다.",
      action: "꼭 필요한 항목만 남기고, 고지·동의를 함께 확인하세요.",
      evidenceText: items[0] || null,
      basisLabels: ["최소수집"],
    });
  }

  const rank: Record<KeyProblemSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };
  return problems
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 3);
}
