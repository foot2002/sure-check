import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSignedEvidenceUrl } from "@/lib/storage/evidenceStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes

export async function POST(
  _request: Request,
  context: { params: Promise<{ evidenceFileId: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { evidenceFileId } = await context.params;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("evidence_files")
      .select("id, storage_bucket, storage_path, evidence_type, label, mime_type")
      .eq("id", evidenceFileId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "증거 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const signedUrl = await createSignedEvidenceUrl({
      path: data.storage_path,
      bucket: data.storage_bucket,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });

    return NextResponse.json(
      {
        evidenceFileId: data.id,
        evidenceType: data.evidence_type,
        label: data.label,
        mimeType: data.mime_type,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        signedUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("[admin-signed-url]", error);
    return NextResponse.json(
      { error: "서명 URL을 생성하지 못했습니다." },
      { status: 500 },
    );
  }
}
