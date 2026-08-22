/**
 * Admin dashboard quick-views. KPI click → list filter, counts from the
 * same period-scoped reportable cases.
 */
import { isReportReviewDecision } from "@/lib/report/adminOutreach";

type DashboardCase = {
  observedAt: string;
  overallRiskLevel: string;
  userDecisionLabel: string | null;
  platform: string;
  hasPersonalInfo: boolean;
  publicPrivateType: string;
  outreachPriority: string;
  outreachUiStatus: string;
  evidenceStatus: string;
  publicCaseStatus: string;
};

export const ADMIN_DASHBOARD_VIEWS = [
  "all",
  "unreviewed",
  "highOrReport",
  "outreach",
  "publicSector",
  "evidenceReady",
  "evidenceMissing",
  "captureNeeded",
  "priorityEvidence",
  "reportReady",
  "unpublished",
  "reviewing",
  "published",
  "paused",
] as const;

export type AdminDashboardView = (typeof ADMIN_DASHBOARD_VIEWS)[number];

export function normalizeAdminDashboardView(
  value: string | null | undefined,
): AdminDashboardView {
  if (ADMIN_DASHBOARD_VIEWS.includes(value as AdminDashboardView)) {
    return value as AdminDashboardView;
  }
  return "all";
}

export function isPublicSectorReviewCase(row: DashboardCase): boolean {
  return (
    row.publicPrivateType === "public" &&
    row.hasPersonalInfo &&
    row.platform !== "wiseon_csap"
  );
}

export function isHighOrReportReviewCase(row: DashboardCase): boolean {
  return (
    row.overallRiskLevel === "high" ||
    row.overallRiskLevel === "critical" ||
    isReportReviewDecision(row.userDecisionLabel)
  );
}

export function matchesAdminDashboardView(
  row: DashboardCase,
  view: AdminDashboardView,
): boolean {
  switch (view) {
    case "unreviewed":
      return row.outreachUiStatus === "unreviewed";
    case "highOrReport":
      return isHighOrReportReviewCase(row);
    case "outreach":
      return row.outreachUiStatus === "send" || row.outreachUiStatus === "candidate";
    case "publicSector":
      return isPublicSectorReviewCase(row);
    case "evidenceReady":
      return row.evidenceStatus === "증거 확보" || row.evidenceStatus === "일부 확보";
    case "evidenceMissing":
      return row.evidenceStatus === "증거 부족" || row.evidenceStatus === "캡처 필요";
    case "captureNeeded":
      return row.evidenceStatus === "캡처 필요";
    case "priorityEvidence":
      return (
        row.outreachPriority === "A" &&
        (row.overallRiskLevel === "high" || row.overallRiskLevel === "critical") &&
        row.publicPrivateType === "public" &&
        row.hasPersonalInfo &&
        (row.evidenceStatus === "증거 부족" || row.evidenceStatus === "캡처 필요") &&
        (row.outreachUiStatus === "unreviewed" ||
          row.outreachUiStatus === "send" ||
          row.outreachUiStatus === "candidate")
      );
    case "reportReady":
      return true;
    case "unpublished":
      return row.publicCaseStatus === "private" || row.publicCaseStatus === "archived";
    case "reviewing":
      return row.publicCaseStatus === "reviewing";
    case "published":
      return row.publicCaseStatus === "published";
    case "paused":
      return row.publicCaseStatus === "paused";
    default:
      return true;
  }
}

export function pickTodayPriorityCases<T extends DashboardCase>(
  rows: T[],
  limit = 5,
): T[] {
  const scored = rows.map((row) => {
    let score = 0;
    if (row.outreachPriority === "A" && row.outreachUiStatus === "unreviewed") {
      score += 40;
    }
    if (
      row.overallRiskLevel === "critical" &&
      (row.evidenceStatus === "증거 확보" || row.evidenceStatus === "일부 확보")
    ) {
      score += 30;
    }
    if (isPublicSectorReviewCase(row) && row.outreachUiStatus !== "done") {
      score += 20;
    }
    if (row.outreachUiStatus === "send") score += 25;
    if (row.outreachPriority === "A") score += 8;
    if (row.outreachUiStatus === "unreviewed") score += 5;
    return { row, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.row.observedAt.localeCompare(a.row.observedAt))
    .slice(0, limit)
    .map((item) => item.row);
}

export function subjectTypeKo(value: string | null | undefined): string {
  const v = (value || "").toLowerCase();
  if (v === "public_agency") return "공공기관";
  if (v === "private_company") return "민간기업";
  if (v === "school_local") return "학교/교육기관";
  if (v === "medical") return "의료기관";
  if (v === "nonprofit") return "비영리";
  if (v === "public_commissioned_private") return "공공위탁 민간";
  return "";
}

export function formatDataCollectionBrief(input: {
  personalCount?: number | null;
  sensitiveCount?: number | null;
  categoryLabels?: string[];
  hasPersonalInfo?: boolean | null;
  hasSensitiveInfo?: boolean | null;
}): {
  headline: string;
  items: string;
  hasSensitive: boolean;
} {
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
  const items = (input.categoryLabels || [])
    .map((c) => c.trim())
    .filter((c) => c && !/P\/S\/H|private|public|partial|success/i.test(c))
    .slice(0, 3)
    .join(" · ");
  return {
    headline: personal > 0 ? `개인정보 ${personal}개` : "개인정보 없음",
    items,
    hasSensitive: sensitive > 0,
  };
}
