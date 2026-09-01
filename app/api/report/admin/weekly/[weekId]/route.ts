import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { updateWeeklyReportStatus } from "@/lib/weekly/repository";
import type { WeeklyReportStatus } from "@/lib/weekly/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ weekId: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();
  try {
    const { weekId } = await context.params;
    const body = (await request.json()) as { status?: WeeklyReportStatus };
    if (!body.status || !["draft", "published", "archived"].includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const row = await updateWeeklyReportStatus(weekId, body.status);
    return NextResponse.json({ weekId: row.weekId, status: row.status });
  } catch (error) {
    console.error("[admin-weekly-status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "변경 실패" },
      { status: 500 },
    );
  }
}
