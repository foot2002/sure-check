/**
 * Rule-assisted org classification for sample review.
 * Delegates to org_v1.2 low-cost classifier. NOT claimed measurement accuracy.
 */

import { classifyOrganizationLowCost } from "@/lib/collector/candidateTriage";
import type { CollectorOrgQualityClass } from "@/lib/collector/orgQuality";

export type OrgReviewLabel = {
  label: CollectorOrgQualityClass;
  signals: string[];
  method: "rule_assisted_source_review";
};

/**
 * Stratified/rule-assisted label for human-facing sample reports.
 */
export function reviewOrgSample(input: {
  surveyTitle?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  searchQuery?: string | null;
  description?: string | null;
  canonicalUrl?: string | null;
}): OrgReviewLabel {
  const result = classifyOrganizationLowCost({
    surveyTitle: input.surveyTitle,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    searchQuery: input.searchQuery,
    description: input.description,
  });
  return {
    label: result.organization,
    signals: result.signals,
    method: "rule_assisted_source_review",
  };
}
