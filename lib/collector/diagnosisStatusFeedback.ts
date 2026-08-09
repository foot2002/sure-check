/**
 * Feedback clear Diagnosis outcomes into survey_links.status.
 * Never updates on JS/extraction/timeout ambiguous reasons.
 */

import {
  collectorFeedbackFromLimitedReason,
} from "@/lib/report/limitedOutcomeBuckets";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CollectorStatusFeedbackResult = {
  surveyLinkId: string;
  fromStatus: string | null;
  toStatus: "closed" | "restricted" | null;
  applied: boolean;
  reason: string;
  limitedReason: string | null;
};

export async function planCollectorStatusFeedback(input: {
  surveyLinkId: string;
  limitedReason: string | null | undefined;
  dryRun?: boolean;
}): Promise<CollectorStatusFeedbackResult> {
  const target = collectorFeedbackFromLimitedReason(input.limitedReason);
  const supabase = createSupabaseServerClient();
  const { data: link, error } = await supabase
    .from("survey_links")
    .select("id, status, last_discovered_at, updated_at")
    .eq("id", input.surveyLinkId)
    .maybeSingle();

  if (error || !link) {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus: null,
      toStatus: target,
      applied: false,
      reason: error?.message || "survey_link_not_found",
      limitedReason: input.limitedReason || null,
    };
  }

  const fromStatus = String(link.status || "");
  if (!target) {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus,
      toStatus: null,
      applied: false,
      reason: "ambiguous_or_extract_limited",
      limitedReason: input.limitedReason || null,
    };
  }

  if (fromStatus === target) {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus,
      toStatus: target,
      applied: false,
      reason: "already_in_target_status",
      limitedReason: input.limitedReason || null,
    };
  }

  // Do not downgrade closed → restricted; do not overwrite ignored/invalid.
  if (fromStatus === "closed" && target === "restricted") {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus,
      toStatus: target,
      applied: false,
      reason: "keep_closed_over_restricted",
      limitedReason: input.limitedReason || null,
    };
  }
  if (fromStatus === "ignored" || fromStatus === "invalid") {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus,
      toStatus: target,
      applied: false,
      reason: `skip_status_${fromStatus}`,
      limitedReason: input.limitedReason || null,
    };
  }

  // Recent live rediscovery evidence: do not overwrite active → closed/restricted
  // when last_discovered_at is within ~6h. Stale actives (or non-active) still allow.
  const RECENT_REDISCOVERY_MS = 6 * 60 * 60 * 1000;
  if (
    fromStatus === "active" &&
    (target === "closed" || target === "restricted") &&
    link.last_discovered_at
  ) {
    const ageMs = Date.now() - Date.parse(String(link.last_discovered_at));
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < RECENT_REDISCOVERY_MS) {
      return {
        surveyLinkId: input.surveyLinkId,
        fromStatus,
        toStatus: target,
        applied: false,
        reason: "skip_recent_live_rediscovery",
        limitedReason: input.limitedReason || null,
      };
    }
  }

  if (fromStatus === "restricted" && target === "closed") {
    // Allow upgrade restricted → closed when response ended.
  }

  if (input.dryRun) {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus,
      toStatus: target,
      applied: false,
      reason: "dry_run_would_update",
      limitedReason: input.limitedReason || null,
    };
  }

  const { error: upErr } = await supabase
    .from("survey_links")
    .update({
      status: target,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.surveyLinkId)
    .eq("status", fromStatus);

  if (upErr) {
    return {
      surveyLinkId: input.surveyLinkId,
      fromStatus,
      toStatus: target,
      applied: false,
      reason: upErr.message,
      limitedReason: input.limitedReason || null,
    };
  }

  return {
    surveyLinkId: input.surveyLinkId,
    fromStatus,
    toStatus: target,
    applied: true,
    reason: "updated_from_diagnosis",
    limitedReason: input.limitedReason || null,
  };
}

/**
 * After linkage reaches limited/completed, optionally sync collector status.
 */
export async function feedbackCollectorStatusFromDiagnosisLink(input: {
  surveyLinkId: string;
  linkageStatus: string;
  limitedReason: string | null | undefined;
  dryRun?: boolean;
}): Promise<CollectorStatusFeedbackResult | null> {
  if (
    input.linkageStatus !== "limited" &&
    input.linkageStatus !== "completed"
  ) {
    return null;
  }
  // completed with questions is not a status feedback source here.
  if (input.linkageStatus === "completed") return null;
  return planCollectorStatusFeedback({
    surveyLinkId: input.surveyLinkId,
    limitedReason: input.limitedReason,
    dryRun: input.dryRun,
  });
}
