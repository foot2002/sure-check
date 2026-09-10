import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import {
  collectorFiltersFromSearchParams,
  listSurveyLinks,
} from "@/lib/collector/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdminSessionFromCookies())) {
    return unauthorizedJson();
  }

  try {
    const params = new URL(request.url).searchParams;
    const filters = collectorFiltersFromSearchParams(params);

    const result = await listSurveyLinks(filters);
    return NextResponse.json(
      {
        ok: true,
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
        limit: result.limit,
        offset: result.offset,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("[api/report/admin/collector/surveys]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "수집 설문 목록을 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
