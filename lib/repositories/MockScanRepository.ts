import type { ScanRepository } from "@/lib/repositories/ScanRepository";
import type {
  CreateScanJobInput,
  ScanJob,
  ScanReport,
  ScanStatus,
} from "@/lib/types/scan";
import { SCAN_STEPS } from "@/lib/types/scan";
import {
  getFixtureByUrl,
  isFixtureUrl,
  resolveFixtureKey,
} from "@/lib/fixtures/normalizedForms";
import { isGoogleFormsUrl } from "@/lib/extractors/googleFormsTypes";
import { isNaverFormsUrl } from "@/lib/extractors/naverFormsTypes";
import { mockStore } from "@/lib/mock/mockStore";
import { resolveScanReport } from "@/lib/scan/resolveScanReport";

function generateScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Run diagnosis in the same request as createScanJob.
 *
 * Previously: fire-and-forget + ~5.6s fake step delays. On Vercel that was both
 * slow and unreliable (work could stop after the response; other isolates
 * could not see in-memory jobs/reports).
 */
async function runScanToCompletion(scanId: string): Promise<void> {
  mockStore.updateJob(scanId, {
    status: "running",
    currentStep: 1,
    stepLabel: SCAN_STEPS[0],
  });

  const job = mockStore.getJob(scanId);
  if (!job) return;

  // Advance step labels without artificial delays while extraction runs.
  mockStore.updateJob(scanId, {
    currentStep: 2,
    stepLabel: SCAN_STEPS[1],
  });

  try {
    mockStore.updateJob(scanId, {
      currentStep: 3,
      stepLabel: SCAN_STEPS[2],
    });
    const { report, jobStatus } = await resolveScanReport(scanId, job.formUrl);
    mockStore.saveReport(report);
    mockStore.updateJob(scanId, {
      status: jobStatus,
      currentStep: SCAN_STEPS.length,
      stepLabel: SCAN_STEPS[SCAN_STEPS.length - 1],
      errorMessage:
        jobStatus === "failed" || jobStatus === "limited"
          ? report.summary
          : undefined,
    });
  } catch {
    mockStore.updateJob(scanId, {
      status: "failed",
      errorMessage: "진단 중 오류가 발생했습니다.",
    });
  }
}

export class MockScanRepository implements ScanRepository {
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
      totalSteps: SCAN_STEPS.length,
      stepLabel: "진단 준비 중...",
      createdAt: now,
      updatedAt: now,
    };

    mockStore.saveJob(job);
    await runScanToCompletion(scanId);
    return mockStore.getJob(scanId) ?? job;
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
