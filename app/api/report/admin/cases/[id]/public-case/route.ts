import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import {
  getAdminPublicCaseDraft,
  saveAdminPublicCase,
  type PublicCaseWriteInput,
} from "@/lib/report/adminPublicCase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();
  try {
    const { id } = await context.params;
    const draft = await getAdminPublicCaseDraft(id);
    return NextResponse.json({ draft }, { headers: NO_STORE });
  } catch (error) {
    const status =
      error instanceof Error && (error as Error & { status?: number }).status
        ? (error as Error & { status: number }).status
        : 500;
    if (status === 404) {
      return NextResponse.json(
        { error: "케이스를 찾을 수 없습니다." },
        { status: 404, headers: NO_STORE },
      );
    }
    console.error("[admin-public-case-draft]", error);
    return NextResponse.json(
      { error: "공개 사례 초안을 불러오지 못했습니다." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();
  try {
    const { id } = await context.params;
    const body = (await request.json()) as PublicCaseWriteInput;
    if (
      body.action !== "publish" &&
      body.action !== "update" &&
      body.action !== "pause" &&
      body.action !== "resume"
    ) {
      return NextResponse.json(
        { error: "유효하지 않은 공개 사례 동작입니다." },
        { status: 400, headers: NO_STORE },
      );
    }
    const saved = await saveAdminPublicCase(id, body);
    return NextResponse.json({ ok: true, ...saved }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof Error && (error as Error & { status?: number }).status
        ? (error as Error & { status: number }).status
        : 500;
    if (status === 404) {
      return NextResponse.json(
        { error: "케이스를 찾을 수 없습니다." },
        { status: 404, headers: NO_STORE },
      );
    }
    if (status === 400) {
      return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE });
    }
    console.error("[admin-public-case-save]", error);
    return NextResponse.json(
      { error: "공개 사례 저장에 실패했습니다." },
      { status: 500, headers: NO_STORE },
    );
  }
}
