import type { ScanReport, DetectedCategory } from "@/lib/types/scan";
import type { AudienceReport } from "@/lib/reporting/reportMessages";
import { CATEGORY_LABELS } from "@/lib/reporting/reportMessages";
import {
  buildAppliedLegalBasis,
  buildDiagnosisLimitations,
  buildNoticeCheckEvidence,
} from "@/lib/reporting/buildDetailedEvidenceSummary";
import { classifyPrivacyDataType } from "@/lib/reporting/respondentDecision";
import { getDetectedCategoryDisplayLabel } from "@/lib/extractors/htmlTextUtils";
import { extractPrivacyNoticeRaw } from "@/lib/reporting/noticeCorpusChecks";
import {
  EVIDENCE_DISCLAIMER,
  MAX_SOURCE_EXCERPT_BYTES,
  type EvidenceDataItem,
  type EvidenceLegalGround,
  type EvidenceNoticeCheck,
  type EvidencePrivacyNotice,
  type EvidenceQuestion,
  type EvidenceRiskCategory,
  type EvidenceSource,
  type ReportEvidenceModel,
} from "@/lib/evidence/evidenceTypes";
import {
  formatKstDateTime,
  truncateText,
} from "@/lib/evidence/sanitizeFilename";

const DIRECT = new Set<DetectedCategory>([
  "name",
  "phone",
  "email",
  "address",
  "birthdate",
]);
const QUASI = new Set<DetectedCategory>([
  "gender",
  "respondent_age",
  "age_range",
  "child_age_range",
  "residence_area",
  "affiliation",
  "organization_identifier",
  "department",
  "position",
  "tenure",
  "quasi_identifier",
]);
const SENSITIVE = new Set<DetectedCategory>([
  "sensitive_health",
  "sensitive_belief_union",
  "sensitive_complaint",
  "sensitive_political",
  "sensitive_religion",
]);
const HIGH_RISK = new Set<DetectedCategory>([
  "unique_identifier",
  "financial",
  "resident_registration_number",
  "passport_number",
  "driver_license_number",
  "foreign_registration_number",
  "id_document",
  "financial_account",
  "authentication_secret",
]);

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isPrivacyConsentQuestion(question: {
  type: string;
  riskTags?: string[];
}): boolean {
  return (
    question.type === "privacy_consent" ||
    Boolean(question.riskTags?.includes("privacy_consent"))
  );
}

function riskCategoryFor(
  category: DetectedCategory,
): EvidenceRiskCategory | null {
  if (DIRECT.has(category)) return "직접식별정보";
  if (QUASI.has(category)) return "준식별정보";
  if (SENSITIVE.has(category)) return "민감정보";
  if (HIGH_RISK.has(category)) return "고위험정보";
  return null;
}

function riskReason(category: EvidenceRiskCategory): string {
  switch (category) {
    case "직접식별정보":
      return "개인을 직접 식별할 수 있음";
    case "준식별정보":
      return "다른 정보와 결합 시 식별 가능성이 있음";
    case "민감정보":
      return "민감정보로 별도 보호·동의 확인이 필요할 수 있음";
    case "고위험정보":
      return "고유식별·금융 등 고위험 개인정보로 보호 강화가 필요할 수 있음";
    default:
      return "개인정보 관련 확인이 필요할 수 있음";
  }
}

function platformLabel(report: ScanReport): string {
  switch (report.platform) {
    case "google_forms":
      return "Google Forms";
    case "naver_forms":
      return "Naver Form";
    case "moaform":
      return "Moaform";
    case "wiseon_csap":
      return "WiseON";
    default:
      return report.form.metadata?.source?.detectedToolFromText || "기타/미확인";
  }
}

function sourceLabel(report: ScanReport): string {
  const kind = report.form.metadata?.source?.kind;
  if (kind === "file") return "파일 진단 문항 데이터";
  switch (report.platform) {
    case "google_forms":
      return "Google Forms 문항 데이터";
    case "naver_forms":
      return "Naver Form 문항 데이터";
    case "moaform":
      return "Moaform 문항 데이터";
    default:
      return "HTML/문항 추출 데이터";
  }
}

