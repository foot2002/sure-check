import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import {
  COLLECTOR_LIST_PAGE_SIZE,
  listSurveyLinks,
} from "@/lib/collector/queries";
import type {
  CollectorPlatform,
  CollectorSourceType,
  CollectorSurveyStatus,
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
      status:
        (pick(params, "status") as
          | CollectorSurveyStatus
          | "all"
          | "default"
          | "non_invalid") || "default",
      firstDiscoveredFrom: pick(params, "firstDiscoveredFrom"),
      firstDiscoveredTo: pick(params, "firstDiscoveredTo"),
      searchQuery: pick(params, "searchQuery"),
      novelty: (pick(params, "novelty") as "all" | "new" | "existing") || "all",
      sourceType:
        (pick(params, "sourceType") as CollectorSourceType | "all" | "naver") ||
        "all",
      holdReason:
        (pick(params, "holdReason") as SurveyLinkListFilters["holdReason"]) ||
        "all",
      triageQueue:
        (pick(params, "triageQueue") as
          | "A_PRIORITY"
          | "B_PRIORITY"
          | "C_ARCHIVE"
          | "all") || "all",
      diagnosisStatus:
        (pick(params, "diagnosisStatus") as SurveyLinkListFilters["diagnosisStatus"]) ||
        "all",
      q: pick(params, "q"),
      limit: Number(pick(params, "limit") || COLLECTOR_LIST_PAGE_SIZE) || COLLECTOR_LIST_PAGE_SIZE,
      ...(pick(params, "offset")
        ? { offset: Number(pick(params, "offset")) }
        : {}),
      page: pick(params, "page"),
    };

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
