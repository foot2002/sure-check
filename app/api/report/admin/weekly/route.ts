import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { listWeeklyReports } from "@/lib/weekly/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();
  try {
    const rows = await listWeeklyReports({ status: "all" });
    return NextResponse.json({
      reports: rows.map((row) => ({
        weekId: row.weekId,
        weekLabel: row.weekLabel,
        status: row.status,
        generatedAt: row.generatedAt,
        analyzableCount: row.snapshot.metrics.analyzableCount,
        avgScore: row.snapshot.metrics.avgScore,
      })),
    });
  } catch (error) {
    console.error("[admin-weekly-list]", error);
    return NextResponse.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
