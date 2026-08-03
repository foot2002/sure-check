import { getJobWorkerConfig } from "@/lib/jobs/config";

type Bucket = {
  /** Sliding window of request times (per-minute rate). */
  timestamps: number[];
  /** Open in-flight starts; auto-expire if terminal callback is missed. */
  pendingStartedAt: number[];
};

type RateGlobal = { __sureCheckScanRateLimit?: Map<string, Bucket> };
const g = globalThis as typeof globalThis & RateGlobal;
const store = g.__sureCheckScanRateLimit ?? new Map<string, Bucket>();
if (!g.__sureCheckScanRateLimit) g.__sureCheckScanRateLimit = store;

function getBucket(ip: string): Bucket {
  let bucket = store.get(ip);
  if (!bucket) {
    bucket = { timestamps: [], pendingStartedAt: [] };
    store.set(ip, bucket);
  }
  // Migrate old shape from earlier deploys (pending: number).
  const legacy = bucket as Bucket & { pending?: number };
  if (!Array.isArray(legacy.pendingStartedAt)) {
    legacy.pendingStartedAt = [];
    delete legacy.pending;
  }
  return bucket;
}

function pruneBucket(bucket: Bucket, now: number): void {
  const config = getJobWorkerConfig();
  const windowMs = 60_000;
  const pendingTtlMs =
    Math.max(config.scanTimeoutSeconds, config.scanStatusStaleSeconds, 120) *
      1000 +
    30_000;

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  bucket.pendingStartedAt = bucket.pendingStartedAt.filter(
    (t) => now - t < pendingTtlMs,
  );
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function checkScanRateLimit(ip: string): {
  allowed: boolean;
  reason?: string;
} {
  const config = getJobWorkerConfig();
  const now = Date.now();
  const bucket = getBucket(ip);
  pruneBucket(bucket, now);

  if (bucket.timestamps.length >= config.scanRateLimitPerIpPerMinute) {
    return {
      allowed: false,
      reason: "현재 진단 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (bucket.pendingStartedAt.length >= config.maxPendingJobsPerIp) {
    return {
      allowed: false,
      reason: "진행 중인 진단이 있어 잠시 후 다시 시도해 주세요.",
    };
  }

  return { allowed: true };
}

export function recordScanStart(ip: string): void {
  const now = Date.now();
  const bucket = getBucket(ip);
  pruneBucket(bucket, now);
  bucket.timestamps.push(now);
  bucket.pendingStartedAt.push(now);
}

export function recordScanTerminal(ip: string): void {
  const bucket = getBucket(ip);
  pruneBucket(bucket, Date.now());
  if (bucket.pendingStartedAt.length > 0) {
    bucket.pendingStartedAt.shift();
  }
}

/** Clear leaked counters for an IP (warm instance / missed terminals). */
export function resetScanRateLimit(ip?: string): void {
  if (!ip) {
    store.clear();
    return;
  }
  store.delete(ip);
}
