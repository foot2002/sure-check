import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  isAdminAuthConfigured,
  mintAdminSessionToken,
  verifyAdminPassword,
} from "@/lib/report/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!isAdminAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "관리자 인증이 설정되지 않았습니다. REPORT_ADMIN_PASSWORD와 REPORT_ADMIN_SESSION_SECRET을 설정하세요.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      password?: string;
    } | null;
    const password = body?.password || "";
    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { error: "비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    const token = mintAdminSessionToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      token,
      adminSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    console.error("[admin-login]", error);
    return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 500 });
  }
}
