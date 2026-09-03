import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { listAdminCases, AdminRangeError, adminCaseListQueryFromSearchParams } from "@/lib/report/adminCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { searchParams } = new URL(request.url);
    const payload = await listAdminCases(
      adminCaseListQueryFromSearchParams(searchParams),
    );
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof AdminRangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin-cases]", error);
    return NextResponse.json(
      { error: "검토 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
