import { collectionToolKo } from "@/lib/report/publicInstitutionColumns";

export function normalizeAdminSearchQuery(
  value: string | null | undefined,
): string {
  return (value || "").normalize("NFKC").trim().toLowerCase();
}

/** Escape a user query for PostgREST `or()` + `ilike` filters. */
export function escapePostgrestIlike(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/[,()]/g, " ");
}

function orIlike(columns: string[], raw: string): string | null {
  const pattern = escapePostgrestIlike(raw);
  if (!pattern) return null;
  return columns.map((column) => `${column}.ilike.%${pattern}%`).join(",");
}

/** survey_records: 기관명·제목·URL·판단 라벨 */
export function adminSurveyRecordSearchOrFilter(raw: string): string | null {
  return orIlike(
    [
      "operator_name",
      "survey_title",
      "survey_url",
      "final_url",
      "user_decision_label",
    ],
    raw,
  );
}

/** scan_reports 컬럼: 진단 판단·요약 */
export function adminScanReportSearchOrFilter(raw: string): string | null {
  return orIlike(
    ["user_decision_label", "summary", "internal_verdict"],
    raw,
  );
}

/** scan_reports JSON: 제목·기관 매칭명·진단 요약 */
export function adminScanReportJsonSearchOrFilter(raw: string): string | null {
  return orIlike(
    [
      "report_json->>summary",
      "report_json->form->>title",
      "report_json->form->>operatorType",
      "report_json->debug->publicInstitutionEvidence->>matchedName",
    ],
    raw,
  );
}

/** survey_findings: 진단 문제 제목·설명·권고 */
export function adminFindingSearchOrFilter(raw: string): string | null {
  return orIlike(["title", "description", "recommendation"], raw);
}

type AdminSearchableCase = {
  operatorName?: string | null;
  institutionName?: string | null;
  orgClass?: string | null;
  originalOrgType?: string | null;
  surveyTitle?: string | null;
  surveyUrl?: string | null;
  userDecisionLabel?: string | null;
  diagnosisSummary?: string | null;
  issueBadges?: string[] | null;
  dataSummary?: string | null;
  piiItemLabels?: string[] | null;
  categoryLabels?: string[] | null;
  platform?: string | null;
  subjectType?: string | null;
};

export function matchesAdminCaseSearch(
  row: AdminSearchableCase,
  rawQuery: string,
): boolean {
  const q = normalizeAdminSearchQuery(rawQuery);
  if (!q) return true;
  const haystack = [
    row.operatorName,
    row.institutionName,
    row.orgClass,
    row.originalOrgType,
    row.surveyTitle,
    row.surveyUrl,
    row.userDecisionLabel,
    row.diagnosisSummary,
    row.dataSummary,
    row.subjectType,
    collectionToolKo(row.platform),
    ...(row.issueBadges || []),
    ...(row.piiItemLabels || []),
    ...(row.categoryLabels || []),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeAdminSearchQuery(value))
    .join("\n");
  return haystack.includes(q);
}
