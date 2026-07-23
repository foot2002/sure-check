import { NextResponse } from "next/server";
import { captureSurveyScreenshots } from "@/lib/evidence/captureSurveyScreenshots";
import { safeUrlCheck } from "@/lib/security/urlSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CaptureRequestBody {
  surveyUrl?: string;
  finalUrl?: string;
  diagnosisId?: string;
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
