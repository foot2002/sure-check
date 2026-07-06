import type {
  CreateScanJobInput,
  ScanJob,
  ScanReport,
  ScanStatus,
} from "@/lib/types/scan";

export interface ScanRepository {
  createScanJob(input: CreateScanJobInput): Promise<ScanJob>;
  getScanJob(scanId: string): Promise<ScanJob | null>;
  updateScanJobStatus(scanId: string, status: ScanStatus): Promise<void>;
  saveReport(report: ScanReport): Promise<void>;
  getReport(scanId: string): Promise<ScanReport | null>;
}
