import type { ScanReport } from "@/lib/types/scan";

export interface UrlCacheEntry {
  report: ScanReport;
  expiresAt: number;
}

export interface UrlCacheRepository {
  get(urlHash: string): ScanReport | null;
  set(urlHash: string, report: ScanReport, ttlMs: number): void;
  delete(urlHash: string): void;
  clearAll(): void;
}

type CacheGlobal = { __sureCheckUrlCache?: Map<string, UrlCacheEntry> };
const globalCache = globalThis as typeof globalThis & CacheGlobal;

const store =
  globalCache.__sureCheckUrlCache ?? new Map<string, UrlCacheEntry>();
if (!globalCache.__sureCheckUrlCache) {
  globalCache.__sureCheckUrlCache = store;
}

export const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;

export class InMemoryUrlCache implements UrlCacheRepository {
  get(urlHash: string): ScanReport | null {
    const entry = store.get(urlHash);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(urlHash);
      return null;
    }
    return entry.report;
  }

  set(urlHash: string, report: ScanReport, ttlMs: number): void {
    store.set(urlHash, {
      report,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(urlHash: string): void {
    store.delete(urlHash);
  }

  clearAll(): void {
    store.clear();
  }
}

let cacheInstance: InMemoryUrlCache | null = null;

export function getUrlCache(): UrlCacheRepository {
  if (!cacheInstance) {
    cacheInstance = new InMemoryUrlCache();
  }
  return cacheInstance;
}

export function cloneReportForScan(
  cached: ScanReport,
  scanId: string,
  formUrl: string,
): ScanReport {
  const now = new Date().toISOString();
  return {
    ...cached,
    scanId,
    formUrl,
    form: { ...cached.form, url: formUrl },
    createdAt: now,
    completedAt: now,
  };
}
