import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { listAdminCases, AdminRangeError } from "@/lib/report/adminCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { searchParams } = new URL(request.url);
    const payload = await listAdminCases({
      range: searchParams.get("range"),
      risk: searchParams.get("risk"),
      reviewStatus: searchParams.get("reviewStatus"),
      publicationStatus: searchParams.get("publicationStatus"),
      platform: searchParams.get("platform"),
      publicPrivate: searchParams.get("publicPrivate"),
      hasPersonalInfo: searchParams.get("hasPersonalInfo"),
      hasSensitiveInfo: searchParams.get("hasSensitiveInfo"),
      hasHighRiskInfo: searchParams.get("hasHighRiskInfo"),
      hasEvidence: searchParams.get("hasEvidence"),
      limitedOnly: searchParams.get("limitedOnly"),
      outreachOnly: searchParams.get("outreachOnly"),
      priority: searchParams.get("priority"),
      noticeGap: searchParams.get("noticeGap"),
      reportReview: searchParams.get("reportReview"),
      outreachStatus: searchParams.get("outreachStatus"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      q: searchParams.get("q"),
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof AdminRangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin-cases]", error);
    return NextResponse.json(
      { error: "검토 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
