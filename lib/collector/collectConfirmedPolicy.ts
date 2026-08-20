/**
 * Collect-confirmed vs raw-discovered policy.
 * DB CHECK still uses discovered/active/closed/restricted/stale/ignored/invalid/unreachable.
 * Conceptual lanes below are mapped onto those statuses + freshness JSON + triage.
 */

import type { TriageResult } from "@/lib/collector/candidateTriage";
import { looksLikePersonalResearch } from "@/lib/collector/candidateTriage";
import type { CollectorOrgQualityClass } from "@/lib/collector/orgQuality";
import type { SurveyLinkFreshness } from "@/lib/collector/types";

export const AUTO_DIAGNOSIS_DAILY_LIMIT_DEFAULT = 300;
export const AUTO_DIAGNOSIS_BATCH_SIZE_DEFAULT = 20;
export const AUTO_DIAGNOSIS_MAX_BACKLOG_DAYS_DEFAULT = 2;

export const AUTO_DIAGNOSIS_TARGET_LANES = [
  "collect_confirmed",
  "active_recent",
  "active_candidate",
] as const;

export type AutoDiagnosisTargetLane = (typeof AUTO_DIAGNOSIS_TARGET_LANES)[number];

export type CollectLane =
  | "raw_discovered"
  | "collect_candidate"
  | "collect_confirmed"
  | "active_recent"
  | "active_candidate"
  | "date_unknown_hold"
  | "stale_candidate"
  | "screened_out";

const OFFICIAL_ORGS = new Set<CollectorOrgQualityClass>([
  "public",
  "company",
  "university_official",
]);

const SCREENED_STATUSES = new Set([
  "closed",
  "restricted",
  "stale",
  "ignored",
  "invalid",
  "unreachable",
  "old_year",
  "personal_research",
]);

const PII_HINT_RE =
  /개인정보|주민등록|연락처|휴대전화|휴대폰|이메일|성명|이름|주소|고객|직원|회원|민원|보건|복지/;

const SERVICE_HINT_RE = /보건|복지|민원|고객|직원|회원/;

function readEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function getAutoDiagnosisDailyLimit(): number {
  return readEnvInt(
    "AUTO_DIAGNOSIS_DAILY_LIMIT",
    AUTO_DIAGNOSIS_DAILY_LIMIT_DEFAULT,
    1,
    2000,
  );
}

export function getAutoDiagnosisBatchSize(): number {
  return readEnvInt(
    "AUTO_DIAGNOSIS_BATCH_SIZE",
    AUTO_DIAGNOSIS_BATCH_SIZE_DEFAULT,
    1,
    40,
  );
}

export function getAutoDiagnosisMaxBacklogDays(): number {
  return readEnvInt(
    "AUTO_DIAGNOSIS_MAX_BACKLOG_DAYS",
    AUTO_DIAGNOSIS_MAX_BACKLOG_DAYS_DEFAULT,
    1,
    14,
  );
}

export function isOfficialAutoDiagnosisOrg(
  organization: CollectorOrgQualityClass | string | null | undefined,
): boolean {
  return Boolean(organization && OFFICIAL_ORGS.has(organization as CollectorOrgQualityClass));
}

/** Official A/B collect-confirmed rows may enter auto diagnosis. C / academic never. */
export function isOfficialAutoDiagnosisTriage(triage: TriageResult): boolean {
  if (triage.organization === "individual_or_academic") return false;
  if (triage.queue === "C_ARCHIVE") return false;
  if (triage.queue !== "A_PRIORITY" && triage.queue !== "B_PRIORITY") return false;
  if (!isOfficialAutoDiagnosisOrg(triage.organization)) return false;
  return true;
}