function resolveOperatorName(report: ScanReport, audience: AudienceReport): {
  operatorName: string;
  subjectEvidence: string;
} {
  const matched = report.debug?.publicInstitutionEvidence?.matchedName?.trim();
  if (matched && matched !== "공공기관") {
    const method = report.debug?.publicInstitutionEvidence?.matchedBy;
    const methodLabel =
      method === "exact_list"
        ? "공공기관 리스트 exact match"
        : method === "alias"
          ? "기관명 별칭"
          : method === "keyword_fallback"
            ? "기관명 키워드"
            : "공공 맥락";
    return {
      operatorName: matched,
      subjectEvidence: `설문 제목 또는 고지문에서 「${matched}」 명칭 확인 (${methodLabel})`,
    };
  }

  const hint = report.form.metadata?.operatorHint?.trim();
  if (hint && hint !== "공공기관" && !/^미확인/.test(hint)) {
    return {
      operatorName: hint.replace(/\s*\(확인 필요\)\s*$/, ""),
      subjectEvidence: `운영기관 힌트에서 「${hint}」 확인`,
    };
  }

  const fromTitle = report.form.title.match(
    /([가-힣A-Za-z0-9]+(?:공사|공단|재단|원|청|시|군|구|대학|병원|협회|센터))/,
  );
  if (fromTitle?.[1]) {
    return {
      operatorName: fromTitle[1],
      subjectEvidence: `설문 제목에서 「${fromTitle[1]}」 명칭 확인`,
    };
  }

  const label = audience.safetyType.subjectLabel;
  if (label && label !== "공공기관" && label !== "공공기관 가능성") {
    return {
      operatorName: label.replace(/\s*\(확인 필요\)\s*$/, ""),
      subjectEvidence: "설문 주체 라벨 기반",
    };
  }

  return {
    operatorName: "확인 불가",
    subjectEvidence: "운영기관명을 충분히 확인하지 못함",
  };
}

function answerableQuestions(report: ScanReport) {
  return report.form.questions.filter((q) => !isPrivacyConsentQuestion(q));
}

function buildDetectedQuestions(report: ScanReport): EvidenceQuestion[] {
  const rows: EvidenceQuestion[] = [];
  let displayIndex = 0;
  for (const question of answerableQuestions(report)) {
    displayIndex += 1;
    const text = question.questionText ?? question.label;
    const categories = (question.detectedCategories ?? []).filter((c) =>
      Boolean(riskCategoryFor(c)),
    );
    if (categories.length === 0 && !question.hasPersonalData) continue;

    const primary = categories[0];
    const detectedDataType = primary
      ? getDetectedCategoryDisplayLabel(primary, text) ||
        CATEGORY_LABELS[primary] ||
        primary
      : question.personalDataTypes?.[0] || "개인정보 관련";
    const riskCategory =
      (primary && riskCategoryFor(primary)) ||
      (question.dataRiskLevel === "D5"
        ? "고위험정보"
        : question.dataRiskLevel === "D4"
          ? "민감정보"
          : question.dataRiskLevel === "D3"
            ? "직접식별정보"
            : question.dataRiskLevel === "D2"
              ? "준식별정보"
              : "기타");

    if (riskCategory === "기타") continue;

    rows.push({
      questionNumber: `Q${displayIndex}`,
      questionText: text,
      detectedDataType,
      riskCategory,
      matchedKeyword: detectedDataType,
      source: sourceLabel(report),
      confidence:
        report.confidence === "high" || report.confidence === "medium"
          ? report.confidence
          : "medium",
    });
  }
  return rows;
}

function buildDataItems(
  questions: EvidenceQuestion[],
  summary: AudienceReport["collectedDataSummary"],
): EvidenceDataItem[] {
  const groups: Array<{
    items: string[];
    category: EvidenceRiskCategory;
  }> = [
    { items: summary.directIdentifiers, category: "직접식별정보" },
    { items: summary.quasiIdentifiers, category: "준식별정보" },
    { items: summary.sensitiveItems, category: "민감정보" },
    { items: summary.highRiskItems, category: "고위험정보" },
  ];

  return groups.flatMap(({ items, category }) =>
    unique(items).map((dataItem) => {
      const matched = questions.filter(
        (q) =>
          q.riskCategory === category &&
          (q.detectedDataType.includes(dataItem) ||
            q.questionText.includes(dataItem) ||
            dataItem.includes(q.detectedDataType)),
      );
      return {
        dataItem,
        category,
        examples: dataItem,
        detectedQuestions:
          matched.map((q) => q.questionNumber).join(", ") ||
          questions
            .filter((q) => q.riskCategory === category)
            .map((q) => q.questionNumber)
            .slice(0, 5)
            .join(", "),
        riskReason: riskReason(category),
      };
    }),
  );
}

