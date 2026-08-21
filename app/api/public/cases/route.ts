import { NextResponse } from "next/server";
import {
  listPublishedPublicCases,
} from "@/lib/report/publicCases";
import { assertPublicCaseSafe } from "@/lib/report/publicCasePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cases = await listPublishedPublicCases({
      filter: searchParams.get("filter"),
      sort: searchParams.get("sort"),
    });
    const body = { cases };
    assertPublicCaseSafe(body);
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("[public-cases]", error);
    const message = error instanceof Error ? error.message : String(error);
    if (/public_case_status|public_id|schema cache|does not exist/i.test(message)) {
      return NextResponse.json({ cases: [] }, { headers: NO_STORE });
    }
    return NextResponse.json(
      { error: "공개 진단 사례를 불러오지 못했습니다." },
      { status: 500, headers: NO_STORE },
    );
  }
}
