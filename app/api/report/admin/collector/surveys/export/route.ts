import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import {
  collectorFiltersFromSearchParams,
  listSurveyLinks,
} from "@/lib/collector/queries";
import {
  collectorDiagnosisLabelKo,
  collectorLaneLabelKo,
  collectorPlatformLabel,
  collectorStatusLabelKo,
  collectorTriageLabelKo,
} from "@/lib/collector/collectorDashboardLabels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 200;
const MAX_ROWS = 3000;

export async function GET(request: Request) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const params = new URL(request.url).searchParams;
    const base = collectorFiltersFromSearchParams(params);
    const items: Awaited<ReturnType<typeof listSurveyLinks>>["items"] = [];
    let page = 1;
    for (;;) {
      const result = await listSurveyLinks({
        ...base,
        limit: PAGE,
        page,
      });
      items.push(...result.items);
      if (!result.hasMore || items.length >= MAX_ROWS) break;
      page += 1;
      if (page > 20) break;
    }
    const sheetRows = items.slice(0, MAX_ROWS).map((item, index) => ({
      순번: index + 1,
      플랫폼: collectorPlatformLabel(item.platform),
      제목: item.title || "(제목 없음)",
      URL: item.canonical_url,
      상태: collectorStatusLabelKo(item.status),
      수집구분: collectorLaneLabelKo(item.collect_lane) || "",
      우선순위: collectorTriageLabelKo(item.triage_queue) || "",
      진단: collectorDiagnosisLabelKo(item.diagnosis_status),
      점수: item.diagnosis_score ?? "",
      등급: item.diagnosis_grade ?? "",
      최초발견: item.first_discovered_at || "",
      최근발견: item.last_discovered_at || "",
      발견횟수: item.discovery_count ?? 0,
      출처수: item.source_count ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws["!cols"] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 48 },
      { wch: 56 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 8 },
      { wch: 8 },
      { wch: 22 },
      { wch: 22 },
      { wch: 10 },
      { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "수집목록");
    const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const filename = `수집함_검색결과_${stamp}.xlsx`;
    const asciiName = `sure-check-collector-${stamp}.xlsx`;
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/report/admin/collector/surveys/export]", error);
    return NextResponse.json(
      { error: "수집 목록 엑셀을 만들지 못했습니다." },
      { status: 500 },
    );
  }
}
