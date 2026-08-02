import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { updateAdminCasePublication } from "@/lib/report/adminCaseDetail";
import type { PublicationStatus } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLICATION_STATUSES: PublicationStatus[] = [
  "private",
  "aggregate_only",
  "public_anonymized",
  "public_named",
  "archived",
];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      publicationStatus?: string;
      allowNamed?: boolean;
    };

    if (
      !body.publicationStatus ||
      !PUBLICATION_STATUSES.includes(body.publicationStatus as PublicationStatus)
    ) {
      return NextResponse.json({ error: "유효하지 않은 공개 상태입니다." }, { status: 400 });
    }

    await updateAdminCasePublication({
      id,
      publicationStatus: body.publicationStatus as PublicationStatus,
      allowNamed: Boolean(body.allowNamed),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof Error && (error as Error & { status?: number }).status
        ? (error as Error & { status: number }).status
        : 500;
    if (status === 404) {
      return NextResponse.json({ error: "케이스를 찾을 수 없습니다." }, { status: 404 });
    }
    if (status === 400) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[admin-publication]", error);
    return NextResponse.json({ error: "공개 상태 저장에 실패했습니다." }, { status: 500 });
  }
}
