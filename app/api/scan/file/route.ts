import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { analyzeForm } from "@/lib/analyzer/analyzeForm";
import { buildNormalizedFormFromFile } from "@/lib/file-extractors/buildNormalizedFormFromFile";
import { parseUploadedSurveyFile } from "@/lib/file-extractors/parseUploadedSurveyFile";
import { generateExtractionLimitedReport } from "@/lib/scan/limitedReport";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "설문지 파일을 선택해 주세요." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsed = await parseUploadedSurveyFile({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });

    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error.message, code: parsed.error.code },
        { status: 400 },
      );
    }

    const normalized = buildNormalizedFormFromFile(parsed.document);
    const scanId = `file_${randomUUID()}`;
    const formUrl = normalized.url;

    const report =
      normalized.isLimited && normalized.questions.length === 0
        ? generateExtractionLimitedReport(scanId, formUrl, normalized, {
            limitedReason:
              "파일은 읽었지만 실제 설문 문항과 개인정보 고지문을 충분히 추출하지 못했습니다.",
            limitationReasons: [
              ...(normalized.metadata?.extractionWarnings ?? []),
              "텍스트가 포함된 DOCX, HWPX, PDF 또는 문항표 XLSX 파일로 다시 업로드해 주세요.",
            ],
            summary:
              "업로드한 파일에서 설문 문항을 충분히 확인하지 못했습니다.",
            guidance:
              "텍스트가 포함된 DOCX, HWPX, PDF 또는 문항표 XLSX 파일로 다시 업로드해 주세요.",
            diagnosisStatus: "limited",
          })
        : analyzeForm(
            normalized,
            scanId,
            formUrl,
            "generic_unknown_warning",
          );

    if (!report.form.metadata?.source && normalized.metadata?.source) {
      report.form.metadata = {
        ...report.form.metadata,
        ...normalized.metadata,
      };
    }

    return NextResponse.json({
      scanId: report.scanId,
      report,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "파일 진단 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
}
