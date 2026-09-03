import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import {
  adminCaseListQueryFromSearchParams,
  listAdminCases,
  AdminRangeError,
} from "@/lib/report/adminCases";
import { adminExportSheetRows } from "@/lib/report/publicInstitutionColumns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { searchParams } = new URL(request.url);
    const payload = await listAdminCases(
      adminCaseListQueryFromSearchParams(searchParams),
    );
    const sheetRows = adminExportSheetRows(payload.cases);
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [
      { wch: 6 },
      { wch: 48 },
      { wch: 28 },
      { wch: 12 },
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 40 },
      { wch: 52 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "진단완료");
    const bytes = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const filename = `공공기관_진단완료_설문_${stamp}.xlsx`;
    const asciiName = `sure-check-admin-cases-${stamp}.xlsx`;
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof AdminRangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin-cases-export]", error);
    return NextResponse.json(
      { error: "엑셀 파일을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
