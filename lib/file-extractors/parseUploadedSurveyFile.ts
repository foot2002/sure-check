import { extractDocxSurvey } from "@/lib/file-extractors/extractDocxSurvey";
import { extractHwpxSurvey } from "@/lib/file-extractors/extractHwpxSurvey";
import { extractPdfSurvey, ScannedPdfError } from "@/lib/file-extractors/extractPdfSurvey";
import {
  extractXlsxSurvey,
  ResponseDataSuspectedError,
} from "@/lib/file-extractors/extractXlsxSurvey";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type ExtractedSurveyDocument,
  type FileParseError,
  type SupportedSurveyFileExtension,
} from "@/lib/file-extractors/fileExtractorTypes";

export type ParseUploadedSurveyResult =
  | { ok: true; document: ExtractedSurveyDocument }
  | { ok: false; error: FileParseError };

function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isAllowedExtension(
  ext: string,
): ext is SupportedSurveyFileExtension {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function validateUploadedSurveyFile(input: {
  fileName: string;
  mimeType: string;
  size: number;
}):
  | { ok: false; error: FileParseError }
  | { ok: true; fileName: string; extension: SupportedSurveyFileExtension } {
  const fileName = sanitizeFileName(input.fileName || "upload.bin");
  const extension = getExtension(fileName);

  if (!fileName || input.size <= 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_FILE",
        message: "빈 파일은 진단할 수 없습니다. 설문지 파일을 다시 선택해 주세요.",
      },
    };
  }

  if (input.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: {
        code: "FILE_TOO_LARGE",
        message: "파일 크기가 10MB를 초과합니다. 10MB 이하의 파일을 업로드해 주세요.",
      },
    };
  }

  if (extension === "hwp") {
    return {
      ok: false,
      error: {
        code: "HWP_NOT_SUPPORTED",
        message:
          "HWP 파일은 현재 직접 분석을 지원하지 않습니다. HWPX, PDF, DOCX로 변환 후 업로드해 주세요.",
      },
    };
  }

  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"].includes(extension)) {
    return {
      ok: false,
      error: {
        code: "IMAGE_NOT_SUPPORTED",
        message:
          "이미지 파일 또는 스캔본은 현재 분석을 지원하지 않습니다. 텍스트가 포함된 PDF, DOCX, XLSX, HWPX 파일을 업로드해 주세요.",
      },
    };
  }

  if (!isAllowedExtension(extension)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_EXTENSION",
        message:
          "지원하지 않는 파일 형식입니다. DOCX, XLSX, 텍스트 PDF, HWPX 파일만 업로드해 주세요.",
      },
    };
  }

  const allowedMimes = ALLOWED_MIME_TYPES[extension];
  const mime = (input.mimeType || "").toLowerCase();
  if (mime && !allowedMimes.includes(mime) && mime !== "application/octet-stream") {
    // 일부 브라우저는 MIME를 비우거나 다르게 보내므로 octet-stream만 허용하고, 그 외는 경고성으로 거부
    if (!mime.includes(extension) && !mime.includes("zip") && !mime.includes("pdf") && !mime.includes("sheet") && !mime.includes("word")) {
      return {
        ok: false,
        error: {
          code: "INVALID_MIME",
          message:
            "파일 형식이 허용된 설문 양식과 일치하지 않습니다. DOCX, XLSX, PDF, HWPX 파일을 확인해 주세요.",
        },
      };
    }
  }

  return { ok: true, fileName, extension };
}

export async function parseUploadedSurveyFile(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<ParseUploadedSurveyResult> {
  const validated = validateUploadedSurveyFile(input);
  if (!validated.ok) return validated;

  const { fileName, extension } = validated;

  try {
    let document: ExtractedSurveyDocument;
    switch (extension) {
      case "docx":
        document = await extractDocxSurvey(input.buffer, fileName, input.mimeType);
        break;
      case "xlsx":
        document = extractXlsxSurvey(input.buffer, fileName, input.mimeType);
        break;
      case "pdf":
        document = await extractPdfSurvey(input.buffer, fileName, input.mimeType);
        break;
      case "hwpx":
        document = await extractHwpxSurvey(input.buffer, fileName, input.mimeType);
        break;
      default:
        return {
          ok: false,
          error: {
            code: "UNSUPPORTED_EXTENSION",
            message:
              "지원하지 않는 파일 형식입니다. DOCX, XLSX, 텍스트 PDF, HWPX 파일만 업로드해 주세요.",
          },
        };
    }

    return { ok: true, document };
  } catch (error) {
    if (error instanceof ResponseDataSuspectedError) {
      return {
        ok: false,
        error: { code: "RESPONSE_DATA_SUSPECTED", message: error.message },
      };
    }
    if (error instanceof ScannedPdfError) {
      return {
        ok: false,
        error: { code: "SCANNED_PDF", message: error.message },
      };
    }

    return {
      ok: false,
      error: {
        code: "EXTRACT_FAILED",
        message:
          "파일에서 설문 내용을 읽지 못했습니다. 텍스트가 포함된 DOCX, HWPX, PDF 또는 문항표 XLSX로 다시 시도해 주세요.",
      },
    };
  }
}
