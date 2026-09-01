import { NextResponse } from "next/server";
import { getPublishedWeeklyReport } from "@/lib/weekly/repository";
import { assertWeeklySnapshotSafe } from "@/lib/weekly/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ weekId: string }> },
) {
  try {
    const { weekId } = await context.params;
    const row = await getPublishedWeeklyReport(weekId);
    if (!row) {
      return NextResponse.json(
        { error: "공개된 주간 리포트가 아닙니다." },
        { status: 404, headers: NO_STORE },
      );
    }
    assertWeeklySnapshotSafe(row.snapshot);
    return NextResponse.json(
      {
        weekId: row.weekId,
        weekLabel: row.weekLabel,
        status: row.status,
        snapshot: row.snapshot,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[public-weekly-detail]", error);
    return NextResponse.json(
      { error: "주간 리포트를 불러오지 못했습니다." },
      { status: 500, headers: NO_STORE },
    );
  }
}
