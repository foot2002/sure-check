import { NextResponse } from "next/server";
import { listPublishedWeeklyCards } from "@/lib/weekly/repository";
import { checkWeeklySnapshotSafe } from "@/lib/weekly/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET() {
  try {
    const cards = await listPublishedWeeklyCards();
    const body = { reports: cards };
    const safety = checkWeeklySnapshotSafe(body);
    if (!safety.ok) {
      console.error("[public-weekly]", safety.violations);
      return NextResponse.json(
        { error: "공개 가능한 주간 리포트가 아닙니다." },
        { status: 500, headers: NO_STORE },
      );
    }
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("[public-weekly]", error);
    return NextResponse.json(
      { error: "주간 리포트를 불러오지 못했습니다." },
      { status: 500, headers: NO_STORE },
    );
  }
}
