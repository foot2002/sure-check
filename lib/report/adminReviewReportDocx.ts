import JSZip from "jszip";
import { buildComplaintDraft } from "@/lib/evidence/buildComplaintDraft";
import { buildReportEvidenceModel } from "@/lib/evidence/buildEvidenceModel";
import type {
  EvidenceLegalGround,
  EvidenceNoticeCheck,
  EvidenceQuestion,
  ReportEvidenceModel,
} from "@/lib/evidence/evidenceTypes";
import { composeAudienceReport } from "@/lib/reporting/composeAudienceReport";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOutreachCopy,
  classifyOutreachPriority,
  improvementChecklist,
  pickIssueBadges,
} from "@/lib/report/adminOutreach";
import type { ScanReport } from "@/lib/types/scan";

function rewriteReportWording(text: string): string {
  return text
    .replace(/신고증빙/g, "진단 및 개선요구 증빙")
    .replace(/신고\s*이유/g, "진단 및 개선요구 이유")
    .replace(/신고기관/g, "진단 및 개선요구 기관")
    .replace(/신고용/g, "진단 및 개선요구용")
    .replace(/신고/g, "진단 및 개선요구");
}

function xmlEscape(value: string): string {
  return rewriteReportWording(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\u0000/g, "");
}

function runPr(opts?: { heading?: boolean; bold?: boolean; size?: string }): string {
  const size = opts?.size || (opts?.heading ? "32" : "21");
  const bold = opts?.heading || opts?.bold ? "<w:b/>" : "";
  return `<w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/></w:rPr>`;
}

