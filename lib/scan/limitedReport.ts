import { enrichScanReport } from "@/lib/debug/enrichScanReport";
import type { ReportBuildContext } from "@/lib/types/debug";
import type { DiagnosisStatus, NormalizedForm, ScanReport } from "@/lib/types/scan";

export const EXTRACTION_LIMITED_REASON =
  "설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다.";

export const EXTRACTION_LIMITED_SUMMARY =
  "이 URL에서는 설문 문항 또는 입력 필드를 자동으로 확인하지 못했습니다. 설문 페이지가 아니거나, JavaScript로 동적으로 로딩되거나, 로그인 후 문항이 표시되는 구조일 수 있습니다.";

export const EXTRACTION_LIMITED_GUIDANCE =
  "정밀 진단을 위해서는 실제 설문 URL, 설문 원문, 또는 화면 캡처가 필요할 수 있습니다.";

export interface LimitedReportOptions {
  limitedReason?: string;
  limitationReasons?: string[];
  summary?: string;
  guidance?: string;
  buildContext?: ReportBuildContext;
  diagnosisStatus?: Exclude<DiagnosisStatus, "completed">;
}

function buildLimitedForm(formUrl: string, title: string, platform: NormalizedForm["platform"] = "generic"): NormalizedForm {
  return {
    platform,
    title,
    url: formUrl,
    operatorType: "미확인",
    questions: [],
    pages: [{ id: "page_1", questions: [] }],
    partialScan: true,
    isLimited: true,
    confidence: "none",
    limitedReason: EXTRACTION_LIMITED_REASON,
    loginRequired: false,
    branchDetected: false,
    extractedFromHtml: false,
    hasPrivacyNotice: false,
    hasConsent: false,
    hasRetentionNotice: false,
    hasOverseasTransferNotice: false,
    metadata: { extractionWarnings: [] },
  };
}

export function isExtractionLimitedReport(report: ScanReport): boolean {
  return Boolean(
    report.isLimited &&
      report.form.questions.length === 0 &&
      report.score == null,
  );
}

export function generateExtractionLimitedReport(
  scanId: string,
  formUrl: string,
  sourceForm?: Pick<
    NormalizedForm,
    | "title"
    | "platform"
    | "extractedFromHtml"
    | "limitedReason"
    | "operatorType"
    | "metadata"
    | "notices"
  >,
  options?: LimitedReportOptions,
): ScanReport {
  const now = new Date().toISOString();
  const title = sourceForm?.title ?? "진단 제한";
  const platform = sourceForm?.platform ?? "generic";
  const limitedReason =
    options?.limitedReason ??
    sourceForm?.limitedReason ??
    EXTRACTION_LIMITED_REASON;
  const limitationReasons = options?.limitationReasons ?? [
    limitedReason,
    options?.guidance ?? EXTRACTION_LIMITED_GUIDANCE,
  ];
  const summary = options?.summary ?? EXTRACTION_LIMITED_SUMMARY;
  const isMoaform = platform === "moaform";

  const report: ScanReport = {
    scanId,
    formUrl,
    platform,
    mockKey: "generic_unknown_warning",
    diagnosisStatus: options?.diagnosisStatus ?? "limited",
    isLimited: true,
    limitedReason,
    confidence: "none",
    scanStatus: "limited",
    limitationReasons,
    summary,
    sections: {
      dataCollectionRisk: "",
      toolProcessingRisk: "",
      noticeConsentGap: "",
      managementRisk: "",
      detectedPersonalData: [],
      missingObligations: [],
      respondentGuidance: [options?.guidance ?? EXTRACTION_LIMITED_GUIDANCE],
      operatorRecommendations: isMoaform
        ? [
            "설문 첫 화면에 개인정보 수집 목적, 항목, 보유기간, 파기 기준, 담당자 안내가 보이도록 구성하세요.",
            "개인정보를 수집하는 경우 외부 설문도구 이용, 수탁자, 위탁업무, 보유·파기 기준을 안내하세요.",
          ]
        : [
            "Google Forms, 네이버폼, 모아폼 등 지원 플랫폼 사용을 권장합니다.",
            "개인정보 처리방침·운영자 연락처를 설문 첫 화면에 표시하세요.",
          ],
      evidenceItems: [],
      legalBasisSummary:
        "문항 자동 추출이 불가하여 개인정보 위험 점수를 산정하지 않았습니다. 본 결과는 참고 수준의 제한 안내입니다.",
      disclaimer:
        "본 서비스는 법률 자문이 아닌 자동 위험 진단 결과입니다. 문항을 확인하지 못한 URL은 위험 등급·점수로 해석하지 마세요.",
    },
    findings: [
      {
        id: "limit_0",
        category: "override",
        severity: "info",
        title: isMoaform ? "모아폼 문항 자동 확인 제한" : "진단 제한",
        description: limitedReason,
      },
    ],
    form: {
      ...buildLimitedForm(formUrl, title, platform),
      limitedReason,
      extractedFromHtml: sourceForm?.extractedFromHtml ?? true,
      operatorType: sourceForm?.operatorType ?? "미확인",
      notices: sourceForm?.notices,
      metadata: {
        ...sourceForm?.metadata,
        diagnosisScope: "limited",
        extractionWarnings: [
          ...(sourceForm?.metadata?.extractionWarnings ?? []),
        ],
      },
    },
    createdAt: now,
    completedAt: now,
  };

  return enrichScanReport(report, null, options?.buildContext);
}
