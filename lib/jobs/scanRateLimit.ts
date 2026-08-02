import { getJobWorkerConfig } from "@/lib/jobs/config";

type Bucket = { timestamps: number[]; pending: number };

type RateGlobal = { __sureCheckScanRateLimit?: Map<string, Bucket> };
const g = globalThis as typeof globalThis & RateGlobal;
const store = g.__sureCheckScanRateLimit ?? new Map<string, Bucket>();
if (!g.__sureCheckScanRateLimit) g.__sureCheckScanRateLimit = store;

function getBucket(ip: string): Bucket {
  let bucket = store.get(ip);
  if (!bucket) {
    bucket = { timestamps: [], pending: 0 };
    store.set(ip, bucket);
  }
  return bucket;
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
  const windowMs = 60_000;
  const bucket = getBucket(ip);
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= config.scanRateLimitPerIpPerMinute) {
    return {
      allowed: false,
      reason: "현재 진단 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (bucket.pending >= config.maxPendingJobsPerIp) {
    return {
      allowed: false,
      reason: "현재 진단 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return { allowed: true };
}

export function recordScanStart(ip: string): void {
  const bucket = getBucket(ip);
  bucket.timestamps.push(Date.now());
  bucket.pending += 1;
}

export function recordScanTerminal(ip: string): void {
  const bucket = getBucket(ip);
  bucket.pending = Math.max(0, bucket.pending - 1);
}
