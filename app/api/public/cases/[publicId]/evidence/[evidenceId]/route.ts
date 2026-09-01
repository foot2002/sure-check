import { NextResponse } from "next/server";
import { PUBLIC_INDIVIDUAL_CASES_ENABLED } from "@/lib/report/publicCasePolicy";
import { loadPublishedEvidenceFile } from "@/lib/report/publicCases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string; evidenceId: string }> },
) {
  if (!PUBLIC_INDIVIDUAL_CASES_ENABLED) {
    return NextResponse.json(
      {
        redirectedTo: "/weekly",
        message: "개별 공개 사례 캡처는 제공하지 않습니다.",
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { publicId, evidenceId } = await context.params;
    const file = await loadPublishedEvidenceFile({ publicId, evidenceId });
    if (!file) {
      return NextResponse.json(
        { error: "공개된 캡처가 아닙니다." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new NextResponse(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "image/png",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[public-case-evidence]", error);
    return NextResponse.json(
      { error: "공개 캡처를 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
