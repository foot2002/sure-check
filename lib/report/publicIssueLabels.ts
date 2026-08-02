/**
 * Public-facing issue labels for /report aggregate dashboard.
 * Multiple finding_type / check_domain combinations collapse into one label.
 */

/** Display priority — specific items first; "기타" last / excluded from top. */
export const PUBLIC_ISSUE_DISPLAY_PRIORITY = [
  "고지문 미흡",
  "동의 안내 미흡",
  "운영주체 확인 필요",
  "외부 설문도구·처리경로 확인 필요",
  "국외이전 확인 필요",
  "민감정보 문항 확인 필요",
  "문항 분석 제한",
  "공공부문 클라우드 보안 확인 필요",
  "보유기간·파기 안내 미흡",
  "개인정보 문항 확인 필요",
  "고위험정보 문항 확인 필요",
  "기타 확인 필요",
] as const;

export const PUBLIC_ISSUE_LABELS = PUBLIC_ISSUE_DISPLAY_PRIORITY;

export type PublicIssueLabel = (typeof PUBLIC_ISSUE_DISPLAY_PRIORITY)[number];

export function issueDisplayRank(label: string): number {
  const index = PUBLIC_ISSUE_DISPLAY_PRIORITY.indexOf(
    label as PublicIssueLabel,
  );
  return index >= 0 ? index : PUBLIC_ISSUE_DISPLAY_PRIORITY.length;
}

export function toPublicIssueLabel(
  findingType: string | null | undefined,
  checkDomain: string | null | undefined,
): PublicIssueLabel {
  const type = (findingType || "other").toLowerCase();
  const domain = (checkDomain || "").toLowerCase();

  if (domain === "retention" || domain === "destruction") {
    return "보유기간·파기 안내 미흡";
  }
  if (domain === "consent" || type === "consent_gap") {
    return "동의 안내 미흡";
  }
  if (domain === "overseas_transfer" || type === "overseas_transfer") {
    return "국외이전 확인 필요";
  }
  if (domain === "public_sector" || type === "public_sector_cloud") {
    return "공공부문 클라우드 보안 확인 필요";
  }
  if (
    domain === "outsourcing" ||
    domain === "tool_governance" ||
    type === "tool_governance" ||
    type === "outsourcing"
  ) {
    return "외부 설문도구·처리경로 확인 필요";
  }
  if (type === "operator_unclear") {
    return "운영주체 확인 필요";
  }
  if (type === "limited_diagnosis") {
    return "문항 분석 제한";
  }
  if (type === "sensitive_info_risk" || domain === "sensitive_data") {
    return "민감정보 문항 확인 필요";
  }
  if (type === "high_risk_info" || domain === "high_risk_data") {
    return "고위험정보 문항 확인 필요";
  }
  if (type === "personal_info_risk") {
    return "개인정보 문항 확인 필요";
  }
  if (type === "notice_gap" || domain === "notice" || domain === "contact") {
    return "고지문 미흡";
  }
  if (type === "management_gap") {
    if (domain === "retention" || domain === "destruction") {
      return "보유기간·파기 안내 미흡";
    }
    return "고지문 미흡";
  }
  return "기타 확인 필요";
}
