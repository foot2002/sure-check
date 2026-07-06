import type { ScanJob, ScanReport } from "@/lib/types/scan";

type MockStoreGlobal = {
  __sureCheckJobs?: Map<string, ScanJob>;
  __sureCheckReports?: Map<string, ScanReport>;
};

const globalStore = globalThis as typeof globalThis & MockStoreGlobal;

const jobs =
  globalStore.__sureCheckJobs ?? new Map<string, ScanJob>();
const reports =
  globalStore.__sureCheckReports ?? new Map<string, ScanReport>();

if (!globalStore.__sureCheckJobs) globalStore.__sureCheckJobs = jobs;
if (!globalStore.__sureCheckReports) globalStore.__sureCheckReports = reports;

export const mockStore = {
  saveJob(job: ScanJob): void {
    jobs.set(job.scanId, job);
  },

  getJob(scanId: string): ScanJob | null {
    return jobs.get(scanId) ?? null;
  },

  updateJob(scanId: string, updates: Partial<ScanJob>): ScanJob | null {
    const job = jobs.get(scanId);
    if (!job) return null;
    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
    jobs.set(scanId, updated);
    return updated;
  },

  saveReport(report: ScanReport): void {
    reports.set(report.scanId, report);
  },

  getReport(scanId: string): ScanReport | null {
    return reports.get(scanId) ?? null;
  },
};
