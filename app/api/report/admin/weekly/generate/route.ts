import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import {
  generateRecentWeeklySnapshots,
  generateWeekSnapshot,
} from "@/lib/weekly/generateWeeklyReport";
import { upsertWeeklyReport } from "@/lib/weekly/repository";
import type { WeeklyReportStatus } from "@/lib/weekly/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();
  try {
    const body = (await request.json().catch(() => ({}))) as {
      weeks?: number;
      weekId?: string;
      publish?: boolean;
    };
    const status: WeeklyReportStatus = body.publish ? "published" : "draft";
    if (body.weekId) {
      const snapshot = await generateWeekSnapshot(body.weekId);
      const row = await upsertWeeklyReport({ snapshot, status });
      return NextResponse.json({ count: 1, weekIds: [row.weekId] });
    }
    const weeks = Math.min(8, Math.max(1, Number(body.weeks) || 6));
    const snapshots = await generateRecentWeeklySnapshots(weeks);
    const saved = [];
    for (const snapshot of snapshots) {
      saved.push(await upsertWeeklyReport({ snapshot, status }));
    }
    return NextResponse.json({
      count: saved.length,
      weekIds: saved.map((row) => row.weekId),
    });
  } catch (error) {
    console.error("[admin-weekly-generate]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 500 },
    );
  }
}