function isMissingStatus(status: string): boolean {
  return status.includes("미확인") || status.includes("부족");
}

function buildCoreReasons(
  report: ScanReport,
  audience: AudienceReport,
  noticeChecks: EvidenceNoticeCheck[],
): string[] {
  const reasons: string[] = [];
  const subject = audience.safetyType.subjectType;
  const summary = audience.collectedDataSummary;
  const publicLike =
    subject === "public_agency" ||
    subject === "public_commissioned_private" ||
    subject === "school_local";
  const external =
    report.platform === "google_forms" ||
    report.platform === "naver_forms" ||
    report.platform === "moaform" ||
    report.platform === "generic";
  const tool = platformLabel(report);

  const missingBy = (pattern: RegExp) =>
    noticeChecks.some((n) => pattern.test(n.item) && isMissingStatus(n.status));
  const confirmedBy = (pattern: RegExp) =>
    noticeChecks.some(
      (n) => pattern.test(n.item) && n.status.includes("확인됨"),
    );

  if (publicLike && external && summary.directIdentifiers.length > 0) {
    reasons.push(
      `공공기관이 ${summary.directIdentifiers.slice(0, 2).join("·") || "직접식별정보"} 등 직접식별정보를 외부 설문도구인 ${tool}으로 수집하고 있음`,
    );
    reasons.push("공공기관 개인정보 설문에 외부 설문도구 사용");
  }

  if (publicLike && external && summary.directIdentifiers.length > 0) {
    reasons.push("CSAP 등 공공부문 클라우드 보안 기준 확인 필요");
  }

  if (missingBy(/위탁|외부도구/)) {
    reasons.push("위탁 또는 외부도구 처리 기준 확인 필요");
  }

  if (missingBy(/원자료|접근/)) {
    reasons.push("원자료 접근권한 및 안전성 확보조치 확인 필요");
  }

  if (missingBy(/담당|문의/)) {
    reasons.push("담당부서 또는 문의처가 고지문에서 충분히 확인되지 않음");
  }

  // 고지 핵심 항목이 실제로 미확인일 때만 고지 부족 사유 추가
  const coreNoticeMissing =
    (missingBy(/^수집 목적/) && !confirmedBy(/^수집 목적/)) ||
    (missingBy(/^수집 항목/) && !confirmedBy(/^수집 항목/)) ||
    (missingBy(/^보유기간/) && !confirmedBy(/^보유기간/)) ||
    (missingBy(/^파기/) && !confirmedBy(/^파기/)) ||
    (missingBy(/거부권/) && !confirmedBy(/거부권/));

  // 위 항목들이 대부분 확인된 경우에는 “고지 부족” 사유를 넣지 않음
  const coreConfirmedCount = [
    confirmedBy(/^수집 목적/),
    confirmedBy(/^수집 항목/),
    confirmedBy(/^보유기간/),
    confirmedBy(/^파기/),
    confirmedBy(/거부권/),
  ].filter(Boolean).length;

  if (coreNoticeMissing && coreConfirmedCount < 3) {
    reasons.push("개인정보 수집 고지 부족");
  }

  if (summary.sensitiveItems.length > 0 || summary.highRiskItems.length > 0) {
    reasons.push("민감정보 또는 고위험정보 수집");
  }

  if (
    report.platform === "google_forms" &&
    missingBy(/국외/)
  ) {
    reasons.push("국외이전 안내 미확인");
  }

  // 사실과 다른 개별 미확인 사유는 확인된 경우 넣지 않음 (위 조건으로 차단)

  return unique(reasons).slice(0, 8);
}

