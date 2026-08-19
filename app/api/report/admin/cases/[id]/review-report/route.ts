import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { getAdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildAdminReviewReportDocx,
  reviewReportFilename,
} from "@/lib/report/adminReviewReportDocx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const detail = await getAdminCaseDetail(id);
    const bytes = await buildAdminReviewReportDocx(detail);
    const filename = reviewReportFilename(id);
    return new NextResponse(new Blob([Buffer.from(bytes)]), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    const status =
      error instanceof Error && (error as Error & { status?: number }).status
        ? (error as Error & { status: number }).status
        : 500;
    if (status === 404) {
      return NextResponse.json({ error: "케이스를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[admin-review-report]", error);
    return NextResponse.json(
      { error: "검토 리포트를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
