import type { ScanRepository } from "@/lib/repositories/ScanRepository";
import type {
  CreateScanJobInput,
  ScanJob,
  ScanReport,
  ScanStatus,
} from "@/lib/types/scan";
import { SCAN_PROGRESS_STEPS } from "@/lib/types/scan";
import {
  getFixtureByUrl,
  isFixtureUrl,
  resolveFixtureKey,
} from "@/lib/fixtures/normalizedForms";
import { isGoogleFormsUrl } from "@/lib/extractors/googleFormsTypes";
import { isNaverFormsUrl } from "@/lib/extractors/naverFormsTypes";
import { mockStore } from "@/lib/mock/mockStore";

function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createPendingScanId(): string {
  return generateScanId();
}

export class MockScanRepository implements ScanRepository {
  /**
   * Create a pending in-memory job only. Actual diagnosis runs via processScanJob.
   */
  async createScanJob(input: CreateScanJobInput): Promise<ScanJob> {
    const scanId = generateScanId();
    const fixture = isFixtureUrl(input.formUrl);
    const mockKey = fixture
      ? resolveFixtureKey(input.formUrl)
      : ("generic_unknown_warning" as const);
    const platform = fixture
      ? getFixtureByUrl(input.formUrl).platform
      : isGoogleFormsUrl(input.formUrl)
        ? "google_forms"
        : isNaverFormsUrl(input.formUrl)
          ? "naver_forms"
          : "generic";
    const now = new Date().toISOString();

    const job: ScanJob = {
      scanId,
      status: "pending",
      formUrl: input.formUrl,
      platform,
      mockKey,
      currentStep: 0,
      totalSteps: SCAN_PROGRESS_STEPS.length,
      stepLabel: SCAN_PROGRESS_STEPS[0],
      createdAt: now,
      updatedAt: now,
    };

    mockStore.saveJob(job);
    return job;
  }

  async getScanJob(scanId: string): Promise<ScanJob | null> {
    return mockStore.getJob(scanId);
  }

  async updateScanJobStatus(scanId: string, status: ScanStatus): Promise<void> {
    mockStore.updateJob(scanId, { status });
  }

  async saveReport(report: ScanReport): Promise<void> {
    mockStore.saveReport(report);
  }

  async getReport(scanId: string): Promise<ScanReport | null> {
    return mockStore.getReport(scanId);
  }
}

type RepoGlobal = { __sureCheckRepo?: MockScanRepository };
const repoGlobal = globalThis as typeof globalThis & RepoGlobal;

export function getScanRepository(): ScanRepository {
  if (!repoGlobal.__sureCheckRepo) {
    repoGlobal.__sureCheckRepo = new MockScanRepository();
  }
  return repoGlobal.__sureCheckRepo;
}