function freshnessShouldDiagnose(
  freshness?: SurveyLinkFreshness | null,
): boolean {
  if (!freshness) return true;
  if (freshness.diagnosis_eligible_recent === false) return false;
  if (freshness.should_diagnose === false) return false;
  const reason = String(freshness.diagnosis_exclusion_reason || freshness.reason_code || "");
  if (
    reason === "date_unknown_hold" ||
    reason === "active_unknown_date" ||
    reason === "stale_year" ||
    reason === "stale_topic_year" ||
    reason === "previous_year_phrase" ||
    reason === "published_too_old"
  ) {
    return false;
  }
  return true;
}

export function classifyCollectLane(input: {
  status?: string | null;
  freshness?: SurveyLinkFreshness | null;
  title?: string | null;
}): CollectLane {
  const status = (input.status || "").toLowerCase();
  const freshness = input.freshness;
  const freshnessStatus = String(freshness?.freshness_status || "");
  const reason = String(freshness?.reason_code || "");

  if (looksLikePersonalResearch(input.title)) return "screened_out";
  if (freshnessStatus === "stale_candidate") return "stale_candidate";
  if (SCREENED_STATUSES.has(status)) return "screened_out";
  if (status === "discovered") return "collect_candidate";
  if (!status || status === "raw_discovered") return "raw_discovered";

  if (status === "active") {
    if (!freshnessShouldDiagnose(freshness)) {
      if (reason === "date_unknown_hold" || reason === "active_unknown_date") {
        return "date_unknown_hold";
      }
      return "screened_out";
    }
    if (reason === "active_unknown_date" || reason === "date_unknown_hold") {
      return "date_unknown_hold";
    }
    if (freshnessStatus === "active_candidate" || reason === "active_candidate") {
      return "active_candidate";
    }
    if (
      reason === "recent_window" ||
      reason === "published_recent" ||
      freshnessStatus === "active"
    ) {
      return "active_recent";
    }
    return "collect_confirmed";
  }

  return "collect_candidate";
}

export function isCollectConfirmedLane(lane: CollectLane): boolean {
  return (AUTO_DIAGNOSIS_TARGET_LANES as readonly string[]).includes(lane);
}

export function isCollectConfirmed(input: {
  status?: string | null;
  freshness?: SurveyLinkFreshness | null;
  title?: string | null;
}): boolean {
  return isCollectConfirmedLane(classifyCollectLane(input));
}

export function isAutoDiagnosisTarget(input: {
  status?: string | null;
  freshness?: SurveyLinkFreshness | null;
  title?: string | null;
  triage?: TriageResult | null;
}): boolean {
  if (!isCollectConfirmed(input)) return false;
  if (looksLikePersonalResearch(input.title)) return false;
  if (input.triage && !isOfficialAutoDiagnosisTriage(input.triage)) return false;
  if (!freshnessShouldDiagnose(input.freshness)) return false;
  return true;
}

export function diagnosisPriorityScore(input: {
  triage: TriageResult;
  title?: string | null;
}): number {
  const title = input.title || "";
  let score = 0;
  if (input.triage.organization === "public") score += 400;
  else if (input.triage.organization === "company") score += 300;
  else if (input.triage.organization === "university_official") score += 200;
  if (PII_HINT_RE.test(title)) score += 80;
  if (SERVICE_HINT_RE.test(title)) score += 40;
  if (input.triage.queue === "A_PRIORITY") score += 20;
  score += input.triage.recencyScore;
  if (input.triage.recency === "recent_high") score += 30;
  else if (input.triage.recency === "recent_possible") score += 18;
  else if (input.triage.recency === "unknown") score += 8;
  return score;
}

export function diagnosisCoverage(
  collectConfirmed: number,
  diagnosed: number,
): {
  missing: number;
  coverageRate: number;
  missingRate: number;
  fail: boolean;
} {
  const confirmed = Math.max(0, collectConfirmed);
  const done = Math.max(0, diagnosed);
  const missing = Math.max(0, confirmed - done);
  const coverageRate = confirmed > 0 ? Math.min(1, done / confirmed) : 1;
  const missingRate = confirmed > 0 ? missing / confirmed : 0;
  return {
    missing,
    coverageRate,
    missingRate,
    fail: confirmed > 0 && missing > 0,
  };
}
