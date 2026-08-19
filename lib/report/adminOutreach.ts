/**
 * Admin outreach-review helpers.
 * Wording: 위반 소지 / 개선 필요 / 확인 필요 / 개선안내 후보. Never 위반 확정.
 */

export type OutreachPriority = "A" | "B" | "C";

export type EvidenceStatusKo =
  | "증거 확보"
  | "일부 확보"
  | "증거 부족"
  | "캡처 필요";

const TECHNICAL_NOISE_RE =
  /HTML\s*진단|platform_parser|browser_fallback|추출기|parser|fast.?path|fallback/i;

const ISSUE_MAP: Array<{ re: RegExp; label: string }> = [
  { re: /목적/, label: "수집 목적 안내 미흡" },
  { re: /항목/, label: "수집 항목 안내 미흡" },
  { re: /보유/, label: "보유기간 확인 필요" },
  { re: /파기/, label: "파기 기준 확인 필요" },
  { re: /연락처|담당자|문의/, label: "담당자 연락처 미흡" },
  { re: /위탁|외부|설문도구/, label: "외부도구·위탁 안내 미흡" },
  { re: /국외/, label: "국외이전 확인 필요" },
  { re: /CSAP|클라우드/, label: "공공부문 CSAP 확인 필요" },
  { re: /민감/, label: "민감정보 문항 확인 필요" },
  { re: /고지/, label: "고지문 미흡" },
];

export function isReportReviewDecision(label: string | null | undefined): boolean {
  return /응답 거부|신고 검토|REPORT_OR_INQUIRE|DO_NOT_RESPOND/.test(label || "");
}

export function isPublicOrg(publicPrivateType: string | null | undefined): boolean {
  const v = (publicPrivateType || "").toLowerCase();
  return v === "public" || v === "공공" || v.includes("public");
}

export function formatDataCollectionSummary(input: {
  personalCount?: number | null;
  sensitiveCount?: number | null;
  highRiskCount?: number | null;
  hasPersonalInfo?: boolean | null;
  hasSensitiveInfo?: boolean | null;
  hasHighRiskInfo?: boolean | null;
  categoryLabels?: string[];
}): string {
  const personal =
    input.personalCount != null
      ? input.personalCount
      : input.hasPersonalInfo
        ? 1
        : 0;
  const sensitive =
    input.sensitiveCount != null
      ? input.sensitiveCount
      : input.hasSensitiveInfo
        ? 1
        : 0;
  const highRisk =
    input.highRiskCount != null
      ? input.highRiskCount
      : input.hasHighRiskInfo
        ? 1
        : 0;
  const parts = [
    personal > 0 ? `개인정보 ${personal}개` : "개인정보 없음",
    sensitive > 0 ? `민감정보 ${sensitive}개` : "민감정보 없음",
    highRisk > 0 ? `고위험 ${highRisk}개` : "고위험 없음",
  ];
  const cats = (input.categoryLabels || [])
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (cats.length > 0) return `${parts.join(" · ")}\n${cats.join(" · ")}`;
  return parts.join(" · ");
}

export function classifyEvidenceStatusKo(input: {
  evidenceCount: number;
  captureStatus?: string | null;
}): EvidenceStatusKo {
  const capture = (input.captureStatus || "").toLowerCase();
  if (capture === "pending" || capture === "running") return "캡처 필요";
  if (input.evidenceCount <= 0) return "증거 부족";
  if (capture === "partial") return "일부 확보";
  if (capture === "success" || input.evidenceCount >= 2) return "증거 확보";
  if (input.evidenceCount > 0) return "일부 확보";
  return "증거 부족";
}