function wPara(text: string, opts?: { heading?: boolean; bold?: boolean }): string {
  const lines = (text || "—").split(/\r?\n/);
  return lines
    .map((line) => {
      const t = xmlEscape(line || " ");
      return `<w:p><w:r>${runPr(opts)}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    })
    .join("");
}

function wBlank(): string {
  return "<w:p><w:r><w:t></w:t></w:r></w:p>";
}

function wTable(headers: string[], rows: string[][]): string {
  const colCount = Math.max(headers.length, 1);
  const total = 9026;
  const colW = Math.floor(total / colCount);
  const grid = Array.from(
    { length: colCount },
    () => `<w:gridCol w:w="${colW}"/>`,
  ).join("");
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map(
      (edge) =>
        `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`,
    )
    .join("");

  const cell = (text: string, header: boolean) => {
    const fill = header
      ? `<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>`
      : "";
    const paras = (text || "—")
      .split(/\r?\n/)
      .map((line) => {
        const t = xmlEscape(line || " ");
        return `<w:p><w:r>${runPr({
          bold: header,
          size: "18",
        })}<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
      })
      .join("");
    return `<w:tc><w:tcPr>${fill}<w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr>${paras}</w:tc>`;
  };

  const dataRows =
    rows.length > 0
      ? rows
      : [headers.map((_, i) => (i === 0 ? "해당 항목 없음" : ""))];
  const headerRow = `<w:tr>${headers.map((h) => cell(h, true)).join("")}</w:tr>`;
  const body = dataRows
    .map((row) => {
      const padded = headers.map((_, i) => row[i] || "");
      return `<w:tr>${padded.map((c) => cell(c, false)).join("")}</w:tr>`;
    })
    .join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${body}</w:tbl>${wBlank()}`;
}

function isScanReport(value: unknown): value is ScanReport {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const form = row.form as Record<string, unknown> | undefined;
  return (
    typeof row.scanId === "string" &&
    Boolean(form) &&
    typeof form === "object" &&
    Array.isArray(form.questions)
  );
}

function joinOrNone(items: string[]): string {
  const list = items.filter(Boolean);
  return list.length > 0 ? list.join(", ") : "없음";
}

function fallbackQuestions(detail: AdminCaseDetail): EvidenceQuestion[] {
  return detail.questions
    .filter((q) => q.hasPersonalInfo || q.hasSensitiveInfo || q.hasHighRiskInfo)
    .map((q) => {
      const labels = q.categories.map((c) => c.categoryLabel).filter(Boolean);
      const risk =
        q.hasHighRiskInfo
          ? "고위험정보"
          : q.hasSensitiveInfo
            ? "민감정보"
            : q.hasPersonalInfo
              ? "직접식별정보"
              : "기타";
      return {
        questionNumber: q.questionNumber || "—",
        questionText: q.questionLabel || "(문항)",
        detectedDataType: labels.join(", ") || "확인 필요",
        riskCategory: risk as EvidenceQuestion["riskCategory"],
        matchedKeyword: q.categories[0]?.matchedKeyword || "",
        source: "survey_records",
        confidence: "medium" as const,
      };
    });
}

function fallbackNoticeChecks(detail: AdminCaseDetail): EvidenceNoticeCheck[] {
  if (detail.complianceChecks.length === 0) return [];
  return detail.complianceChecks.map((c) => ({
    item: c.checkItem,
    status: c.statusLabel || c.status,
    evidence: c.evidenceNote || "",
  }));
}

function fallbackLegalGrounds(detail: AdminCaseDetail): EvidenceLegalGround[] {
  const fromFindings = detail.findings
    .filter((f) => f.legalBasisCodes.length > 0 || f.title)
    .slice(0, 12)
    .map((f) => ({
      label: f.legalBasisCodes.join(", ") || f.title,
      shortTitle: f.title,
      reviewNote: f.description || f.evidenceNote || f.recommendation || "확인 필요",
    }));
  return fromFindings;
}

function fallbackCoreReasons(detail: AdminCaseDetail): string[] {
  const badges = pickIssueBadges({
    userDecisionLabel: detail.summary.userDecisionLabel,
    complianceLabels: detail.complianceChecks.map(
      (c) => `${c.checkItem} ${c.statusLabel}`,
    ),
    findingTitles: detail.findings.map((f) => f.title),
    hasSensitiveInfo: detail.summary.hasSensitiveInfo,
    hasHighRiskInfo: detail.summary.hasHighRiskInfo,
    isPublic: detail.summary.publicPrivateType === "public",
  });
  const findingReasons = detail.findings
    .map((f) => f.title)
    .filter(Boolean)
    .slice(0, 8);
  return [...new Set([...badges, ...findingReasons])];
}

function resolveEvidenceView(detail: AdminCaseDetail): {
  generatedAtKst: string;
  diagnosisId: string;
  disclaimer: string;
  surveyTitle: string;
  surveyUrl: string;
  finalUrl: string;
  operatorName: string;
  subjectType: string;
  toolName: string;
  diagnosisMethod: string;
  userDecision: string;
  personal: string;
  sensitive: string;
  highRisk: string;
  legalGrounds: EvidenceLegalGround[];
  noticeChecks: EvidenceNoticeCheck[];
  questions: EvidenceQuestion[];
  reportReason: string;
  coreReasons: string[];
  limitations: string[];
} {
  const s = detail.summary;
  const captureLimitations = detail.captureJobs.flatMap((job) => job.limitations);
  const fallback = {
    generatedAtKst: s.observedDateKst,
    diagnosisId: s.externalScanId || detail.id,
    disclaimer:
      "이 자료는 진단 및 개선요구 기관의 사실관계 확인을 돕기 위한 참고자료입니다. 최종 위법 여부는 관련 기관의 검토·조사 결과에 따라 판단됩니다.",
    surveyTitle: s.surveyTitle || "제목 없음",
    surveyUrl: s.surveyUrl || "(파일 진단)",
    finalUrl: s.finalUrl || "(없음)",
    operatorName: s.operatorName || "미확인",
    subjectType: s.subjectType || s.publicPrivateType || "unknown",
    toolName: s.platform,
    diagnosisMethod: s.surveyUrl ? "링크 진단" : "파일 진단",
    userDecision: s.userDecisionLabel || "—",
    personal: s.hasPersonalInfo ? "있음" : "없음",
    sensitive: s.hasSensitiveInfo ? "있음" : "없음",
    highRisk: s.hasHighRiskInfo ? "있음" : "없음",
    legalGrounds: fallbackLegalGrounds(detail),
    noticeChecks: fallbackNoticeChecks(detail),
    questions: fallbackQuestions(detail),
    reportReason: fallbackCoreReasons(detail).join(" ") || s.userDecisionLabel || "—",
    coreReasons: fallbackCoreReasons(detail),
    limitations: [
      ...captureLimitations,
      "자동 진단 결과입니다.",
      "개별 설문의 위법 여부를 확정하는 자료가 아닙니다.",
    ],
  };

  if (!isScanReport(detail.reportJson)) return fallback;

  try {
    const report = detail.reportJson;
    const audience = composeAudienceReport(report);
    const model: ReportEvidenceModel = buildReportEvidenceModel(report, audience);
    const screenshots = detail.evidenceFiles.filter((f) =>
      /screenshot|zip/i.test(f.evidenceType),
    );
    const reportReason = buildComplaintDraft(model, {
      captureAttempted: detail.captureJobs.length > 0,
      screenCaptureEvidence: screenshots.map((f) => ({
        id: f.id,
        storedName: f.label || f.evidenceTypeLabel,
        mimeType: f.mimeType || "application/octet-stream",
        size: f.byteSize || 0,
        sha256: f.sha256 || "",
        source: "auto_browser_capture" as const,
        capturedAt: s.observedAt,
      })),
    });
    return {
      generatedAtKst: model.generatedAtKst,
      diagnosisId: model.diagnosisId,
      disclaimer: model.disclaimer,
      surveyTitle: model.surveyTitle,
      surveyUrl: model.surveyUrl || "(파일 진단)",
      finalUrl: model.finalUrl || "(없음)",
      operatorName: model.operatorName,
      subjectType: `${model.subjectType}${model.subjectEvidence ? ` · ${model.subjectEvidence}` : ""}`,
      toolName: model.toolName,
      diagnosisMethod: model.diagnosisMethod,
      userDecision: model.userDecision,
      personal: joinOrNone(model.detectedPersonalDataItems),
      sensitive: joinOrNone(model.detectedSensitiveDataItems),
      highRisk: joinOrNone(model.detectedHighRiskDataItems),
      legalGrounds: model.legalGrounds,
      noticeChecks: model.noticeChecks,
      questions: model.detectedQuestions,
      reportReason,
      coreReasons: model.coreReasons,
      limitations: [
        ...model.limitations,
        ...captureLimitations.filter((item) => !model.limitations.includes(item)),
      ],
    };
  } catch (error) {
    console.warn(
      "[admin-review-report] evidence model fallback:",
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}

export function reviewReportFilename(caseId: string): string {
  return `sure-check-review-report-${caseId}.docx`;
}

export { rewriteReportWording };

export async function buildAdminReviewReportDocx(
  detail: AdminCaseDetail,
): Promise<Uint8Array> {
  const s = detail.summary;
  const view = resolveEvidenceView(detail);
  const categoryLabels = [
    ...new Set(
      detail.questions.flatMap((q) => q.categories.map((c) => c.categoryLabel)),
    ),
  ].slice(0, 6);
  const issueBadges = pickIssueBadges({
    userDecisionLabel: s.userDecisionLabel,
    complianceLabels: detail.complianceChecks.map(
      (c) => `${c.checkItem} ${c.statusLabel}`,
    ),
    findingTitles: detail.findings.map((f) => f.title),
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    isPublic: s.publicPrivateType === "public",
  });
  const priority = classifyOutreachPriority({
    publicPrivateType: s.publicPrivateType,
    hasPersonalInfo: s.hasPersonalInfo,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    overallRiskLevel: s.overallRiskLevel,
    userDecisionLabel: s.userDecisionLabel,
    evidenceCount: s.evidenceCount,
    issueBadges,
  });
  const copy = buildOutreachCopy({ categoryLabels, issueBadges });
  const checks = improvementChecklist({
    issueBadges,
    isPublic: s.publicPrivateType === "public",
  });

  const screenshots = detail.evidenceFiles.filter((f) =>
    /screenshot/i.test(f.evidenceType),
  );
  const captureNames = screenshots
    .map((f) => f.label || f.evidenceTypeLabel)
    .filter(Boolean);
  const captureAttempted = detail.captureJobs.length > 0;

  const legalRows = view.legalGrounds.map((g) => [g.label, g.reviewNote]);
  const noticeRows = view.noticeChecks.map((n) => [n.item, n.status]);
  const questionRows = view.questions.map((q) => [
    q.questionNumber,
    q.questionText,
    q.detectedDataType,
    q.riskCategory,
  ]);

  const body = [
    wPara("SURE Check 진단 및 개선요구 증빙 요약서", { heading: true }),
    wPara(
      `진단일시(KST): ${view.generatedAtKst} · 진단 ID: ${view.diagnosisId}`,
    ),
    wBlank(),
    wPara(view.disclaimer),
    wBlank(),
    wPara("1. 설문 기본 내용과 진단 결과 (법 문제)", { heading: true }),
    wPara("설문 기본 정보", { bold: true }),
    wPara(`- 설문 제목: ${view.surveyTitle}`),
    wPara(`- 설문 URL: ${view.surveyUrl}`),
    wPara(`- 최종 URL: ${view.finalUrl}`),
    wPara(`- 설문 주체: ${view.operatorName} (${view.subjectType})`),
    wPara(`- 사용도구: ${view.toolName}`),
    wPara(`- 진단 방식: ${view.diagnosisMethod}`),
    wPara(`- 판단 결과: ${view.userDecision}`),
    wPara(`- 위험도: ${s.overallRiskLevel}`),
    wPara(`- 점수: ${s.score == null ? "—" : String(s.score)}`),
    wPara(`- 진단일: ${s.observedDateKst}`),
    wBlank(),
    wPara("탐지 데이터 요약", { bold: true }),
    wPara(`- 개인정보: ${view.personal}`),
    wPara(`- 민감정보: ${view.sensitive}`),
    wPara(`- 고위험정보: ${view.highRisk}`),
    wBlank(),
    wPara("법·정책 저촉·검토 포인트", { bold: true }),
    wTable(["기준", "검토 포인트"], legalRows),
    wPara("고지문 확인", { bold: true }),
    wTable(["항목", "확인 여부"], noticeRows),
    wPara("개인정보·민감정보 문항", { bold: true }),
    wTable(["번호", "문항 원문", "탐지 유형", "분류"], questionRows),
    wPara("2. 진단 및 개선요구 이유", { heading: true }),
    wPara(view.reportReason),
    wBlank(),
    wPara("핵심 사유", { bold: true }),
    wPara(
      view.coreReasons.length > 0
        ? view.coreReasons.map((item) => `- ${item}`).join("\n")
        : "- 해당 항목 없음",
    ),
    wBlank(),
    wPara("3. 증빙 주요 내용", { heading: true }),
    wPara(`- 첨부 화면 캡처 수: ${screenshots.length}개`),
    wPara(
      `- 캡처 파일명: ${
        captureNames.length > 0
          ? captureNames.join(", ")
          : captureAttempted
            ? "자동 캡처 실패 또는 없음"
            : "없음"
      }`,
    ),
    wPara(`- 저장된 증빙 파일 수: ${s.evidenceCount}`),
    wBlank(),
    wPara("진단 한계", { bold: true }),
    wPara(
      view.limitations.length > 0
        ? view.limitations.map((item) => `- ${item}`).join("\n")
        : "- 해당 항목 없음",
    ),
    wBlank(),
    wPara("4. 개선 권고", { heading: true }),
    wPara(`- 개선안내 우선순위: ${priority}`),
    wPara(checks.map((item) => `- ${item}`).join("\n")),
    wBlank(),
    wPara("5. 공문용 개선 요청 문구", { heading: true }),
    wPara(copy.letterSummary),
    wBlank(),
    wPara("6. 유의사항", { heading: true }),
    wPara("- 본 리포트는 공개 설문 화면에 대한 자동진단 기반 검토 자료입니다."),
    wPara("- 개별 설문의 위법 여부를 확정하는 자료가 아닙니다."),
    wPara(
      "- 최종 판단은 기관의 사실관계 확인 및 관련 법령 검토에 따라 달라질 수 있습니다.",
    ),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
  ].join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.folder("word")?.file("document.xml", documentXml);
  zip.folder("word/_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
