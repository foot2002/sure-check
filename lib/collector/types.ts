/**
 * Public survey link collector types.
 * Mirrors db/migrations/004_survey_link_collector.sql.
 * Isolated from diagnosis / monitoring dashboard types.
 */

export type CollectorPlatform = "google_forms" | "naver_form" | "moaform";

export type CollectorSurveyStatus =
  | "discovered"
  | "active"
  | "closed"
  | "restricted"
  | "stale"
  | "unreachable"
  | "ignored"
  | "invalid";

export type CollectorSourceType = "web" | "blog" | "cafe" | "unknown" | "official_site";

export type CollectionRunTrigger = "admin" | "cron";

export type CollectionRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "partial";

export type UrlKind =
  | "google_forms"
  | "naver_form"
  | "moaform"
  | "shortener"
  | "unsupported";

export interface SurveyLinkFreshness {
  freshness_status?: string;
  availability_status?: string;
  detected_start_date?: string | null;
  detected_end_date?: string | null;
  detected_year?: number | null;
  freshness_reason?: string;
  reason_code?: string;
  last_checked_at?: string;
  should_diagnose?: boolean;
  diagnosis_eligible_recent?: boolean;
  diagnosis_exclusion_reason?: string | null;
  discovery_channel?: string;
  freshness_basis?: "source_page" | "survey_page" | "unknown";
  freshness_confidence?: "high" | "medium" | "low";
  old_year_signal?: boolean;
  source_posted_date?: string | null;
  source_period_start?: string | null;
  source_period_end?: string | null;
  source_deadline?: string | null;
  source_date_text?: string | null;
}

export interface SurveyLinkRow {
  id: string;
  canonical_url: string;
  original_url: string;
  platform: CollectorPlatform;
  title: string | null;
  status: CollectorSurveyStatus;
  freshness?: SurveyLinkFreshness | null;
  first_discovered_at: string;
  last_discovered_at: string;
  discovery_count: number;
  created_at: string;
  updated_at: string;
}

export interface SurveySourceRow {
  id: string;
  survey_link_id: string;
  source_type: CollectorSourceType;
  source_url: string;
  source_title: string | null;
  search_query: string | null;
  source_published_at: string | null;
  discovered_at: string;
  created_at: string;
  source_page_url?: string | null;
  source_page_title?: string | null;
  source_anchor_text?: string | null;
  source_context_excerpt?: string | null;
  source_organization_name?: string | null;
  source_institution_homepage?: string | null;
  source_posted_date?: string | null;
  source_period_start?: string | null;
  source_period_end?: string | null;
  source_deadline?: string | null;
  source_date_text?: string | null;
}

