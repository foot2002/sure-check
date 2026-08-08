function readInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getJobWorkerConfig() {
  return {
    scanConcurrency: readInt("SCAN_WORKER_CONCURRENCY", 3),
    captureConcurrency: readInt("CAPTURE_WORKER_CONCURRENCY", 1),
    // Headroom for platform parse + optional extract-only browser fallback
    // (browser ≤~30s) while staying under Vercel scan route maxDuration=120s.
    scanTimeoutSeconds: readInt("SCAN_JOB_TIMEOUT_SECONDS", 90),
    captureTimeoutSeconds: readInt("CAPTURE_JOB_TIMEOUT_SECONDS", 180),
    browserExtractTimeoutSeconds: readInt(
      "BROWSER_EXTRACT_TIMEOUT_SECONDS",
      30,
    ),
    scanCacheTtlSeconds: readInt("SCAN_CACHE_TTL_SECONDS", 3600),
    staleScanSeconds: readInt("SCAN_JOB_STALE_SECONDS", 180),
    staleCaptureSeconds: readInt("CAPTURE_JOB_STALE_SECONDS", 240),
    /** Status-poll stale threshold for running scan jobs (default 150s). */
    scanStatusStaleSeconds: readInt("SCAN_STATUS_STALE_SECONDS", 150),
    /** Status-poll stale threshold for running capture jobs (default 240s). */
    captureStatusStaleSeconds: readInt("CAPTURE_STATUS_STALE_SECONDS", 240),
    /** Client UI hard stop for scan polling (default 120s). */
    scanClientHardTimeoutMs: readInt("SCAN_CLIENT_HARD_TIMEOUT_MS", 120_000),
    scanRateLimitPerIpPerMinute: readInt(
      "SCAN_RATE_LIMIT_PER_IP_PER_MINUTE",
      20,
    ),
    maxPendingJobsPerIp: readInt("MAX_PENDING_JOBS_PER_IP", 5),
  };
}

export function getInternalWorkerToken(): string | null {
  const token = process.env.INTERNAL_WORKER_TOKEN?.trim();
  return token || null;
}

export function isMonitoringConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}
