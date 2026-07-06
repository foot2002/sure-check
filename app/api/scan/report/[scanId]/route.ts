import { NextResponse } from "next/server";
import { getScanRepository } from "@/lib/repositories/MockScanRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const repository = getScanRepository();
    const report = await repository.getReport(scanId);

    if (!report) {
      const job = await repository.getScanJob(scanId);
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
