import { NextResponse } from "next/server";
import { isMonitoringConfigured } from "@/lib/jobs/config";
import { getReportJsonByExternalScanId } from "@/lib/jobs/scanJobQueue";
import { getScanRepository } from "@/lib/repositories/MockScanRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const repository = getScanRepository();
    let report = await repository.getReport(scanId);

    if (!report && isMonitoringConfigured()) {
      try {
        report = await getReportJsonByExternalScanId(scanId);
        if (report) await repository.saveReport(report);
      } catch (err) {
        console.warn("[scan/report] db hydrate failed:", err);
      }
    }

    if (!report) {
      const job = await repository.getScanJob(scanId);
      if (!job && isMonitoringConfigured()) {
        // Job may exist only in DB
        const { getScanJobByExternalId } = await import(
          "@/lib/jobs/scanJobQueue"
        );
        const dbJob = await getScanJobByExternalId(scanId);
        if (!dbJob) {
          return NextResponse.json(
            { error: "진단 작업을 찾을 수 없습니다." },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { error: "리포트가 아직 준비되지 않았습니다.", status: dbJob.status },
          { status: 202 },
        );
      }
      if (!job) {
        return NextResponse.json(
          { error: "진단 작업을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "리포트가 아직 준비되지 않았습니다.", status: job.status },
        { status: 202 },
      );
    }

    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: "리포트 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
