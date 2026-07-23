export type SupportedSurveyFileExtension = "docx" | "xlsx" | "pdf" | "hwpx";

export type FileExtractionStatus = "success" | "partial" | "failed";

export interface ExtractedSurveyQuestion {
  questionNumber?: number;
  title: string;
  rawText: string;
  required: boolean;
  options: string[];
  detectedPersonalDataTypes: string[];
  confidence: "high" | "medium" | "low";
}

export interface ExtractedSurveyDocument {
  sourceType: "file";
  fileName: string;
  fileExtension: SupportedSurveyFileExtension | string;
  mimeType: string;
  extractedText: string;
  title: string;
  detectedSubject?: string;
  detectedDepartment?: string;
  detectedContact?: string;
  detectedNoticeText?: string;
  detectedPrivacyNoticeText?: string;
  questions: ExtractedSurveyQuestion[];
  extractionStatus: FileExtractionStatus;
  extractionLimitations: string[];
  detectedToolFromText?:
    | "google_forms"
    | "naver_forms"
    | "moaform"
    | "unknown";
  metadata: {
    sheetNames?: string[];
    pageEstimate?: number;
    textLength: number;
    suspectedResponseData?: boolean;
    suspectedScannedPdf?: boolean;
  };
}

export interface FileParseError {
  code:
    | "UNSUPPORTED_EXTENSION"
    | "HWP_NOT_SUPPORTED"
    | "IMAGE_NOT_SUPPORTED"
    | "FILE_TOO_LARGE"
    | "EMPTY_FILE"
    | "RESPONSE_DATA_SUSPECTED"
    | "SCANNED_PDF"
    | "EXTRACT_FAILED"
    | "INVALID_MIME";
  message: string;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = ["docx", "xlsx", "pdf", "hwpx"] as const;

export const ALLOWED_MIME_TYPES: Record<SupportedSurveyFileExtension, string[]> = {
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
  ],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  pdf: ["application/pdf", "application/octet-stream"],
  hwpx: [
    "application/hwp+zip",
    "application/haansofthwpx",
    "application/zip",
    "application/octet-stream",
  ],
};
