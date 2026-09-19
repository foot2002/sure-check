import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { getAdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOfficialLetterDocx,
  officialLetterContentDisposition,
} from "@/lib/report/officialLetterDocx";
import { canDownloadOfficialLetterFromDetail } from "@/lib/report/officialLetterEligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const detail = await getAdminCaseDetail(id);
    if (!canDownloadOfficialLetterFromDetail(detail)) {
      return NextResponse.json(
        { error: "정상 진단만 공문을 받을 수 있습니다." },
        { status: 409 },
      );
    }
    const bytes = await buildOfficialLetterDocx(detail);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": officialLetterContentDisposition(
          detail.summary.surveyTitle || "",
          id,
        ),
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
    console.error("[admin-official-letter]", error);
    return NextResponse.json(
      { error: "공문을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
