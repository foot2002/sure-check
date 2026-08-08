/**
 * Core collector KPIs for org_v1.2+ ops (primary vs auxiliary).
 */

export const COLLECTOR_PRIMARY_KPIS = [
  "daily_search_results",
  "new_candidates",
  "new_a_priority",
  "new_b_priority",
  "new_c_archive",
  "a_official_confirm_rate",
  "a_academic_false_inflow_rate",
  "new_public_cases",
  "new_company_cases",
  "new_university_official_cases",
  "recency_high_possible_ratio",
  "backlog_net_delta",
] as const;

export const COLLECTOR_AUX_KPIS = [
  "total_new_surveys",
  "api_calls",
  "inline_page_validates",
  "duplicate_surveys",
] as const;

export type CollectorKpiSnapshot = {
  dailySearchResults: number;
  newCandidates: number;
  newAPriority: number;
  newBPriority: number;
  newCArchive: number;
  aOfficialConfirmRate: number | null;
  aAcademicFalseInflowRate: number | null;
  newPublicCases: number;
  newCompanyCases: number;
  newUniversityOfficialCases: number;
  recencyHighPossibleRatio: number | null;
  backlogNetDelta: number | null;
  /** Auxiliary */
  totalNewSurveys: number;
};
