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
    scanTimeoutSeconds: readInt("SCAN_JOB_TIMEOUT_SECONDS", 60),
    captureTimeoutSeconds: readInt("CAPTURE_JOB_TIMEOUT_SECONDS", 180),
    scanCacheTtlSeconds: readInt("SCAN_CACHE_TTL_SECONDS", 3600),
    staleScanSeconds: readInt("SCAN_JOB_STALE_SECONDS", 120),
    staleCaptureSeconds: readInt("CAPTURE_JOB_STALE_SECONDS", 240),
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
