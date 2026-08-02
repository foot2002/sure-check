import { NextResponse } from "next/server";
import { buildPublicDashboard } from "@/lib/report/buildPublicDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = await buildPublicDashboard({
      range: searchParams.get("range"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[public-dashboard]", error);
    return NextResponse.json(
      {
        error: "공개 통계를 불러오지 못했습니다.",
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
