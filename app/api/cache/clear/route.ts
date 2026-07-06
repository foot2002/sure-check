import { NextResponse } from "next/server";
import { getUrlCache } from "@/lib/cache/inMemoryUrlCache";

export async function POST() {
  getUrlCache().clearAll();

  return NextResponse.json({
    ok: true,
    message: "URL 진단 캐시를 초기화했습니다.",
  });
}
