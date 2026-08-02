import { NextResponse } from "next/server";
import {
  getAdminSessionFromCookies,
  unauthorizedJson,
} from "@/lib/report/adminAuth";
import { updateAdminCaseReview } from "@/lib/report/adminCaseDetail";
import type { ReviewOutcome, ReviewStatus } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES: ReviewStatus[] = [
  "none",
  "pending",
  "in_review",
  "resolved",
  "dismissed",
];

const OUTCOMES: ReviewOutcome[] = [
  "needs_more_info",
  "improvement_recommended",
  "deficiency_suspected",
  "violation_risk",
  "no_action",
  "dismissed",
];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminSessionFromCookies())) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      reviewStatus?: string;
      reviewerNote?: string | null;
      resolutionNote?: string | null;
      outcome?: string | null;
    };

    if (!body.reviewStatus || !REVIEW_STATUSES.includes(body.reviewStatus as ReviewStatus)) {
      return NextResponse.json({ error: "유효하지 않은 검토 상태입니다." }, { status: 400 });
    }
    if (
      body.outcome != null &&
      body.outcome !== "" &&
      !OUTCOMES.includes(body.outcome as ReviewOutcome)
    ) {
      return NextResponse.json({ error: "유효하지 않은 조치 결과입니다." }, { status: 400 });
    }

    await updateAdminCaseReview({
      id,
      reviewStatus: body.reviewStatus as ReviewStatus,
      reviewerNote: body.reviewerNote ?? null,
      resolutionNote: body.resolutionNote ?? null,
      outcome: (body.outcome || null) as ReviewOutcome | null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof Error && (error as Error & { status?: number }).status
        ? (error as Error & { status: number }).status
        : 500;
    if (status === 404) {
      return NextResponse.json({ error: "케이스를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[admin-review]", error);
    return NextResponse.json({ error: "검토 상태 저장에 실패했습니다." }, { status: 500 });
  }
}
