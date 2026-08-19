import JSZip from "jszip";
import type { AdminCaseDetail } from "@/lib/report/adminCaseDetail";
import {
  buildOutreachCopy,
  classifyOutreachPriority,
  classifyOutreachUiStatus,
  formatDataCollectionSummary,
  improvementChecklist,
  isOutreachCandidate,
  outreachUiStatusKo,
  pickIssueBadges,
  publicPrivateKo,
  riskLabelKo,
} from "@/lib/report/adminOutreach";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\u0000/g, "");
}

function wPara(text: string, opts?: { heading?: boolean; bold?: boolean }): string {
  const size = opts?.heading ? "32" : "21";
  const bold = opts?.heading || opts?.bold ? "<w:b/>" : "";
  const lines = (text || "—").split(/\r?\n/);
  return lines
    .map((line) => {
      const t = xmlEscape(line || " ");
      return `<w:p><w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    })
    .join("");
}

function wBlank(): string {
  return "<w:p><w:r><w:t></w:t></w:r></w:p>";
}

export function reviewReportFilename(caseId: string): string {
  return `sure-check-review-report-${caseId}.docx`;
}

export async function buildAdminReviewReportDocx(
  detail: AdminCaseDetail,
): Promise<Uint8Array> {
  const s = detail.summary;
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
  const outreachStatus = classifyOutreachUiStatus({
    reviewStatus: s.reviewStatus,
    publicationStatus: s.publicationStatus,
    outreachCandidate: isOutreachCandidate(priority),
  });
  const dataSummary = formatDataCollectionSummary({
    personalCount: s.personalInfoQuestionCount,
    sensitiveCount: s.sensitiveQuestionCount,
    highRiskCount: s.highRiskQuestionCount,
    hasPersonalInfo: s.hasPersonalInfo,
    hasSensitiveInfo: s.hasSensitiveInfo,
    hasHighRiskInfo: s.hasHighRiskInfo,
    categoryLabels,
  });
  const problems =
    issueBadges.length > 0
      ? issueBadges.map((b) => `- ${b}`).join("\n")
      : "- 자동진단 기준 주요 고지 미흡 항목을 확인하세요.";

  const body = [
    wPara("SURE Check 설문 개인정보 수집 검토 리포트", { heading: true }),
    wBlank(),
    wPara("1. 설문 기본정보", { heading: true }),
    wPara(`- 기관/기업명: ${s.operatorName || "미확인"}`),
    wPara(`- 공공/민간 구분: ${publicPrivateKo(s.publicPrivateType)}`),
    wPara(`- 설문 제목: ${s.surveyTitle || "제목 없음"}`),
    wPara(`- 설문 URL: ${s.surveyUrl || "원본 URL 없음"}`),
    wPara(`- 진단일: ${s.observedDateKst}`),
    wPara(`- 플랫폼: ${s.platform}`),
    wBlank(),
    wPara("2. 자동진단 요약", { heading: true }),
    wPara(`- 위험도: ${riskLabelKo(s.overallRiskLevel)}`),
    wPara(`- 점수: ${s.score == null ? "—" : String(s.score)}`),
    wPara(`- 개선안내 우선순위: ${priority}`),
    wPara(`- 개선안내 상태: ${outreachUiStatusKo(outreachStatus)}`),
    wPara(`- 개인정보 포함 여부: ${s.hasPersonalInfo ? "있음" : "없음"}`),
    wPara(`- 민감정보 포함 여부: ${s.hasSensitiveInfo ? "있음" : "없음"}`),
    wPara(`- 고위험정보 포함 여부: ${s.hasHighRiskInfo ? "있음" : "없음"}`),
    wPara(`- 응답 판단: ${s.userDecisionLabel || "—"}`),
    wBlank(),
    wPara("3. 주요 문제", { heading: true }),
    wPara(problems),
    wBlank(),
    wPara("4. 수집 정보", { heading: true }),
    wPara(
      `- 탐지된 개인정보 유형: ${categoryLabels.length > 0 ? categoryLabels.join(", ") : "확인 필요"}`,
    ),
    wPara(dataSummary),
    wPara(`- 개인정보 문항 수: ${s.personalInfoQuestionCount}`),
    wPara(`- 민감정보 문항 수: ${s.sensitiveQuestionCount}`),
    wPara(`- 고위험정보 문항 수: ${s.highRiskQuestionCount}`),
    wBlank(),
    wPara("5. 개선 권고", { heading: true }),
    wPara(checks.map((item) => `- ${item}`).join("\n")),
    wBlank(),
    wPara("6. 공문용 개선 요청 문구", { heading: true }),
    wPara(copy.letterSummary),
    wBlank(),
    wPara("7. 유의사항", { heading: true }),
    wPara("- 본 리포트는 공개 설문 화면에 대한 자동진단 기반 검토 자료입니다."),
    wPara("- 개별 설문의 위법 여부를 확정하는 자료가 아닙니다."),
    wPara(
      "- 최종 판단은 기관의 사실관계 확인 및 관련 법령 검토에 따라 달라질 수 있습니다.",
    ),
    "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr>",
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
