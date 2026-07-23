import { NextResponse } from "next/server";
import type { CapturePriorityQuestion } from "@/lib/evidence/buildCapturePriority";
import { captureSurveyScreenshots } from "@/lib/evidence/captureSurveyScreenshots";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CaptureRequestBody {
  surveyUrl?: string;
  finalUrl?: string;
  diagnosisId?: string;
  priorityQuestions?: CapturePriorityQuestion[];
}

function sanitizePriorityQuestions(
  raw: unknown,
): CapturePriorityQuestion[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set([
    "sensitive",
    "high",
    "direct",
    "quasi",
    "personal",
  ]);
  const out: CapturePriorityQuestion[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const questionText =
      typeof row.questionText === "string" ? row.questionText.trim() : "";
    const risk = typeof row.risk === "string" ? row.risk : "";
    const pageIndex =
      typeof row.pageIndex === "number" && Number.isFinite(row.pageIndex)
        ? Math.max(0, Math.floor(row.pageIndex))
        : 0;
    if (!questionText || !allowed.has(risk)) continue;
    out.push({
      pageIndex,
      questionText: questionText.slice(0, 160),
      risk: risk as CapturePriorityQuestion["risk"],
    });
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CaptureRequestBody;
    const surveyUrl =
      typeof body.surveyUrl === "string" ? body.surveyUrl.trim() : "";
    const finalUrl =
      typeof body.finalUrl === "string" ? body.finalUrl.trim() : "";
    const diagnosisId =
      typeof body.diagnosisId === "string" ? body.diagnosisId.trim() : "";
    const priorityQuestions = sanitizePriorityQuestions(body.priorityQuestions);

    if (!surveyUrl && !finalUrl) {
      return NextResponse.json(
        {
          success: false,
          screenshots: [],
          limitations: [
            "자동 화면 캡처에 실패했습니다.",
            "surveyUrl 또는 finalUrl이 필요합니다.",
          ],
          diagnosisId: diagnosisId || null,
        },
        { status: 400 },
      );
    }

    const primary = finalUrl || surveyUrl;
    const safety = await safeUrlCheck(primary);
    if (!safety.safe) {
      return NextResponse.json(
        {
          success: false,
          screenshots: [],
          limitations: [
            "자동 화면 캡처에 실패했습니다.",
            safety.reason || "URL 보안 검사를 통과하지 못했습니다.",
          ],
          diagnosisId: diagnosisId || null,
        },
        { status: 400 },
      );
    }

    const result = await captureSurveyScreenshots({
      surveyUrl,
      finalUrl: finalUrl || safety.normalizedUrl,
      priorityQuestions,
    });

    return NextResponse.json({
      success: result.success,
      screenshots: result.screenshots,
      limitations: result.limitations,
      diagnosisId: diagnosisId || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json(
      {
        success: false,
        screenshots: [],
        limitations: [
          "자동 화면 캡처에 실패했습니다.",
          "설문 페이지가 접근을 차단했거나 로딩 시간이 초과되었습니다.",
          `상세: ${message.slice(0, 240)}`,
        ],
      },
      { status: 500 },
    );
  }
}
