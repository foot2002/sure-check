import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { listSurveyLinks } from "@/lib/collector/queries";
import type {
  CollectorPlatform,
  CollectorSourceType,
  SurveyLinkListFilters,
} from "@/lib/collector/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pick(
  params: URLSearchParams,
  key: string,
): string | undefined {
  const value = params.get(key);
  return value?.trim() || undefined;
}

export async function GET(request: Request) {
  if (!(await getAdminSessionFromCookies())) {
    return unauthorizedJson();
  }

  try {
    const params = new URL(request.url).searchParams;
    const filters: SurveyLinkListFilters = {
      platform: (pick(params, "platform") as CollectorPlatform | "all") || "all",
      firstDiscoveredFrom: pick(params, "firstDiscoveredFrom"),
      firstDiscoveredTo: pick(params, "firstDiscoveredTo"),
      searchQuery: pick(params, "searchQuery"),
      novelty: (pick(params, "novelty") as "all" | "new" | "existing") || "all",
      sourceType:
        (pick(params, "sourceType") as CollectorSourceType | "all") || "all",
      triageQueue:
        (pick(params, "triageQueue") as
          | "A_PRIORITY"
          | "B_PRIORITY"
          | "C_ARCHIVE"
          | "all") || "all",
      q: pick(params, "q"),
      limit: Number(pick(params, "limit") || 100) || 100,
    };

    const items = await listSurveyLinks(filters);
    return NextResponse.json(
      { ok: true, items },
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
