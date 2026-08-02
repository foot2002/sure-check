import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { getAdminCaseDetail } from "@/lib/report/adminCaseDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const detail = await getAdminCaseDetail(id);
    return NextResponse.json(detail, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    const status =
      error instanceof Error && (error as Error & { status?: number }).status
        ? (error as Error & { status: number }).status
        : 500;
    if (status === 404) {
      return NextResponse.json({ error: "케이스를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[admin-case-detail]", error);
    return NextResponse.json(
      { error: "케이스 상세를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