export function pickIssueBadges(input: {
  userDecisionLabel?: string | null;
  complianceLabels?: string[];
  findingTitles?: string[];
  hasSensitiveInfo?: boolean | null;
  hasHighRiskInfo?: boolean | null;
  isPublic?: boolean;
}): string[] {
  const blobs = [
    input.userDecisionLabel || "",
    ...(input.complianceLabels || []),
    ...(input.findingTitles || []),
  ];
  const badges: string[] = [];
  const push = (label: string) => {
    if (!badges.includes(label) && badges.length < 3) badges.push(label);
  };
  for (const blob of blobs) {
    if (TECHNICAL_NOISE_RE.test(blob)) continue;
    for (const hint of ISSUE_MAP) {
      if (hint.re.test(blob)) push(hint.label);
    }
  }
  if (input.hasSensitiveInfo) push("민감정보 문항 확인 필요");
  if (input.hasHighRiskInfo) push("고위험정보 문항 확인 필요");
  if (input.isPublic) push("공공부문 CSAP 확인 필요");
  return badges.slice(0, 3);
}

export function classifyOutreachPriority(input: {
  publicPrivateType?: string | null;
  hasPersonalInfo?: boolean | null;
  hasSensitiveInfo?: boolean | null;
  hasHighRiskInfo?: boolean | null;
  overallRiskLevel?: string | null;
  userDecisionLabel?: string | null;
  evidenceCount?: number;
  issueBadges?: string[];
}): OutreachPriority {
  const risk = (input.overallRiskLevel || "").toLowerCase();
  const publicOrg = isPublicOrg(input.publicPrivateType);
  const noticeGap = (input.issueBadges || []).length > 0;
  const hasEvidence = (input.evidenceCount || 0) > 0;
  if (isReportReviewDecision(input.userDecisionLabel)) return "A";
  if (input.hasSensitiveInfo || input.hasHighRiskInfo) return "A";
  if (publicOrg && input.hasPersonalInfo && noticeGap && hasEvidence) return "A";
  if (
    !publicOrg &&
    input.hasPersonalInfo &&
    noticeGap &&
    (risk === "critical" || risk === "high")
  ) {
    return "A";
  }
  if (input.hasPersonalInfo && (noticeGap || risk === "high" || risk === "critical")) {
    return "B";
  }
  if (input.hasPersonalInfo) return "B";
  return "C";
}

export function isOutreachCandidate(priority: OutreachPriority): boolean {
  return priority === "A" || priority === "B";
}

export function recommendedAction(input: {
  issueBadges: string[];
  hasPersonalInfo?: boolean | null;
}): string {
  if (input.issueBadges.some((b) => /고지|목적|항목|보유|파기|연락처/.test(b))) {
    return "개인정보 수집·이용 고지 보완 요청";
  }
  if (input.hasPersonalInfo) return "개인정보 수집 안내 확인 및 보완 요청";
  return "추가 확인 후 개선안내 여부 판단";
}

export function needsEvidenceDownload(input: {
  priority?: OutreachPriority;
  overallRiskLevel?: string | null;
  userDecisionLabel?: string | null;
  hasSensitiveInfo?: boolean | null;
  hasHighRiskInfo?: boolean | null;
  publicPrivateType?: string | null;
}): boolean {
  const risk = (input.overallRiskLevel || "").toLowerCase();
  if (input.priority === "A") return true;
  if (risk === "critical" || risk === "high") return true;
  if (isReportReviewDecision(input.userDecisionLabel)) return true;
  if (input.hasSensitiveInfo || input.hasHighRiskInfo) return true;
  if (isPublicOrg(input.publicPrivateType) && risk !== "low") return true;
  return false;
}

