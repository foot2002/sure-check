import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { listSourcesForSurveyLink } from "@/lib/collector/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) {
    return unauthorizedJson();
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });
  }

  try {
    const sources = await listSourcesForSurveyLink(id);
    return NextResponse.json(
      { ok: true, sources },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("[api/report/admin/collector/surveys/sources]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "출처 목록을 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