function buildExtractionSources(
  report: ScanReport,
  generatedAt: string,
  privacyNotice: EvidencePrivacyNotice,
  detectedQuestions: EvidenceQuestion[],
): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  const answerable = answerableQuestions(report);
  const questionsPayload = answerable.map((q, index) => ({
    questionNumber: `Q${index + 1}`,
    questionText: q.questionText ?? q.label,
    type: q.type,
    required: q.required,
    detectedCategories: q.detectedCategories ?? [],
    personalDataTypes: q.personalDataTypes ?? [],
    semanticCategories: q.semanticCategories ?? [],
  }));

  sources.push({
    type: report.form.metadata?.source?.kind === "file" ? "file_text" : "json",
    label: "extracted_questions.json",
    extractedAt: generatedAt,
    excerpt: truncateText(
      JSON.stringify(questionsPayload, null, 2),
      MAX_SOURCE_EXCERPT_BYTES,
    ),
  });

  sources.push({
    type: privacyNotice.source,
    label: "extracted_notice.txt",
    extractedAt: generatedAt,
    excerpt: truncateText(
      privacyNotice.rawText ||
        "진단 당시 공개 화면에서 개인정보 고지문 원문을 충분히 확인하지 못했습니다.",
      MAX_SOURCE_EXCERPT_BYTES,
    ),
  });

  const sourceKind = report.form.metadata?.source?.kind ?? "url";
  const excerptLines = [
    `진단 방식: ${sourceKind === "file" ? "파일 진단" : "링크 진단"}`,
    `입력 URL: ${report.debug?.inputUrl || report.formUrl || "(없음)"}`,
    `최종 URL: ${report.debug?.finalUrl || report.form.url || "(없음)"}`,
    `플랫폼: ${platformLabel(report)}`,
    `추출기: ${report.debug?.extractorName || report.form.metadata?.extractionMethod || "미확인"}`,
    `전체 문항 수(고지문 제외): ${answerable.length}`,
    `개인정보 탐지 문항 수: ${detectedQuestions.length}`,
    `고지문 확인: ${privacyNotice.detectedItems.join(", ") || "항목 미확인"}`,
  ];
  if (sourceKind === "file") {
    excerptLines.push(
      `파일명: ${report.form.metadata?.source?.fileName || "(미확인)"}`,
      `확장자: ${report.form.metadata?.source?.fileExtension || "(미확인)"}`,
      `추출 상태: ${report.form.metadata?.source?.extractionStatus || "(미확인)"}`,
    );
  }
  sources.push({
    type: sourceKind === "file" ? "file_text" : "html",
    label: "extracted_source_excerpt.txt",
    extractedAt: generatedAt,
    excerpt: excerptLines.join("\n"),
  });

  return sources;
}

function legalReviewNote(entry: {
  id: string;
  label: string;
  description: string;
}): string {
  if (entry.id === "PIPA_ART_15") {
    return "수집·이용 목적, 수집 항목, 보유기간, 동의 거부권 등 안내 확인이 필요할 수 있음";
  }
  if (entry.id === "PIPA_ART_21") {
    return "목적 달성 후 파기 기준 확인이 필요할 수 있음";
  }
  if (entry.id === "PIPA_ART_23") {
    return "민감정보 처리 시 별도 보호·동의 확인이 필요할 수 있음";
  }
  if (entry.id === "PIPA_ART_24") {
    return "고유식별정보 처리 제한 및 보호 조치 확인이 필요할 수 있음";
  }
  if (entry.id === "PIPA_ART_26") {
    return "외부 위탁 처리 시 안내 및 관리 확인이 필요할 수 있음";
  }
  if (entry.id === "PIPA_ART_28_8") {
    return "국외이전 관련 안내 확인이 필요할 수 있음";
  }
  if (entry.id === "PIPA_ART_29") {
    return "안전성 확보조치 확인이 필요할 수 있음";
  }
  if (entry.id === "CSAP_PUBLIC_CLOUD") {
    return "공공부문 클라우드 서비스 이용 시 보안 기준 확인이 필요할 수 있음";
  }
  if (entry.id === "MOIS_PUBLIC_CLOUD_NOTICE") {
    return "공공기관 클라우드 이용 시 보안 적정성 확인이 필요할 수 있음";
  }
  if (entry.id === "NIS_SECURITY_REVIEW") {
    return "공공기관 정보시스템 또는 클라우드 이용 시 보안성 검토 필요 가능성이 있음";
  }
  return `${entry.description.replace(/입니다\.?$/, "")} 확인이 필요할 수 있음`;
}

/**
 * 신고용 증빙 ZIP 생성용 구조화 데이터.
 * 공개 UI에는 raw JSON으로 노출하지 않습니다.
 */