function joinKoList(items: string[]): string {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length === 0) return "개인정보";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]}, ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, ${unique[unique.length - 1]}`;
}

export function buildOutreachCopy(input: {
  categoryLabels?: string[];
  issueBadges?: string[];
}): {
  problemReason: string;
  improvementRequest: string;
  letterSummary: string;
} {
  const cats = joinKoList((input.categoryLabels || []).slice(0, 6));
  const gaps =
    (input.issueBadges || []).length > 0
      ? (input.issueBadges || []).join(", ")
      : "수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처";
  const problemReason = `이 설문은 ${cats} 등 개인정보를 수집하고 있으나, 공개 설문 화면 기준으로 ${gaps} 안내가 충분히 확인되지 않았습니다. 응답자가 제공 여부를 판단하기 어려운 위반 소지가 있어 확인·개선이 필요합니다.`;
  const improvementRequest = `응답자가 개인정보 제공 여부를 명확히 판단할 수 있도록 설문 첫 화면 또는 개인정보 수집·이용 안내문에 관련 고지 항목을 보완해 주시기 바랍니다.`;
  const disclaimer =
    "본 내용은 공개 설문 화면에 대한 자동진단 기반의 개선 요청이며, 개별 설문의 위법 여부를 확정하는 취지는 아닙니다.";
  const letterSummary = `해당 설문은 ${cats} 등 개인정보를 수집하고 있으나, 공개 설문 화면 기준으로 개인정보 수집 목적, 수집 항목, 보유기간, 파기 기준, 담당자 연락처, 외부 설문도구 이용에 따른 위탁·처리경로 안내가 충분히 확인되지 않았습니다.\n\n${improvementRequest}\n\n${disclaimer}`;
  return { problemReason, improvementRequest, letterSummary };
}

export function improvementChecklist(input: {
  issueBadges?: string[];
  isPublic?: boolean;
}): string[] {
  const items = [
    "수집 목적을 설문 첫 화면에 명확히 표시",
    "수집 항목을 구체적으로 표시",
    "보유기간과 파기 기준 안내",
    "담당자 연락처 또는 문의처 표시",
    "외부 설문도구 사용 및 위탁 처리 여부 안내",
    "국외이전 여부 확인",
  ];
  if (input.isPublic) items.push("공공부문인 경우 클라우드 보안 기준 확인");
  return items;
}

export function evidenceDownloadFilename(input: {
  caseId: string;
  evidenceType: string;
  label?: string | null;
  pageNumber?: number | null;
}): string {
  const id = input.caseId.slice(0, 8);
  const label = `${input.label || ""} ${input.pageNumber ?? ""}`;
  if (input.evidenceType === "temporary_zip") {
    return `sure-check-evidence-${id}.zip`;
  }
  if (input.evidenceType === "notice_screenshot") {
    return `capture-notice-${id}.png`;
  }
  if (input.evidenceType === "pii_question_screenshot") {
    return `capture-personal-question-${id}.png`;
  }
  if (input.evidenceType === "sensitive_question_screenshot") {
    return `capture-sensitive-question-${id}.png`;
  }
  if (input.evidenceType === "high_risk_question_screenshot") {
    return `capture-high-risk-question-${id}.png`;
  }
  if (/첫|first|공개 설문/i.test(label) || input.pageNumber === 1) {
    return `capture-first-page-${id}.png`;
  }
  if (/제출|submit|직전/i.test(label)) {
    return `capture-submit-page-${id}.png`;
  }
  return `capture-${input.evidenceType}-${id}.png`;
}

export type OutreachUiStatus =
  | "unreviewed"
  | "in_review"
  | "candidate"
  | "send"
  | "hold"
  | "exclude"
  | "done";

export function classifyOutreachUiStatus(input: {
  reviewStatus?: string | null;
  publicationStatus?: string | null;
  outreachCandidate?: boolean;
}): OutreachUiStatus {
  const review = (input.reviewStatus || "none").toLowerCase();
  const pub = (input.publicationStatus || "private").toLowerCase();
  if (pub === "archived") return "exclude";
  if (review === "dismissed") return "hold";
  if (review === "in_review") return "in_review";
  if (review === "resolved") return input.outreachCandidate ? "send" : "done";
  if (input.outreachCandidate) return "candidate";
  return "unreviewed";
}

export function outreachUiStatusKo(status: OutreachUiStatus | string | null | undefined): string {
  const s = (status || "unreviewed") as OutreachUiStatus;
  if (s === "unreviewed") return "미검토";
  if (s === "in_review") return "검토중";
  if (s === "candidate") return "개선안내 후보";
  if (s === "send") return "발송대상";
  if (s === "hold") return "보류";
  if (s === "exclude") return "제외";
  if (s === "done") return "완료";
  return "미검토";
}

export function reviewStatusKo(status: string | null | undefined): string {
  const s = (status || "none").toLowerCase();
  if (s === "none" || s === "pending") return "미검토";
  if (s === "in_review") return "검토중";
  if (s === "resolved") return "완료";
  if (s === "dismissed") return "보류";
  return status || "미검토";
}

export function publicationStatusKo(status: string | null | undefined): string {
  const s = (status || "private").toLowerCase();
  if (s === "private") return "내부검토";
  if (s === "aggregate_only") return "통계만 반영";
  if (s === "public_anonymized") return "익명 사례 가능";
  if (s === "public_named") return "기관명 포함 검토";
  if (s === "archived") return "보관/제외";
  return "내부검토";
}

export function publicPrivateKo(value: string | null | undefined): string {
  const v = (value || "").toLowerCase();
  if (v === "public") return "공공";
  if (v === "private") return "민간";
  if (v === "mixed") return "혼합";
  return "미확인";
}

export function riskLabelKo(level: string | null | undefined): string {
  const v = (level || "unknown").toLowerCase();
  if (v === "critical") return "치명적";
  if (v === "high") return "높음";
  if (v === "medium") return "중간";
  if (v === "low") return "낮음";
  if (v === "limited") return "제한 진단";
  return "미분류";
}

export function assertNoConfirmedViolationWording(text: string): boolean {
  return !/위반\s*확정/.test(text);
}

export function summarizeEvidenceFiles(
  files: Array<{ id: string; evidenceType?: string | null }>,
): {
  hasTemporaryZip: boolean;
  temporaryZipId: string | null;
  hasScreenshots: boolean;
  screenshotFileIds: string[];
  downloadableEvidenceTypes: string[];
} {
  const zip = files.find((f) => f.evidenceType === "temporary_zip");
  const screenshots = files.filter(
    (f) => f.id && f.evidenceType && f.evidenceType !== "temporary_zip",
  );
  const types = [
    ...new Set(
      files
        .map((f) => String(f.evidenceType || "").trim())
        .filter(Boolean),
    ),
  ];
  return {
    hasTemporaryZip: Boolean(zip),
    temporaryZipId: zip?.id ?? null,
    hasScreenshots: screenshots.length > 0,
    screenshotFileIds: screenshots.map((f) => f.id),
    downloadableEvidenceTypes: types,
  };
}

export function pickEvidenceFile<
  T extends {
    id: string;
    evidenceType?: string | null;
    label?: string | null;
    pageNumber?: number | null;
  },
>(
  files: T[],
  kind:
    | "zip"
    | "first_page"
    | "notice"
    | "pii"
    | "sensitive"
    | "high_risk"
    | "final_page",
): T | null {
  if (kind === "zip") {
    return files.find((f) => f.evidenceType === "temporary_zip") || null;
  }
  if (kind === "notice") {
    return files.find((f) => f.evidenceType === "notice_screenshot") || null;
  }
  if (kind === "pii") {
    return files.find((f) => f.evidenceType === "pii_question_screenshot") || null;
  }
  if (kind === "sensitive") {
    return (
      files.find((f) => f.evidenceType === "sensitive_question_screenshot") ||
      null
    );
  }
  if (kind === "high_risk") {
    return (
      files.find((f) => f.evidenceType === "high_risk_question_screenshot") ||
      null
    );
  }
  if (kind === "first_page") {
    return (
      files.find((f) => f.evidenceType === "first_page_screenshot") ||
      files.find(
        (f) =>
          f.evidenceType === "key_screenshot" &&
          (f.pageNumber === 1 || /첫|first/i.test(f.label || "")),
      ) ||
      files.find((f) => f.evidenceType === "key_screenshot") ||
      null
    );
  }
  return (
    files.find((f) => f.evidenceType === "final_page_screenshot") ||
    files.find((f) => /제출|직전|submit|final/i.test(`${f.label || ""}`)) ||
    null
  );
}