export interface CollectionRunRow {
  id: string;
  trigger: CollectionRunTrigger;
  started_at: string;
  completed_at: string | null;
  status: CollectionRunStatus;
  queries_count: number;
  results_count: number;
  candidate_links_count: number;
  new_surveys_count: number;
  duplicate_surveys_count: number;
  error_count: number;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectorSearchHit {
  title: string;
  description: string;
  link: string;
  sourceType: CollectorSourceType;
  searchQuery: string;
  publishedAt?: string | null;
}

export interface CollectionRunStats {
  queriesCount: number;
  resultsCount: number;
  candidateLinksCount: number;
  newSurveysCount: number;
  duplicateSurveysCount: number;
  errorCount: number;
  errors: string[];
  apiCalls?: number;
  skippedKnownSources?: number;
  formatRejectedCount?: number;
  pageRejectedCount?: number;
  invalidSavedCount?: number;
  verifiedSavedCount?: number;
  unreachableCount?: number;
  closedCount?: number;
  restrictedCount?: number;
  /** In-memory per-query rows for this run (also upserted to DB when migration 006 applied). */
  queryStats?: CollectionQueryStatInput[];
}

export interface CollectionQueryStatInput {
  collectionRunId: string;
  searchQuery: string;
  sourceType: CollectorSourceType;
  sortMode: "sim" | "date";
  resultsCount: number;
  uniqueSourceCount: number;
  candidateCount: number;
  validSurveyCount: number;
  newSurveyCount: number;
  duplicateSurveyCount: number;
  invalidCount: number;
  unreachableCount: number;
  closedCount: number;
  restrictedCount: number;
  skippedKnownSourceCount: number;
  errorCount: number;
}

export interface CollectionQueryStatRow extends CollectionQueryStatInput {
  id: string;
  created_at: string;
}

export type QueryPerformanceTier = "keep" | "improve" | "stop_review";

export interface QueryPerformanceRow {
  searchQuery: string;
  resultsCount: number;
  candidateCount: number;
  validSurveyCount: number;
  newSurveyCount: number;
  duplicateSurveyCount: number;
  invalidCount: number;
  unreachableCount: number;
  errorCount: number;
  skippedKnownSourceCount: number;
  candidateConversionRate: number;
  newSurveyConversionRate: number;
  tier: QueryPerformanceTier;
}

export interface CollectorVerificationMetrics {
  totalLinks: number;
  /** active + closed + restricted + invalid */
  verificationCompleted: number;
  /** discovered */
  unverifiedDiscovered: number;
  /** unreachable — retry needed */
  retryUnreachable: number;
  ignored: number;
  /** completed / (total - ignored) */
  verificationCompletionRate: number;
  /** (active+closed+restricted) / completed */
  confirmedSurveyRate: number;
  /** invalid / completed */
  invalidRate: number;
  /**
   * Accuracy (platform/status) is computed only on verification-completed rows
   * (discovered + unreachable excluded).
   */
  accuracySampleNote: string;
}

/** Monitoring-oriented split so closed links don't inflate "valid collection". */
export interface CollectorMonitoringBreakdown {
  /** All discovered/stored links (including closed/restricted). */
  totalDiscovered: number;
  /** status=active — live response candidates. */
  validActive: number;
  /** status=discovered — not yet verified. */
  unverified: number;
  closed: number;
  restricted: number;
  stale: number;
  unreachable: number;
  invalid: number;
  ignored: number;
  /** Active links eligible for auto diagnosis selection. */
  diagnosisEligibleActive: number;
}

export interface CollectorSummary {
  totalSurveys: number;
  /** All survey_links rows including invalid/ignored (for consistency checks). */
  totalLinksAll: number;
  todayNew: number;
  last7DaysNew: number;
  byPlatform: Record<CollectorPlatform, number>;
  /** Platform counts using the same filter as totalLinksAll (all statuses). */
  byPlatformAll: Record<CollectorPlatform, number>;
  byStatus: Partial<Record<CollectorSurveyStatus, number>>;
  /** Confirmed surveys only (active+closed+restricted). Unreachable excluded. */
  verifiedSurveys: number;
  unreachableSurveys: number;
  monitoring: CollectorMonitoringBreakdown;
  verification: CollectorVerificationMetrics;
  lastRun: CollectionRunRow | null;
  lastRunApiCalls: number;
  lastRunHasQueryStats: boolean;
  lastRunQueryStats: CollectionQueryStatRow[];
  lastRunQueryPerformance: QueryPerformanceRow[];
  topQueries: QueryPerformanceRow[];
  bottomQueries: QueryPerformanceRow[];
  lastRunCandidateConversionRate: number;
  lastRunNewSurveyConversionRate: number;
  diagnosis?: {
    queued: number;
    running: number;
    completed: number;
    limited: number;
    /** failed_retryable + failed_final */
    failed: number;
    skipped: number;
    skippedClosed?: number;
    skippedRestricted?: number;
    timeout?: number;
    /** KST-day auto-diagnosis ops (survey_diagnosis_links only). */
    today?: {
      kstDate: string;
      attempted: number;
      queued: number;
      running: number;
      completed: number;
      limited: number;
      skipped: number;
      skippedClosed: number;
      skippedRestricted: number;
      failed: number;
      timeout: number;
      dailyMax: number;
      remaining: number;
    };
  };
  /**
   * KST-day automation funnel. Stage populations differ (search hits ≠ new URLs ≠
   * validations ≠ diagnosis outcomes); treat each field as its own cohort.
   */
  todayFunnel?: {
    searchResults: number;
    newUrls: number;
    /** Proxy: candidate_count (or valid) from today's query stats / runs. */
    validations: number;
    /** Links becoming active today (updated_at today + status active), best-effort. */
    activeTransitions: number;
    /** Best-effort A_PRIORITY among recent actives; 0 if skipped as too expensive. */
    newAPriorityApprox: number;
    discoveredBacklog: number;
    /**
     * Undiagnosed eligible approx: up to 400 recent actives without blocking
     * linkage (not a full-table scan).
     */
    diagnosisBacklog: number;
    diagnosisAttempted: number;
    /** completed today */
    normalDiagnosis: number;
    closedToday: number;
    restrictedToday: number;
    extractionLimitedToday: number;
    systemFailureToday: number;
    diagnosisRemaining: number;
  };
  qualityKpis?: {
    stuckCollectionRuns: number;
    stuckScanJobs: number;
    /** 0–1; closed/restricted are NOT counted as system failure. */
    systemFailureRateToday: number;
    extractionLimitedToday: number;
    diagnosisBacklog: number;
    discoveredBacklog: number;
    dailyDiagnosisCapacity: number;
    dailyDiagnosisRemaining: number;
  };
  /**
   * Raw discovered vs collect confirmed vs auto-diagnosis coverage.
   * collect_confirmed maps to status=active after freshness/availability/officiality.
   */
  opsFunnel?: {
    rawDiscovered: number;
    collectCandidate: number;
    collectConfirmed: number;
    diagnosisQueued: number;
    diagnosisCompleted: number;
    diagnosisMissing: number;
    screenedStale: number;
    screenedClosed: number;
    screenedPersonal: number;
    screenedRestricted: number;
    improvementCandidateCount: number;
    collectConfirmedRate: number;
    diagnosisCoverageRate: number;
    diagnosisMissingRate: number;
    screenedRate: number;
    closedOrStaleRate: number;
    improvementCandidateRate: number;
    missingWarning: boolean;
    sampleSize: number;
    dailyLimit: number;
    batchSize: number;
    maxBacklogDays: number;
  };
  officialSite?: {
    institutionCount: number;
    crawledToday: number;
    surveysFoundToday: number;
    todayRecentEligible: number;
    todayOldYearExcluded: number;
    todayDateUnknownHold: number;
    todayRestrictedExcluded: number;
    todayDiagnosisQueued: number;
    /** @deprecated use todayRecentEligible */
    recentEligible: number;
    /** @deprecated use todayOldYearExcluded */
    oldYearExcluded: number;
    /** @deprecated use todayDateUnknownHold */
    dateUnknownHold: number;
    /** @deprecated use todayDiagnosisQueued */
    diagnosisQueued: number;
    totalSurveysFound: number;
    totalRecentEligible: number;
    totalOldYearExcluded: number;
    totalDateUnknownHold: number;
    totalRestrictedExcluded: number;
    needsReviewCount: number;
    needsReviewSamples?: Array<{
      organizationName: string;
      homepageUrl: string;
      reason: string | null;
      rejectedSeedUrls?: string[];
      status?: string;
    }>;
    excludedSeedCount?: number;
    rejectedSeedRowCount?: number;
    rejectedSeedUrlCount?: number;
    todayPagesFetched?: number;
    todayOrgsWithSurveys?: number;
    avgPagesPerOrg?: number;
    surveyDiscoveryRate?: number;
    crawlSuccessRate?: number;
    dateExtractSuccessRate?: number;
    postedDateExtractRate?: number;
    periodExtractRate?: number;
    dateUnknownHoldRatio?: number;
    sourcePageUrlSaveRate?: number;
    failedOrgCount?: number;
    sourceEvidenceSchemaMissing?: boolean;
    orgsPerRun?: number;
    wavesPerDay?: number;
    orgsPerDayTarget?: number;
  };
  sourceComparison?: {
    todayNaverSurveys: number;
    todayOfficialSurveys: number;
    todayRecentEligible: number;
    todayDiagnosisQueued: number;
    improvementCandidates: number;
  };
  capacity?: {
    completedToday: number;
    attemptedToday: number;
    completedRate: number;
    dailyCompletedTarget: number;
    progressVsTarget: number;
    scanBatch: number;
    workerRunsPerDay: number;
    estimatedMaxPerDay: number;
    officialSiteOrgsPerRun: number;
    officialSiteWavesPerDay: number;
    officialSiteOrgsPerDayTarget: number;
    officialSiteCrawledToday: number;
    officialSiteEligibleToday: number;
    timeoutToday: number;
    pendingCount: number;
    queuedCount: number;
    failedToday: number;
    remainingDailyLimit: number;
    scanBatchIncreaseHint: boolean;
  };
  improvementCandidates?: Array<{
    id: string;
    operatorName: string | null;
    surveyTitle: string | null;
    surveyUrl: string | null;
    platform: string | null;
    publicPrivateType: string | null;
    hasPersonalInfo: boolean;
    hasSensitiveInfo: boolean;
    hasHighRiskInfo: boolean;
    gapLabels: string[];
    riskLevel: string | null;
    score: number | null;
    hasEvidence: boolean;
    reviewStatus: string | null;
    priority: number;
    wording: string;
  }>;
}

export interface SurveyLinkListItem extends SurveyLinkRow {
  source_count: number;
  sample_source_url: string | null;
  sample_source_title: string | null;
  /** Live triage queue from sources (A/B/C). C is not permanent. */
  triage_queue?: "A_PRIORITY" | "B_PRIORITY" | "C_ARCHIVE" | null;
  /** Auto-diagnosis linkage (survey_diagnosis_links), if any. */
  diagnosis_status?:
    | "queued"
    | "running"
    | "completed"
    | "limited"
    | "failed_retryable"
    | "failed_final"
    | "failed"
    | "skipped"
    | "skipped_closed"
    | "skipped_restricted"
    | "timeout"
    | "undiagnosed"
    | null;
  diagnosis_job_id?: string | null;
  diagnosis_score?: number | null;
  diagnosis_grade?: string | null;
  diagnosis_completed_at?: string | null;
  diagnosis_extractor?: string | null;
  diagnosis_limited_reason?: string | null;
  collect_lane?: string | null;
  auto_diagnosis_target?: boolean;
}

export interface SurveyLinkListFilters {
  platform?: CollectorPlatform | "all";
  /** default = active+discovered; all = every status; or a specific status */
  status?: CollectorSurveyStatus | "all" | "default" | "non_invalid";
  firstDiscoveredFrom?: string;
  firstDiscoveredTo?: string;
  searchQuery?: string;
  novelty?: "all" | "new" | "existing";
  sourceType?: CollectorSourceType | "all" | "naver";
  holdReason?:
    | "all"
    | "date_unknown"
    | "old_year"
    | "closed"
    | "restricted"
    | "personal"
    | "invalid"
    | "eligible";
  quickView?: string;
  /** Live triage queue from sources (A/B/C). C is not permanent. */
  triageQueue?: "A_PRIORITY" | "B_PRIORITY" | "C_ARCHIVE" | "all";
  diagnosisStatus?:
    | "all"
    | "undiagnosed"
    | "queued"
    | "running"
    | "completed"
    | "limited"
    | "failed"
    | "failed_retryable"
    | "failed_final";
  q?: string;
  limit?: number;
}

export interface UpsertSurveyResult {
  link: SurveyLinkRow;
  isNew: boolean;
}
