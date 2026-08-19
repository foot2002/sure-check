import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { evidenceDownloadFilename } from "@/lib/report/adminOutreach";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ evidenceFileId: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { evidenceFileId } = await context.params;
    const caseId =
      new URL(request.url).searchParams.get("caseId") || evidenceFileId;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("evidence_files")
      .select("id, storage_bucket, storage_path, evidence_type, label, mime_type, page_number")
      .eq("id", evidenceFileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.storage_path || !data.storage_bucket) {
      return NextResponse.json(
        { error: "증빙 파일 메타데이터는 있으나 Storage 경로가 비어 있습니다." },
        { status: 500 },
      );
    }

    const downloaded = await supabase.storage
      .from(data.storage_bucket)
      .download(data.storage_path);
    if (downloaded.error || !downloaded.data) {
      return NextResponse.json(
        { error: "Storage에서 증빙 파일을 읽지 못했습니다." },
        { status: 500 },
      );
    }

    const blob = downloaded.data;
    const filename = evidenceDownloadFilename({
      caseId,
      evidenceType: String(data.evidence_type || ""),
      label: (data.label as string | null) || null,
      pageNumber: (data.page_number as number | null) || null,
    });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": data.mime_type || blob.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin-evidence-download]", error);
    return NextResponse.json(
      { error: "증빙 파일을 내려받지 못했습니다." },
      { status: 500 },
    );
  }
}
