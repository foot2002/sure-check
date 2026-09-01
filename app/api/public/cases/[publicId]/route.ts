import { NextResponse } from "next/server";
import {
  PUBLIC_INDIVIDUAL_CASES_ENABLED,
  assertPublicCaseSafe,
} from "@/lib/report/publicCasePolicy";
import { getPublishedPublicCase } from "@/lib/report/publicCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  if (!PUBLIC_INDIVIDUAL_CASES_ENABLED) {
    return NextResponse.json(
      {
        redirectedTo: "/weekly",
        message:
          "해당 공개 사례 페이지는 주간 리포트로 개편되었습니다. 개별 기관·설문은 공개하지 않습니다.",
      },
      { status: 410, headers: NO_STORE },
    );
  }
  try {
    const { publicId } = await context.params;
    const detail = await getPublishedPublicCase(publicId);
    if (!detail) {
      return NextResponse.json(
        { error: "공개된 사례가 아닙니다." },
        { status: 404, headers: NO_STORE },
      );
    }
    assertPublicCaseSafe(detail);
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error) {
    console.error("[public-case-detail]", error);
    return NextResponse.json(
      { error: "공개 진단 사례를 불러오지 못했습니다." },
      { status: 500, headers: NO_STORE },
    );
  }
}