export function buildReportEvidenceModel(
  report: ScanReport,
  audience: AudienceReport,
): ReportEvidenceModel {
  const now = new Date();
  const generatedAt = now.toISOString();
  const generatedAtKst = formatKstDateTime(now);
  const summary = audience.collectedDataSummary;
  const privacyType = classifyPrivacyDataType(report, summary);
  const noticeBundle = buildNoticeCheckEvidence(report, privacyType, summary);
  const noticeChecks: EvidenceNoticeCheck[] = noticeBundle.allRows.map(
    (row) => ({
      item: row.item,
      status: row.statusLabel,
      evidence: row.evidence,
    }),
  );
  const legalEntries = buildAppliedLegalBasis(report, summary, privacyType);
  const legalGrounds: EvidenceLegalGround[] = legalEntries.map((entry) => ({
    label: entry.label,
    shortTitle: entry.shortTitle,
    reviewNote: legalReviewNote(entry),
  }));
  const detectedQuestions = buildDetectedQuestions(report);
  const detectedDataItems = buildDataItems(detectedQuestions, summary);
  const sourceKind =
    report.form.metadata?.source?.kind === "file" ? "file" : "url";
  const { operatorName, subjectEvidence } = resolveOperatorName(
    report,
    audience,
  );
  const privacyRaw = extractPrivacyNoticeRaw(report.form);
  const privacyNotice: EvidencePrivacyNotice = {
    rawText: privacyRaw.rawText,
    source: privacyRaw.source,
    detectedItems: privacyRaw.detectedItems,
    noticeChecks,
  };
  const answerable = answerableQuestions(report);
  const limitations = [
    ...buildDiagnosisLimitations(report, audience.isLimited),
    "자동 진단 결과입니다.",
    "원문이 수정되거나 설문이 종료되면 현재 링크에서 확인이 어려울 수 있습니다.",
    "화면 캡처가 없는 뒷페이지 문항은 문항 원문·원본 데이터 기반으로 확인했습니다.",
    "최종 위법 여부는 신고기관의 검토·조사 결과에 따라 판단됩니다.",
  ];

  return {
    packageVersion: "1.1.0",
    diagnosisId: report.scanId,
    generatedAt,
    generatedAtKst,
    surveyTitle: report.form.title || "제목 미확인 설문",
    surveyUrl:
      sourceKind === "url"
        ? report.debug?.inputUrl || report.formUrl || report.form.url || ""
        : "",
    finalUrl:
      report.debug?.finalUrl ||
      report.form.url ||
      (sourceKind === "url" ? report.formUrl : ""),
    sourceType: sourceKind,
    fileName: report.form.metadata?.source?.fileName,
    toolName: audience.safetyType.toolBadge || platformLabel(report),
    operatorName,
    subjectType: audience.safetyType.subjectType,
    subjectEvidence,
    userDecision: audience.safetyType.displayName,
    internalVerdict: audience.respondentDecision,
    diagnosisMethod:
      sourceKind === "file"
        ? "파일 진단"
        : audience.safetyType.diagnosisMethodLabel || "링크 진단",
    coreReasons: buildCoreReasons(report, audience, noticeChecks),
    detectedPersonalDataItems: unique([
      ...summary.directIdentifiers,
      ...summary.quasiIdentifiers,
    ]),
    detectedSensitiveDataItems: unique(summary.sensitiveItems),
    detectedHighRiskDataItems: unique(summary.highRiskItems),
    totalQuestionCount: answerable.length,
    detectedPersonalDataQuestionCount: detectedQuestions.filter(
      (q) =>
        q.riskCategory === "직접식별정보" || q.riskCategory === "준식별정보",
    ).length,
    detectedSensitiveQuestionCount: detectedQuestions.filter(
      (q) => q.riskCategory === "민감정보",
    ).length,
    detectedHighRiskQuestionCount: detectedQuestions.filter(
      (q) => q.riskCategory === "고위험정보",
    ).length,
    detectedQuestions,
    detectedDataItems,
    noticeChecks,
    privacyNotice,
    legalGrounds,
    extractionSources: buildExtractionSources(
      report,
      generatedAt,
      privacyNotice,
      detectedQuestions,
    ),
    noticeExcerpt: truncateText(
      privacyNotice.rawText ||
        "진단 당시 공개 화면에서 개인정보 수집·이용 고지문 원문을 충분히 확인하지 못했습니다.",
      MAX_SOURCE_EXCERPT_BYTES,
    ),
    limitations: unique(limitations),
    disclaimer: EVIDENCE_DISCLAIMER,
  };
}

export function shouldShowEvidenceActionPanel(
  audience: AudienceReport,
): boolean {
  if (audience.isLimited) return false;
  if (audience.safetyType.typeId === "JUDGMENT_UNKNOWN") return false;
  if (audience.safetyType.typeId === "STOP_RESPONSE") return true;
  return (
    audience.respondentDecision === "DO_NOT_RESPOND" ||
    audience.respondentDecision === "REPORT_OR_INQUIRE"
  );
}
