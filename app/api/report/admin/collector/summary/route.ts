import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { getCollectorSummary } from "@/lib/collector/queries";
import { isCollectorStorageConfigured } from "@/lib/collector/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSessionFromCookies())) {
    return unauthorizedJson();
  }
  if (!isCollectorStorageConfigured()) {
    return NextResponse.json(
      { ok: false, error: "수집 저장소가 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  try {
    const summary = await getCollectorSummary();
    return NextResponse.json(
      { ok: true, summary },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    console.error("[api/report/admin/collector/summary]", error);
    return NextResponse.json(
      { ok: false, error: "수집 통계를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
