import { NextResponse } from "next/server";
import { getPublishedPublicCase } from "@/lib/report/publicCases";
import { assertPublicCaseSafe } from "@/lib/report/publicCasePolicy";

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
